import * as path from "node:path";
import type { Skill, SkillCandidate, Review } from "./types.js";
import { loadSkill } from "./router.js";
import { callLLMStructured } from "./llm.js";
import { writeYAML, writeJSON } from "./storage.js";

// ============================================================================
// Skill Candidate Updater
// ============================================================================

interface LLMOutput {
  name: string;
  rules: string[];
  antiPatterns: string[];
  summary: string;
}

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    rules: { type: "array", items: { type: "string" } },
    antiPatterns: { type: "array", items: { type: "string" } },
    summary: { type: "string", description: "Summary of changes" },
  },
  required: ["name", "rules", "antiPatterns", "summary"],
};

/**
 * Build the LLM prompt from old skill rules and consolidated rules.
 */
function buildPrompt(oldSkill: Skill, consolidatedRules: string[]): string {
  const oldRulesText =
    oldSkill.rules.length > 0
      ? oldSkill.rules.map((r, i) => `  ${i + 1}. ${r}`).join("\n")
      : "  (none)";

  const newRulesText =
    consolidatedRules.length > 0
      ? consolidatedRules.map((r, i) => `  ${i + 1}. ${r}`).join("\n")
      : "  (none)";

  return `You are a skill editor. Given the current skill rules and a set of consolidated rules from recent observations, produce an updated skill definition.

Current skill name: ${oldSkill.name}
Current rules:
${oldRulesText}

Current anti-patterns:
${oldSkill.antiPatterns.length > 0 ? oldSkill.antiPatterns.map((r, i) => `  ${i + 1}. ${r}`).join("\n") : "  (none)"}

Consolidated rules from observations:
${newRulesText}

Instructions:
1. Merge the consolidated rules into the existing rules. Keep existing rules that are still relevant.
2. Remove rules that are contradicted or superseded by the consolidated rules.
3. Update anti-patterns if the consolidated rules suggest new anti-patterns.
4. Keep the skill name the same unless there is a strong reason to change it.
5. Return the complete updated skill definition as structured JSON.`;
}

/**
 * Generate a simple diff comparing old rules vs new rules.
 */
function generateDiff(oldRules: string[], newRules: string[]): string {
  const lines: string[] = [];

  lines.push("--- Old rules");
  lines.push("+++ New rules");

  for (const rule of oldRules) {
    if (!newRules.includes(rule)) {
      lines.push(`- ${rule}`);
    }
  }

  for (const rule of newRules) {
    if (!oldRules.includes(rule)) {
      lines.push(`+ ${rule}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a new skill candidate by merging consolidated rules into the existing skill.
 *
 * - Loads the old skill via `loadSkill(skillId)`
 * - Calls LLM with old rules + consolidated rules to produce updated YAML
 * - Saves candidate to `data/candidates/{skillId}-{timestamp}.yaml`
 * - Creates review record at `data/reviews/{reviewId}.json`
 * - Returns the SkillCandidate, or null if the old skill is not found or LLM fails
 */
export async function generateCandidate(
  skillId: string,
  consolidatedRules: string[]
): Promise<SkillCandidate | null> {
  const oldSkill = loadSkill(skillId);
  if (!oldSkill) {
    return null;
  }

  const prompt = buildPrompt(oldSkill, consolidatedRules);
  const result = await callLLMStructured<LLMOutput>(prompt, CANDIDATE_SCHEMA);

  if (!result) {
    return null;
  }

  const timestamp = Date.now();
  const isoTimestamp = new Date(timestamp).toISOString();
  const candidateFileName = `${skillId}-${timestamp}.yaml`;
  const reviewId = `rev_${skillId}_${timestamp}`;

  // Build candidate YAML data
  const candidateData = {
    name: result.name,
    triggers: oldSkill.triggers,
    rules: result.rules,
    antiPatterns: result.antiPatterns,
    examples: oldSkill.examples,
  };

  // Resolve paths relative to project root
  const candidatesDir = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "data",
    "candidates"
  );
  const candidatePath = path.join(candidatesDir, candidateFileName);

  const reviewsDir = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "data",
    "reviews"
  );
  const reviewPath = path.join(reviewsDir, `${reviewId}.json`);

  // Save candidate YAML
  writeYAML(candidatePath, candidateData);

  // Generate diff
  const diff = generateDiff(oldSkill.rules, result.rules);

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
