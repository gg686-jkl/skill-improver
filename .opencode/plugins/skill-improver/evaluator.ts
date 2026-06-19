import type { Episode, Outcome, Skill } from "./types.js";
import { callLLMStructured } from "./llm.js";

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

  return [
    `Analyze this episode.`,
    ``,
    `Goal: ${goal}`,
    ``,
    `Skill: ${skill.name}`,
    `Triggers: ${skill.triggers.join(", ")}`,
    `Rules: ${skill.rules.join("; ")}`,
    `Anti-patterns: ${skill.antiPatterns.join("; ")}`,
    ``,
    `Episode:`,
    episodeText,
    ``,
    `Tasks:`,
    `1. Was the user satisfied with the outcome?`,
    `2. Did the agent fail or behave incorrectly?`,
    `3. Was there any novel learning or surprising failure pattern?`,
    ``,
    `Respond with JSON containing: successScore (0-1), failureScore (0-1), noveltyScore (0-1), summary, suggestedRule.`,
  ].join("\n");
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate an episode against a skill and goal using an external LLM.
 * Returns a typed Outcome, or null if the LLM call fails.
 */
export async function evaluate(
  episode: Episode,
  skill: Skill,
  goal: string,
): Promise<Outcome | null> {
  const prompt = buildEvaluatorPrompt(episode, skill, goal);
  return callLLMStructured<Outcome>(prompt, outcomeSchema);
}
