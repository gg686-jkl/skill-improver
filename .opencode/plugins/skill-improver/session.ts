import { loadSessionState, saveSessionState } from "./file-utils.js";
import type { Episode, PerSessionState } from "./types.js";

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

export function getSessionState(): PerSessionState {
  return loadSessionState();
}

export function updateSessionState(sessionId: string, lastMessageId: string): void {
  const state = loadSessionState();
  state.sessions[sessionId] = {
    sessionId,
    lastProcessedMessageId: lastMessageId,
    lastProcessedAt: new Date().toISOString(),
  };
  saveSessionState(state);
}

export function isMonitored(
  sessionTitle: string,
  sessionDir: string,
  monitoredSessions: Array<{ title: string; directory: string }>
): boolean {
  return monitoredSessions.some(
    (entry) => entry.title === sessionTitle && entry.directory === sessionDir
  );
}

export function formatMessages(messages: Message[]): string[] {
  return messages
    .map((message) => {
      const role = message.info.role;
      const parts = message.parts ?? [];
      const text = parts
        .filter((part) => part.type === "text" && !part.synthetic && !part.ignored)
        .map((part) => part.text ?? "")
        .join("\n");
      const tools = parts
        .filter((part) => part.type === "tool")
        .map((part) => `[tool: ${part.tool}]`)
        .join(" ");
      const content = text || tools || "[no content]";
      return `[${role}]: ${content}`;
    })
    .filter((line) => line !== "");
}

export function extractNewMessages(messages: Message[], lastProcessedId: string): string[] {
  if (!lastProcessedId) return formatMessages(messages);
  const lastIdx = parseInt(lastProcessedId, 10);
  if (Number.isNaN(lastIdx) || lastIdx < 0) return formatMessages(messages);
  return formatMessages(messages.slice(lastIdx + 1));
}

export function extractEpisode(
  sessionId: string,
  messages: Message[],
  state: PerSessionState
): Episode | null {
  const lastProcessedId = state.sessions[sessionId]?.lastProcessedMessageId ?? "";
  let newMessages: Message[];
  if (!lastProcessedId) {
    newMessages = messages;
  } else {
    const lastIdx = parseInt(lastProcessedId, 10);
    newMessages = Number.isNaN(lastIdx) || lastIdx < 0 ? messages : messages.slice(lastIdx + 1);
  }

  if (newMessages.length === 0) return null;
  const formatted = formatMessages(newMessages);
  if (formatted.length === 0) return null;

  updateSessionState(sessionId, String(messages.length - 1));
  return {
    episodeId: `ep_${sessionId}_${Date.now()}`,
    sessionId,
    messages: formatted,
  };
}
