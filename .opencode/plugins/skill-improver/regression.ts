import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill, Benchmark } from "./types.js";
import { loadSkill } from "./router.js";
import { callLLMStructured } from "./llm.js";
import { readJSON } from "./file-utils.js";


function debugLog(msg: string): void {
  try {
    const fs = require("node:fs"); const path = require("node:path");
    const p = path.resolve(process.cwd(), "data", "debug.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] [REGRESS] ${msg}\n`, "utf-8");
  } catch {}
}

// ── Scoring schema ──────────────────────────────────────────────────────────

interface ScoreResult {
  passed: boolean;
}

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    passed: {
      type: "boolean",
      description:
        "Whether the response meets all mustInclude requirements",
    },
  },
  required: ["passed"],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildSkillContext(skill: Skill): string {
  const parts: string[] = [`Skill: ${skill.name}`];

  if (skill.description) {
    parts.push(`Description: ${skill.description}`);
  }

  // Include the full SKILL.md body for context
  if (skill.body) {
    parts.push(`\n### SKILL.md Content\n\`\`\`\n${skill.body}\n\`\`\``);
  }

  return parts.join("\n");
}

async function evaluateSkill(
  skill: Skill,
  benchmarks: Benchmark
): Promise<number> {
  let passedCount = 0;

  for (const bench of benchmarks) {
    const prompt = [
      "You are an AI assistant guided by the following skill.",
      "",
      buildSkillContext(skill),
      "",
      `User input: ${bench.input}`,
      "",
      `Your response MUST include these exact substrings: ${JSON.stringify(bench.mustInclude)}`,
      "",
      "Respond as the assistant would, ensuring all required substrings appear in your response.",
    ].join("\n");

    const result = await callLLMStructured<ScoreResult>(prompt, SCORE_SCHEMA);
    if (result && result.passed) {
      passedCount++;
    }
  }

  return benchmarks.length > 0 ? passedCount / benchmarks.length : 0;
}

// ── Load candidate skill from SKILL.md ──────────────────────────────────────

function loadCandidateSkill(candidatePath: string, skillId: string): Skill | null {
  try {
    if (!fs.existsSync(candidatePath)) {
      return null;
    }

    const content = fs.readFileSync(candidatePath, "utf-8");

    // Parse frontmatter to get name and description
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    let name = skillId;
    let description: string | undefined;
    let body = content;

    if (fmMatch) {
      body = fmMatch[2].trim();
      const fmText = fmMatch[1];

      // Extract name
      const nameMatch = fmText.match(/^name:\s*(.+)$/m);
      if (nameMatch) {
        name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
      }

      // Extract description
      const descMatch = fmText.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        description = descMatch[1].trim().replace(/^["']|["']$/g, "");
      }
    }

    return {
      id: skillId,
      name,
      description,
      path: candidatePath,
      location: "custom",
      body,
      triggers: [],
      rules: [],
      antiPatterns: [],
      examples: [],
    };
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate regression: compare an existing skill against a candidate version
 * using benchmark test cases. Returns scores and whether the candidate is
 * better, or null if either skill is missing or evaluation fails.
 */
export async function evaluateRegression(
  skillId: string,
  candidatePath: string
): Promise<{ oldScore: number; newScore: number; better: boolean } | null> {
  debugLog("Evaluating regression for: " + skillId);
  // Load old skill
  const oldSkill = loadSkill(skillId);
  if (!oldSkill) return null;

  // Load new skill from candidate SKILL.md
  const newSkill = loadCandidateSkill(candidatePath, skillId);
  if (!newSkill) return null;

  // Load benchmarks
  const benchmarksPath = path.resolve(process.cwd(), "data", "benchmarks", `${skillId}.json`);
  const rawBenchmarks = readJSON<Benchmark>(benchmarksPath);
  const benchmarks: Benchmark =
    Array.isArray(rawBenchmarks) && rawBenchmarks.length > 0
      ? rawBenchmarks
      : [{ input: "test", mustInclude: ["test"] }];
  debugLog("Benchmarks loaded: " + benchmarks.length);

  // Evaluate both skills
  const oldScore = await evaluateSkill(oldSkill, benchmarks);
  const newScore = await evaluateSkill(newSkill, benchmarks);

  return { oldScore, newScore, better: newScore > oldScore };
}
