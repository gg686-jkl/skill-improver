import { Observation } from "./types.js";
import { readJSON, writeJSON } from "./storage.js";

/**
 * Get the file path for observations of a specific skill.
 */
function getObservationsPath(skillId: string): string {
  return `data/observations/${skillId}.json`;
}

/**
 * Generate a unique observation ID.
 * Format: obs_{skillId}_{timestamp}_{random}
 */
function generateObservationId(skillId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `obs_${skillId}_${timestamp}_${random}`;
}

/**
 * Add an observation to the store.
 * - Generates observationId if missing
 * - Generates timestamp if missing
 * - Deduplicates by sessionId + episodeId combination
 */
export function addObservation(obs: Observation): void {
  const filePath = getObservationsPath(obs.skillId);
  const observations = readJSON<Observation[]>(filePath) ?? [];

  // Auto-generate ID if missing
  if (!obs.observationId) {
    obs.observationId = generateObservationId(obs.skillId);
  }

  // Auto-generate timestamp if missing
  if (!obs.timestamp) {
    obs.timestamp = new Date().toISOString();
  }

  // Deduplicate: check if same sessionId + episodeId already exists
  const isDuplicate = observations.some(
    (existing) =>
      existing.sessionId === obs.sessionId &&
      existing.episodeId === obs.episodeId
  );

  if (!isDuplicate) {
    observations.push(obs);
    writeJSON(filePath, observations);
  }
}

/**
 * List all observations for a skill.
 */
export function listObservations(skillId: string): Observation[] {
  const filePath = getObservationsPath(skillId);
  return readJSON<Observation[]>(filePath) ?? [];
}

/**
 * Count observations for a skill.
 */
export function countObservations(skillId: string): number {
  return listObservations(skillId).length;
}

/**
 * Count distinct session IDs for a skill.
 */
export function countDistinctSessions(skillId: string): number {
  const observations = listObservations(skillId);
  const sessionIds = new Set(observations.map((obs) => obs.sessionId));
  return sessionIds.size;
}

/**
 * Clear all observations for a skill.
 */
export function clearObservations(skillId: string): void {
  const filePath = getObservationsPath(skillId);
  writeJSON(filePath, []);
}
