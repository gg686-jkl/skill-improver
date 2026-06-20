import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Episode, Skill, SkillFrontmatter, MonitoredSkillsConfig } from "./types.js";
import { readJSON } from "./file-utils.js";

const debugLog = (msg: string) => { try { const fs = require('fs'); const path = require('path'); const p = path.resolve(process.cwd(), 'data', 'debug.log'); fs.appendFileSync(p, `[${new Date().toISOString()}] [ROUTER] ${msg}\n`, 'utf-8'); } catch {} };

// ============================================================================
// Constants
// ============================================================================

const PROJECT_SKILLS_DIR = path.resolve(process.cwd(), ".opencode", "skills");
const GLOBAL_SKILLS_DIR = path.join(os.homedir(), ".config", "opencode", "skills");
const MONITORED_SKILLS_PATH = path.resolve(process.cwd(), "config", "monitored-skills.json");

// ============================================================================
// Frontmatter parser (minimal YAML frontmatter)
// ============================================================================

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }

  const fmText = fmMatch[1];
  const body = fmMatch[2].trim();
  const frontmatter: SkillFrontmatter = {};

  // Simple YAML key-value parser for frontmatter
  const lines = fmText.split("\n");
  let currentKey = "";
  let currentValue = "";
  let inMultiline = false;

  for (const line of lines) {
    if (inMultiline) {
      if (line.startsWith("  ") || line.startsWith("\t")) {
        currentValue += "\n" + line.trimStart();
        continue;
      } else {
        // End of multiline
        frontmatter[currentKey] = currentValue.trim();
        inMultiline = false;
      }
    }

    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === "|" || value === ">") {
        // Multiline indicator
        inMultiline = true;
        currentValue = "";
      } else if (value === "") {
        // Could be multiline or empty
        inMultiline = true;
        currentValue = "";
      } else {
        // Single-line value - strip quotes
        frontmatter[currentKey] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  // Handle last multiline
  if (inMultiline && currentKey) {
    frontmatter[currentKey] = currentValue.trim();
  }

  return { frontmatter, body };
}

// ============================================================================
// Skill directory scanning
// ============================================================================

interface SkillDirEntry {
  id: string;
  dirPath: string;
  location: "project" | "global";
}

function scanSkillDirectory(dirPath: string, location: "project" | "global"): SkillDirEntry[] {
  const entries: SkillDirEntry[] = [];

  if (!fs.existsSync(dirPath)) {
    return entries;
  }

  const dirs = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;

    const skillDir = path.join(dirPath, dir.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (fs.existsSync(skillMdPath)) {
      entries.push({
        id: dir.name,
        dirPath: skillDir,
        location,
      });
    }
  }

  return entries;
}

function loadMonitoredSkills(): Set<string> {
  const config = readJSON<MonitoredSkillsConfig>(MONITORED_SKILLS_PATH);
  return new Set(config?.skills ?? []);
}

// ============================================================================
// Skill loading
// ============================================================================

