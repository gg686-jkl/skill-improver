import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill, SkillCandidate, Review } from "./types.js";
import { loadSkill } from "./router.js";
import { callLLM } from "./llm.js";
import { writeJSON, ensureDir } from "./file-utils.js";


function debugLog(msg: string): void {
  try {
    const fs = require("node:fs"); const path = require("node:path");
    const p = path.resolve(process.cwd(), "data", "debug.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] [UPDATE] ${msg}\n`, "utf-8");
  } catch {}
}

// ============================================================================
// Skill Candidate Updater
// ============================================================================

interface LLMOutput {
  /** Updated SKILL.md content (full markdown with frontmatter) */
  content: string;
  /** Summary of changes made */
  summary: string;
}

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description: "The complete updated SKILL.md content including YAML frontmatter",
    },
    summary: {
      type: "string",
      description: "Summary of changes made to the skill",
    },
  },
  required: ["content", "summary"],
};

// ============================================================================
// Prompt builder
// ============================================================================

function buildPrompt(skill: Skill, consolidatedRules: string[]): string {
  const skillBody = skill.body ?? "(No skill body available)";

  const newRulesText =
    consolidatedRules.length > 0
      ? consolidatedRules.map((r, i) => `  ${i + 1}. ${r}`).join("\n")
      : "  (none)";

  return `You are a skill editor. Given the current SKILL.md content and a set of consolidated rules from recent observations, produce an updated SKILL.md file.

## Current SKILL.md Content
\`\`\`
${skillBody}
\`\`\`

## Consolidated Rules from Observations
${newRulesText}

## Instructions
1. Preserve the YAML frontmatter (between --- delimiters) exactly as-is, unless the consolidated rules require metadata changes.
2. Update the markdown body to incorporate the consolidated rules.
3. Keep existing content that is still relevant and useful.
4. Remove or update sections that are contradicted or superseded by the consolidated rules.
5. Add new sections if the consolidated rules suggest new guidance.
6. Maintain the same markdown structure and formatting style.
7. Return the COMPLETE updated SKILL.md file (frontmatter + body).

Respond with JSON containing: content (the full SKILL.md text), summary (description of changes).`;
}

// ============================================================================
// Diff generator
// ============================================================================

function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const diffLines: string[] = [];
  diffLines.push("--- Old SKILL.md");
  diffLines.push("+++ New SKILL.md");

  // Simple line-by-line diff
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === undefined) {
      diffLines.push(`+ ${newLine}`);
    } else if (newLine === undefined) {
      diffLines.push(`- ${oldLine}`);
    } else if (oldLine !== newLine) {
      diffLines.push(`- ${oldLine}`);
      diffLines.push(`+ ${newLine}`);
    }
  }

  return diffLines.join("\n");
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a new skill candidate by merging consolidated rules into the existing SKILL.md.
 *
 * - Loads the old skill via `loadSkill(skillId)`
 * - Calls LLM with old SKILL.md body + consolidated rules to produce updated content
 * - Saves candidate to `data/candidates/{skillId}-{timestamp}/SKILL.md`
 * - Creates review record at `data/reviews/{reviewId}.json`
 * - Returns the SkillCandidate, or null if the old skill is not found or LLM fails
 */
export async function generateCandidate(
  skillId: string,
  consolidatedRules: string[]
): Promise<SkillCandidate | null> {
  debugLog("Generating candidate for: " + skillId);
  const oldSkill = loadSkill(skillId);
  if (!oldSkill) {
    return null;
  }

  const prompt = buildPrompt(oldSkill, consolidatedRules);
  const rawResult = await callLLM(prompt);
  if (!rawResult) { debugLog("Candidate LLM returned null"); return null; }
  let result: LLMOutput;
  try {
    const parsed = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
    if (!parsed?.content) { debugLog("Candidate LLM missing content"); return null; }
    result = parsed;
  } catch { debugLog("Candidate JSON parse failed"); return null; }
  debugLog("Candidate generated: yes");
  if (!result || !result.content) {
    return null;
  }

  const timestamp = Date.now();
  const isoTimestamp = new Date(timestamp).toISOString();
  const candidateDirName = `${skillId}-${timestamp}`;
  const reviewId = `rev_${skillId}_${timestamp}`;

  // Resolve paths relative to project root
  const candidatesDir = path.resolve(process.cwd(), "data", "candidates");
  const candidateDir = path.join(candidatesDir, candidateDirName);
  const candidatePath = path.join(candidateDir, "SKILL.md");

  const reviewsDir = path.resolve(process.cwd(), "data", "reviews");
  const reviewPath = path.join(reviewsDir, `${reviewId}.json`);

  let candidateContent = result.content;
  // Prepend old frontmatter to candidate content
  const oldRaw = fs.readFileSync(oldSkill.path, "utf-8");
  const fmMatch = oldRaw.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch && !candidateContent.startsWith("---")) {
    candidateContent = "---\n" + fmMatch[1] + "\n---\n\n" + candidateContent;
  }

  ensureDir(candidateDir);
  fs.writeFileSync(candidatePath, candidateContent, "utf-8");

  // Generate diff
  const oldContent = oldSkill.body ?? "";
  const diff = generateDiff(oldContent, result.content);

  // Create and save review record
  const review: Review = {
    reviewId,
    skillId,
    status: "pending",
    oldPath: oldSkill.path,
    candidatePath,
    diff,
    createdAt: isoTimestamp,
  };

  ensureDir(reviewsDir);
  writeJSON(reviewPath, review);

  // Return SkillCandidate
  const candidate: SkillCandidate = {
    skillId,
    reviewId,
    oldPath: oldSkill.path,
    candidatePath,
    diff,
    timestamp: isoTimestamp,
  };

  return candidate;
}
