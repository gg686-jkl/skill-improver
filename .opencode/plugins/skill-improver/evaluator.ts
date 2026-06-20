import type { Episode, Outcome, Skill } from "./types.js";
import { callLLM } from "./llm.js";


function debugLog(msg: string): void {
  try {
    const fs = require("node:fs"); const path = require("node:path");
    const p = path.resolve(process.cwd(), "data", "debug.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] [EVAL] ${msg}\n`, "utf-8");
  } catch {}
}

// ── JSON Schema for structured Outcome ─────────────────────────────────────

const outcomeSchema = {
  type: "object",
  properties: {
    successScore: {
      type: "number",
      description: "0-1 score indicating how well the skill succeeded",
    },
    failureScore: {
      type: "number",
      description: "0-1 score indicating how poorly the skill performed",
    },
    noveltyScore: {
      type: "number",
      description: "0-1 score indicating how novel or surprising the failure was",
    },
    summary: {
      type: "string",
      description: "Human-readable summary of the evaluation",
    },
    suggestedRule: {
      type: "string",
      description: "Suggested rule text extracted from the evaluation",
    },
  },
  required: ["successScore", "failureScore", "noveltyScore", "summary", "suggestedRule"],
  additionalProperties: false,
};

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildEvaluatorPrompt(episode: Episode, skill: Skill, goal: string): string {
  const episodeText = episode.messages.join("\n");

  // Include the full SKILL.md body instead of structured rules
  const skillBody = skill.body ?? "(No skill body available)";

  return [
    `You are evaluating how well an AI agent followed a skill definition during a session.`,
    ``,
    `## Goal`,
    goal,
    ``,
    `## Skill Definition`,
    `Skill: ${skill.name}`,
    skill.description ? `Description: ${skill.description}` : "",
    ``,
    `### SKILL.md Content`,
    `\`\`\``,
    skillBody,
    `\`\`\``,
    ``,
    `## Episode Messages`,
    `\`\`\``,
    episodeText,
    `\`\`\``,
    ``,
    `## Evaluation Tasks`,
    `1. Did the agent follow the skill's instructions and guidelines?`,
    `2. Were there any failures, mistakes, or deviations from the skill?`,
    `3. Was there any novel learning or surprising pattern worth capturing?`,
    ``,
    `## Scoring Guide`,
    `- successScore (0-1): How well the agent followed the skill. 1 = perfect adherence, 0 = completely ignored.`,
    `- failureScore (0-1): How badly things went wrong. 1 = catastrophic failure, 0 = no issues.`,
    `- noveltyScore (0-1): How surprising or educational the failure/observation was. 1 = highly novel, 0 = routine.`,
    ``,
    `Respond with JSON containing: successScore, failureScore, noveltyScore, summary, suggestedRule.`,
  ].filter(Boolean).join("\n");
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate an episode against a skill and goal using an external LLM.
 * The prompt includes the full SKILL.md body for context.
 * Returns a typed Outcome, or null if the LLM call fails.
 */
export async function evaluate(
  episode: Episode,
  skill: Skill,
  goal: string,
): Promise<Outcome | null> {
  const prompt = buildEvaluatorPrompt(episode, skill, goal);
  debugLog("Prompt length: " + prompt.length);
  debugLog("Calling LLM for evaluation...");
  const result = await callLLM(prompt);
  debugLog("LLM result: " + (result ? "got response" : "null"));
  if (!result) return null;
  try {
    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    if (typeof parsed.successScore === "number" && typeof parsed.summary === "string") {
      return parsed as Outcome;
    }
    return null;
  } catch (e) {
    debugLog("JSON parse failed: " + e);
    return null;
  }
}