function loadSkillFromDir(entry: SkillDirEntry): Skill | null {
  const skillMdPath = path.join(entry.dirPath, "SKILL.md");

  try {
    const content = fs.readFileSync(skillMdPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    // Load sub-skills (directories within the skill directory)
    const subSkills: Skill[] = [];
    const subDirs = fs.readdirSync(entry.dirPath, { withFileTypes: true });
    for (const subDir of subDirs) {
      if (!subDir.isDirectory()) continue;
      const subSkillMd = path.join(entry.dirPath, subDir.name, "SKILL.md");
      if (fs.existsSync(subSkillMd)) {
        const subEntry: SkillDirEntry = {
          id: `${entry.id}/${subDir.name}`,
          dirPath: path.join(entry.dirPath, subDir.name),
          location: entry.location,
        };
        const subSkill = loadSkillFromDir(subEntry);
        if (subSkill) {
          subSkills.push(subSkill);
        }
      }
    }

    // Extract metadata from frontmatter
    const metadata: Record<string, unknown> = {};
    if (frontmatter.metadata) {
      // metadata could be a string (JSON) or object
      const rawMeta = frontmatter.metadata;
      if (typeof rawMeta === "string") {
        try {
          Object.assign(metadata, JSON.parse(rawMeta));
        } catch {
          metadata.raw = rawMeta;
        }
      } else if (typeof rawMeta === "object" && rawMeta !== null) {
        Object.assign(metadata, rawMeta);
      }
    }
    if (frontmatter.homepage) {
      metadata.homepage = frontmatter.homepage;
    }

    // Build triggers from frontmatter triggers field
    const triggers: string[] = [];
    if (frontmatter.triggers) {
      if (Array.isArray(frontmatter.triggers)) {
        triggers.push(...frontmatter.triggers);
      } else if (typeof frontmatter.triggers === 'string') {
        // Parse multiline string as YAML array (split by "- " prefix)
        const items = frontmatter.triggers
          .split('\n')
          .map(s => s.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean);
        triggers.push(...items);
      }
    }
    // Also add skill name as trigger
    if (frontmatter.name) {
      triggers.push(frontmatter.name);
    }

    return {
      id: entry.id,
      name: (frontmatter.name as string) ?? entry.id,
      description: frontmatter.description as string | undefined,
      path: skillMdPath,
      location: entry.location,
      metadata,
      body,
      subSkills: subSkills.length > 0 ? subSkills : undefined,
      triggers,
      rules: [],
      antiPatterns: [],
      examples: [],
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Route an episode to a matching skill based on message content.
 * Reads OpenCode skill directories (project first, then global).
 * Uses monitored-skills.json to filter which skills to consider.
 * Returns the matching skill ID, or null if no match.
 */
export function route(episode: Episode): string | null {
  const monitored = loadMonitoredSkills();
  debugLog(`Monitored skills: ${JSON.stringify([...monitored])}`);
  const allSkills: SkillDirEntry[] = [
    ...scanSkillDirectory(PROJECT_SKILLS_DIR, "project"),
    ...scanSkillDirectory(GLOBAL_SKILLS_DIR, "global"),
  ];
  debugLog(`All skills found: ${JSON.stringify(allSkills.map(s => s.id))}`);

  // Filter to monitored skills only
  const filteredSkills = allSkills.filter((s) => monitored.has(s.id));
  debugLog(`Filtered skills: ${JSON.stringify(filteredSkills.map(s => s.id))}`);

  // Match against episode messages
  for (const entry of filteredSkills) {
    const skill = loadSkillFromDir(entry);
    if (!skill) continue;
    debugLog(`Skill ${skill.id} triggers: ${JSON.stringify(skill.triggers)}`);

    for (const trigger of skill.triggers) {
    debugLog(`Checking ${episode.messages.length} messages against triggers`);
      const triggerLower = trigger.toLowerCase();
      for (const message of episode.messages) {
        if (message.toLowerCase().includes(triggerLower)) {
          return skill.id;
        }
      }
    }
  }

  return null;
}

/**
 * Load a skill definition by ID from the OpenCode skill directories.
 * Searches project directory first, then global directory.
 * Returns a fully populated Skill object, or null if not found.
 */
export function loadSkill(skillId: string): Skill | null {
  // Try project directory first
  const projectEntry: SkillDirEntry = {
    id: skillId,
    dirPath: path.join(PROJECT_SKILLS_DIR, skillId),
    location: "project",
  };
  const projectSkill = loadSkillFromDir(projectEntry);
  if (projectSkill) return projectSkill;

  // Try global directory
  const globalEntry: SkillDirEntry = {
    id: skillId,
    dirPath: path.join(GLOBAL_SKILLS_DIR, skillId),
    location: "global",
  };
  return loadSkillFromDir(globalEntry);
}

/**
 * List all available skills from OpenCode skill directories.
 * Returns skills from project directory first, then global.
 */
export function listAllSkills(): Skill[] {
  const allEntries: SkillDirEntry[] = [
    ...scanSkillDirectory(PROJECT_SKILLS_DIR, "project"),
    ...scanSkillDirectory(GLOBAL_SKILLS_DIR, "global"),
  ];

  const skills: Skill[] = [];
  const seen = new Set<string>();

  for (const entry of allEntries) {
    if (seen.has(entry.id)) continue;
    const skill = loadSkillFromDir(entry);
    if (skill) {
      skills.push(skill);
      seen.add(entry.id);
    }
  }

  return skills;
}
