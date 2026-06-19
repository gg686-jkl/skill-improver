// Skill Improver MVP — Type Definitions
// Phase 1: Session ingestion, routing, evaluation, observation storage

export interface SessionEvent {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  timestamp: string;
}

export interface Session {
  sessionId: string;
  events: SessionEvent[];
}

export interface Episode {
  episodeId: string;
  sessionId: string;
  messages: SessionEvent[];
}

export interface Outcome {
  successScore: number;
  failureScore: number;
  noveltyScore: number;
  summary: string;
  suggestedRule: string;
}

export interface Observation {
  observationId: string;
  skillId: string;
  episodeId: string;
  sessionId: string;
  failureScore: number;
  noveltyScore: number;
  summary: string;
  suggestedRule: string;
  schemaVersion: number;
  evaluatorVersion: string;
  routerVersion: string;
  timestamp: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  triggers: string[];
  goal: string;
  workflow: string[];
  rules: string[];
  antiPatterns: string[];
}

export interface SkillConfig {
  skills: SkillDefinition[];
}

export interface GoalConfig {
  [skillId: string]: string;
}

export interface StorageRepository {
  saveSession(session: Session): void;
  getSession(sessionId: string): Session | null;
  saveObservation(observation: Observation): void;
  getObservations(skillId: string): Observation[];
}

export interface SkillRouter {
  route(session: Session): string;
}

export interface OutcomeEvaluator {
  evaluate(episode: Episode, skill: SkillDefinition, goal: string): Promise<Outcome>;
}

export interface EvaluatorConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}