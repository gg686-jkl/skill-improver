import type { Episode, PerSessionState } from "./types.js";
import { updateSessionState } from "./monitor.js";

// ============================================================================
// Message types (matching OpenCode session message structure)
// ============================================================================

interface MessagePart {
  type: string;
  text?: string;
  synthetic?: boolean;
  ignored?: boolean;
  tool?: string;
}

interface Message {
  info: { role: string };
  parts: MessagePart[];
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Formats raw messages into human-readable lines.
 * - Filters out `synthetic: true` and `ignored: true` parts
 * - Text parts become `[role]: text`
 * - Tool parts become `[role]: [tool: name]`
 */
export function formatMessages(messages: Message[]): string[] {
  return messages
    .map((m) => {
      const role = m.info.role;
      const parts = m.parts ?? [];

      const text = parts
        .filter((p) => p.type === "text" && !p.synthetic && !p.ignored)
        .map((p) => p.text ?? "")
        .join("\n");

      const tools = parts
        .filter((p) => p.type === "tool")
        .map((p) => `[tool: ${p.tool}]`)
        .join(" ");

      const content = text || tools || "[no content]";
      return `[${role}]: ${content}`;
    })
    .filter((line) => line !== "");
}

// ============================================================================
// Incremental extraction
// ============================================================================

/**
 * Extracts messages that appear after `lastProcessedId`.
 * `lastProcessedId` is the string index of the last processed message.
 * If empty/falsy, returns ALL formatted messages (first-time processing).
 */
export function extractNewMessages(
  messages: Message[],
  lastProcessedId: string
): string[] {
  if (!lastProcessedId) {
    return formatMessages(messages);
  }

  const lastIdx = parseInt(lastProcessedId, 10);
  if (Number.isNaN(lastIdx) || lastIdx < 0) {
    return formatMessages(messages);
  }

  const newMessages = messages.slice(lastIdx + 1);
  return formatMessages(newMessages);
}

/**
 * Creates an Episode from new messages since last processing.
 * Returns null if there are no new messages.
 * Updates session state on success.
 */
export function extractEpisode(
  sessionId: string,
  messages: Message[],
  state: PerSessionState
): Episode | null {
  const sessionState = state.sessions[sessionId];
  const lastProcessedId = sessionState?.lastProcessedMessageId ?? "";

  // Determine the slice of new messages
  let newMessages: Message[];
  if (!lastProcessedId) {
    newMessages = messages;
  } else {
    const lastIdx = parseInt(lastProcessedId, 10);
    if (Number.isNaN(lastIdx) || lastIdx < 0) {
      newMessages = messages;
    } else {
      newMessages = messages.slice(lastIdx + 1);
    }
  }

  // No new messages → nothing to produce
  if (newMessages.length === 0) {
    return null;
  }

  const formatted = formatMessages(newMessages);
  if (formatted.length === 0) {
    return null;
  }

  // Update state: last message index = total length - 1
  const newLastId = String(messages.length - 1);
  updateSessionState(sessionId, newLastId);

  return {
    episodeId: `ep_${sessionId}_${Date.now()}`,
    sessionId,
    messages: formatted,
  };
}
