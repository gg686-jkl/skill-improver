// ============================================================================
// Core domain types for skill-improver plugin
// ============================================================================

/** A single Opencode session. */
export interface Session {
  sessionId: string;
  title: string;
  directory: string;
}

/**
 * An episode is a unit of analysis. MVP: 1 session = 1 episode.
 * messages are the formatted conversation lines.
 */
export interface Episode {
  episodeId: string;
  sessionId: string;
  messages: string[];
}

/** Raw result from the Evaluator LLM call. */
export interface Outcome {
  /** 0-1 score indicating how well the skill succeeded. */
  successScore: number;
  /** 0-1 score indicating how poorly the skill performed. */
  failureScore: number;
  /** 0-1 score indicating how novel / surprising the failure was. */
  noveltyScore: number;
  /** Human-readable summary of the evaluation. */
  summary: string;
  /** Suggested rule text extracted from the evaluation. */
  suggestedRule: string;
}

/** A persisted observation derived from an Outcome. */
export interface Observation {
  observationId: string;
  skillId: string;
  sessionId: string;
  episodeId: string;
  failureScore: number;
  noveltyScore: number;
  summary: string;
  suggestedRule: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

/** A skill definition loaded from the filesystem. */
export interface Skill {
  id: string;
  name: string;
  path: string;
  triggers: string[];
  rules: string[];
  antiPatterns: string[];
  examples: string[];
}

/** A proposed modification to a skill file. */
export interface SkillCandidate {
  skillId: string;
  reviewId: string;
  oldPath: string;
  candidatePath: string;
  /** Unified diff text. */
  diff: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

/** A review decision on a SkillCandidate. */
export interface Review {
  reviewId: string;
  skillId: string;
  status: "pending" | "approved" | "rejected";
  oldPath: string;
  candidatePath: string;
  /** Unified diff text. */
  diff: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/** A single benchmark case: input prompt + required substring checks. */
export type Benchmark = {
  input: string;
  mustInclude: string[];
}[];

/** LLM provider configuration. */
export interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  fallback?: {
    provider: string;
    model: string;
    apiKey: string;
  };
}

/** Top-level skill configuration loaded from skills.json. */
export interface SkillConfig {
  skills: {
    id: string;
    name: string;
    triggers: string[];
    path: string;
  }[];
}

/** Per-session processing state for incremental / idempotent operation. */
export interface SessionState {
  sessionId: string;
  lastProcessedMessageId: string;
  /** ISO-8601 timestamp. */
  lastProcessedAt: string;
}

/** Persisted state tracking all sessions. */
export interface PerSessionState {
  sessions: Record<string, SessionState>;
}