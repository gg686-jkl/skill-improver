import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "yaml";
import type { LLMConfig, PerSessionState, SkillConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PLUGIN_ROOT = path.resolve(__dirname, "..", "..", "..");

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJSON<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function readYAML<T>(filePath: string): T {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return {} as T;
  }
  return (yaml.parse(raw) ?? {}) as T;
}

export function writeYAML(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(tmpPath, yaml.stringify(data), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function loadLLMConfig(): LLMConfig {
  const configPath = path.join(PLUGIN_ROOT, "config", "llm.json");
  const fileConfig = readJSON<Partial<LLMConfig>>(configPath) ?? {};
  return {
    provider: process.env.LLM_PROVIDER ?? fileConfig.provider ?? "openai",
    model: process.env.LLM_MODEL ?? fileConfig.model ?? "gpt-4o-mini",
    apiKey: process.env.LLM_API_KEY ?? fileConfig.apiKey ?? "",
    fallback: fileConfig.fallback,
  };
}

export function loadSkillConfig(): SkillConfig {
  const configPath = path.join(PLUGIN_ROOT, "config", "skills.json");
  return readJSON<SkillConfig>(configPath) ?? { skills: [] };
}

export function loadSessionState(): PerSessionState {
  const statePath = path.join(PLUGIN_ROOT, "data", "skill-improver-state.json");
  return readJSON<PerSessionState>(statePath) ?? { sessions: {} };
}

export function saveSessionState(state: PerSessionState): void {
  const statePath = path.join(PLUGIN_ROOT, "data", "skill-improver-state.json");
  writeJSON(statePath, state);
}
