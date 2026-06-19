import * as path from "node:path";
import type { Skill, Benchmark } from "./types.js";
import { loadSkill } from "./router.js";
import { callLLMStructured } from "./llm.js";
import { readJSON, readYAML } from "./storage.js";

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

  if (skill.rules.length > 0) {
    parts.push(`Rules:\n${skill.rules.map((r) => `- ${r}`).join("\n")}`);
  }
  if (skill.antiPatterns.length > 0) {
    parts.push(
      `Anti-patterns:\n${skill.antiPatterns.map((a) => `- ${a}`).join("\n")}`
    );
  }
  if (skill.examples.length > 0) {
    parts.push(`Examples:\n${skill.examples.map((e) => `- ${e}`).join("\n")}`);
  }

  return parts.join("\n\n");
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
  // Load old skill
  const oldSkill = loadSkill(skillId);
  if (!oldSkill) return null;

  // Load new skill from candidate YAML
  const yamlData = readYAML<Record<string, unknown>>(candidatePath);
  const newSkill: Skill = {
    id: (yamlData.id as string) ?? skillId,
    name: (yamlData.name as string) ?? skillId,
    path: candidatePath,
    triggers: (yamlData.triggers as string[]) ?? [],
    rules: (yamlData.rules as string[]) ?? [],
    antiPatterns: (yamlData.antiPatterns as string[]) ?? [],
    examples: (yamlData.examples as string[]) ?? [],
  };
  if (!newSkill.id) return null;

  // Load benchmarks
  const benchmarksPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "data",
    "benchmarks",
    `${skillId}.json`
  );
  const rawBenchmarks = readJSON<Benchmark>(benchmarksPath);
  const benchmarks: Benchmark =
    Array.isArray(rawBenchmarks) && rawBenchmarks.length > 0
      ? rawBenchmarks
      : [{ input: "test", mustInclude: ["test"] }];

  // Evaluate both skills
  const oldScore = await evaluateSkill(oldSkill, benchmarks);
  const newScore = await evaluateSkill(newSkill, benchmarks);

  return { oldScore, newScore, better: newScore > oldScore };
}
