import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { LLMConfig, PerSessionState, SkillConfig } from "./types.js";

// ============================================================================
// Resolve plugin directory from import.meta.url
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Constants
// ============================================================================

/** Number of observations before triggering consolidation. */
export const DEFAULT_CONSOLIDATION_THRESHOLD = 5;

// ============================================================================
// Helpers
// ============================================================================

function readJSON<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ============================================================================
// LLM Config
// ============================================================================

/**
 * Loads LLM configuration from `config/llm.json` (relative to plugin dir).
 * Environment variables `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL` override
 * file values when set.
 */
export function loadLLMConfig(): LLMConfig {
  const configPath = path.resolve(__dirname, "..", "..", "..", "config", "llm.json");
  const fileConfig = readJSON<Partial<LLMConfig>>(configPath) ?? {};

  return {
    provider: process.env.LLM_PROVIDER ?? fileConfig.provider ?? "openai",
    model: process.env.LLM_MODEL ?? fileConfig.model ?? "gpt-4o-mini",
    apiKey: process.env.LLM_API_KEY ?? fileConfig.apiKey ?? "",
    fallback: fileConfig.fallback,
  };
}

// ============================================================================
// Skill Config
// ============================================================================

/**
 * Loads skill configuration from `config/skills.json` (relative to plugin dir).
 * Returns empty skills array when file is missing or malformed.
 */
export function loadSkillConfig(): SkillConfig {
  const configPath = path.resolve(__dirname, "..", "..", "..", "config", "skills.json");
  const fileConfig = readJSON<SkillConfig>(configPath);
  return fileConfig ?? { skills: [] };
}

// ============================================================================
// Session State
// ============================================================================

/**
 * Loads persisted session state from `data/skill-improver-state.json`
 * (relative to plugin dir). Returns empty state when file is missing.
 */
export function loadSessionState(): PerSessionState {
  const statePath = path.resolve(__dirname, "..", "..", "..", "data", "skill-improver-state.json");
  const fileState = readJSON<PerSessionState>(statePath);
  return fileState ?? { sessions: {} };
}

/**
 * Persists session state to `data/skill-improver-state.json`
 * (relative to plugin dir).
 */
  export function saveSessionState(state: PerSessionState): void {
  const statePath = path.resolve(__dirname, "..", "..", "..", "data", "skill-improver-state.json");
  writeJSON(statePath, state);
}