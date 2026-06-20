import type { Observation } from "./types.js";
import { countDistinctSessions, listObservations } from "./store.js";
import { callLLM } from "./llm.js";
import { readFileSync } from "node:fs";
import path from "node:path";


function debugLog(msg: string): void {
  try {
    const fs = require("node:fs"); const path = require("node:path");
    const p = path.resolve(process.cwd(), "data", "debug.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] [CONSOL] ${msg}\n`, "utf-8");
  } catch {}
}

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

interface Params {
  consolidation_threshold: number;
  min_novelty_score: number;
  llm_timeout_ms: number;
}

function loadParams(): Params {
  try {
    const content = readFileSync(
      path.resolve(process.cwd(), "config", "params.json"),
      "utf-8"
    );
    return JSON.parse(content);
  } catch {
    return {
      consolidation_threshold: 5,
      min_novelty_score: 0.6,
      llm_timeout_ms: 30000,
    };
  }
}

const params = loadParams();
const MIN_DISTINCT_SESSIONS = params.consolidation_threshold ?? 5;
const MIN_NOVELTY_SCORE = params.min_novelty_score ?? 0.6;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if the skill has accumulated enough distinct session
 * observations (>= 1) to warrant consolidation.
 */
export function shouldConsolidate(skillId: string): boolean {
  const n = countDistinctSessions(skillId);
  debugLog("shouldConsolidate: " + skillId + " count=" + n);
  return n >= MIN_DISTINCT_SESSIONS;
}

/**
 * Merge high-novelty observations for a skill via external LLM.
 * Returns a deduplicated list of consolidated rules, or null if
 * consolidation is not warranted or the LLM call fails.
 */
export async function consolidate(
  skillId: string
): Promise<string[] | null> {
  debugLog("consolidate called for: " + skillId);
  if (!shouldConsolidate(skillId)) {
    return null;
  }

  const observations = listObservations(skillId);
  debugLog(`observations total: ${observations.length}, MIN_NOVELTY: ${MIN_NOVELTY_SCORE}`);
  const filtered = observations.filter(
    (obs) => obs.noveltyScore >= MIN_NOVELTY_SCORE
  );
  debugLog(`filtered observations: ${filtered.length}`);

  if (filtered.length === 0) {
    debugLog("filtered is empty, returning null");
    return null;
  }

  const prompt = buildConsolidationPrompt(filtered);
  const result = await callLLM(prompt);
  if (!result) { debugLog("consolidate LLM returned null"); return null; }
  try {
    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    if (parsed?.rules && Array.isArray(parsed.rules)) {
      debugLog("consolidate result: " + parsed.rules.length + " rules");
      return parsed.rules;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

function buildConsolidationPrompt(observations: Observation[]): string {
  const lines = observations.map(
    (obs, i) =>
      `[${i + 1}] (novelty: ${obs.noveltyScore.toFixed(2)}) ${obs.summary}\n    Suggested rule: ${obs.suggestedRule || "No specific suggestion"}`
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
