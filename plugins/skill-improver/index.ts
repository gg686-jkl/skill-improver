import { JsonStorageRepository } from "./storage";
import { SessionMonitor } from "./monitor";
import { KeywordSkillRouter } from "./router";
import { LLMOutcomeEvaluator } from "./evaluator";
import { SessionEvent, Episode, SkillDefinition, GoalConfig, EvaluatorConfig } from "./types";

// Read config
import * as fs from "node:fs";
import * as path from "node:path";

const SKILLS_PATH = path.resolve(__dirname, "../../config/skills.json");
const GOALS_PATH = path.resolve(__dirname, "../../config/goals.json");

// Load skills
const skillsRaw = fs.readFileSync(SKILLS_PATH, "utf-8");
const skills: SkillDefinition[] = JSON.parse(skillsRaw);

// Load goals
const goalsRaw = fs.readFileSync(GOALS_PATH, "utf-8");
const goals: GoalConfig = JSON.parse(goalsRaw);

// Initialize components
const storage = new JsonStorageRepository();
const monitor = new SessionMonitor(storage);
const router = new KeywordSkillRouter();

// LLM evaluator config from environment
const evaluatorConfig: EvaluatorConfig = {
  endpoint: process.env.LLM_ENDPOINT || "https://api.openai.com/v1/chat/completions",
  apiKey: process.env.LLM_API_KEY || "",
  model: process.env.LLM_MODEL || "gpt-4o-mini",
};
const evaluator = new LLMOutcomeEvaluator(evaluatorConfig);

// --- Plugin Hook Methods ---

let currentSessionId: string | null = null;

export function onSessionStart(): void {
  monitor.start();
  currentSessionId = null; // will be set on end
}

export function onUserMessage(content: string): void {
  try {
    const event: SessionEvent = {
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    monitor.recordEvent(event);
  } catch (err) {
    // Session may not have started yet — ignore
    console.error("[skill-improver] onUserMessage error:", err);
  }
}

export function onAssistantMessage(content: string, tools?: string[]): void {
  try {
    const event: SessionEvent = {
      role: "assistant",
      content,
      tools,
      timestamp: new Date().toISOString(),
    };
    monitor.recordEvent(event);
  } catch (err) {
    console.error("[skill-improver] onAssistantMessage error:", err);
  }
}

export function onToolCall(toolName: string): void {
  try {
    const event: SessionEvent = {
      role: "assistant",
      content: `[tool call: ${toolName}]`,
      tools: [toolName],
      timestamp: new Date().toISOString(),
    };
    monitor.recordEvent(event);
  } catch (err) {
    console.error("[skill-improver] onToolCall error:", err);
  }
}

export async function onSessionEnd(): Promise<void> {
  try {
    const sessionId = monitor.end();
    if (!sessionId) return; // No active session

    currentSessionId = sessionId;

    // Retrieve the saved session
    const session = storage.getSession(sessionId);
    if (!session) return;

    // Route to skill
    const skillId = router.route(session);
    const skill = skills.find((s) => s.name === skillId);
    if (!skill) return; // No matching skill found

    // Create episode (1:1 with session for MVP)
    const episode: Episode = {
      episodeId: sessionId, // 1:1 mapping for MVP
      sessionId: sessionId,
      messages: session.events,
    };

    // Get goal
    const goal = goals[skillId] || skill.goal || "";

    // Evaluate
    const outcome = await evaluator.evaluate(episode, skill, goal);

    // Store observation if failure score is high enough
    if (outcome.failureScore >= 0.6) {
      const observation = {
        observationId: `obs-${sessionId}`,
        skillId: skillId,
        episodeId: sessionId,
        sessionId: sessionId,
        failureScore: outcome.failureScore,
        noveltyScore: outcome.noveltyScore,
        summary: outcome.summary,
        suggestedRule: outcome.suggestedRule,
        schemaVersion: 1,
        evaluatorVersion: evaluator.getEvaluatorVersion(),
        routerVersion: router.getRouterVersion(),
        timestamp: new Date().toISOString(),
      };
      storage.saveObservation(observation);
    }
  } catch (err) {
    console.error("[skill-improver] onSessionEnd error:", err);
    // Don't crash — pipeline continues
  }
}

// Export plugin metadata
export const plugin = {
  name: "skill-improver",
  version: "0.1.0",
  hooks: {
    onSessionStart,
    onUserMessage,
    onAssistantMessage,
    onToolCall,
    onSessionEnd,
  },
};