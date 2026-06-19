import type { Observation } from "./types.js";
import { countDistinctSessions, listObservations } from "./store.js";
import { callLLMStructured } from "./llm.js";

// ── Schema for LLM structured output ───────────────────────────────────────

const consolidationSchema = {
  type: "object",
  properties: {
    rules: {
      type: "array",
      items: { type: "string" },
      description: "Consolidated rules list",
    },
    summary: {
      type: "string",
      description: "Summary of what was learned",
    },
  },
  required: ["rules", "summary"],
};

interface ConsolidationResult {
  rules: string[];
  summary: string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────

const MIN_DISTINCT_SESSIONS = 5;
const MIN_NOVELTY_SCORE = 0.6;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if the skill has accumulated enough distinct session
 * observations (>= 5) to warrant consolidation.
 */
export function shouldConsolidate(skillId: string): boolean {
  return countDistinctSessions(skillId) >= MIN_DISTINCT_SESSIONS;
}

/**
 * Merge high-novelty observations for a skill via external LLM.
 * Returns a deduplicated list of consolidated rules, or null if
 * consolidation is not warranted or the LLM call fails.
 */
export async function consolidate(
  skillId: string
): Promise<string[] | null> {
  if (!shouldConsolidate(skillId)) {
    return null;
  }

  const observations = listObservations(skillId);
  const filtered = observations.filter(
    (obs) => obs.noveltyScore >= MIN_NOVELTY_SCORE && obs.suggestedRule.length > 0
  );

  if (filtered.length === 0) {
    return null;
  }

  const prompt = buildConsolidationPrompt(filtered);
  const result = await callLLMStructured<ConsolidationResult>(
    prompt,
    consolidationSchema
  );

  if (!result?.rules || result.rules.length === 0) {
    return null;
  }

  return result.rules;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function buildConsolidationPrompt(observations: Observation[]): string {
  const lines = observations.map(
    (obs, i) =>
      `[${i + 1}] (novelty: ${obs.noveltyScore.toFixed(2)}) ${obs.summary}\n    Suggested rule: ${obs.suggestedRule}`
  );

  return [
    "You are a skill improvement assistant.",
    "",
    "Below are observations from multiple sessions of using a skill.",
    "Each observation includes a summary and a suggested rule.",
    "",
    "Your task:",
    "1. Merge and deduplicate the suggested rules into a concise, non-redundant list.",
    "2. Keep only rules that are actionable and broadly applicable.",
    "3. Remove rules that are too specific to a single session or conflict with each other.",
    "4. Return the consolidated rules and a brief summary of what was learned.",
    "",
    "Observations:",
    ...lines,
    "",
    'Respond with JSON matching: { "rules": string[], "summary": string }',
  ].join("\n");
}
