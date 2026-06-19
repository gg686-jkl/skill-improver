import type { PerSessionState } from "./types.js";
import { loadSessionState, saveSessionState } from "./config.js";

/**
 * Returns the current persisted session state.
 */
export function getSessionState(): PerSessionState {
  return loadSessionState();
}

/**
 * Updates the state for a single session and persists to disk.
 */
export function updateSessionState(sessionId: string, lastMessageId: string): void {
  const state = loadSessionState();
  state.sessions[sessionId] = {
    sessionId,
    lastProcessedMessageId: lastMessageId,
    lastProcessedAt: new Date().toISOString(),
  };
  saveSessionState(state);
}

/**
 * Checks whether a session (by title + directory) is in the monitored list.
 */
export function isMonitored(
  sessionTitle: string,
  sessionDir: string,
  monitoredSessions: Array<{ title: string; directory: string }>
): boolean {
  return monitoredSessions.some(
    (entry) => entry.title === sessionTitle && entry.directory === sessionDir
  );
}
