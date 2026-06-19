import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "node:fs";
import * as path from "node:path";

const PROCESSED_FILE = "data/skill-improver-processed.json";

function loadProcessed(dir: string): Set<string> {
  try {
    const raw = fs.readFileSync(path.join(dir, PROCESSED_FILE), "utf-8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveProcessed(dir: string, ids: Set<string>): void {
  const p = path.join(dir, PROCESSED_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify([...ids]), "utf-8");
}

export const SkillImprover: Plugin = async (ctx) => {
  const { client, directory } = ctx;
  const processed = loadProcessed(directory);
  const inFlight = new Set<string>();

  return {
    event: async ({ event }) => {
      try {
        if (event.type !== "session.idle") return;
        const { sessionID } = event.properties as { sessionID: string };

        // Guard: prevent concurrent processing + idempotency (persistent)
        if (processed.has(sessionID) || inFlight.has(sessionID)) return;
        inFlight.add(sessionID);

        try {
          // Guard: skip analysis sessions — check title
          const session = await client.session.get({
            path: { id: sessionID },
            query: { directory },
          });
          if (session.data?.title?.startsWith("Skill Improver -")) return;

          // 1. Fetch full conversation
          const msgs = await client.session.messages({
            path: { id: sessionID },
            query: { directory },
          });
          const conversation = formatConversation(msgs.data ?? []);
          if (!conversation) return;

          // 2. Create new session
          const newSession = await client.session.create({
            query: { directory },
            body: { title: `Skill Improver - ${sessionID}` },
          });
          if (!newSession.data) return;

          // 3. Inject context (noReply = background, no AI response)
          await client.session.prompt({
            path: { id: newSession.data.id },
            query: { directory },
            body: {
              noReply: true,
              parts: [{ type: "text", text: "分析以下对话，评估技能是否生效，提取可以改进的规则和反模式。对话内容如下：\n\n" + conversation }],
            },
          });

          // Only mark processed after full pipeline succeeds
          processed.add(sessionID);
          saveProcessed(directory, processed);
        } finally {
          inFlight.delete(sessionID);
        }
      } catch (err) {
        await client.app.log({
          body: { service: "skill-improver", level: "error", message: String(err) },
        });
      }
    },
    dispose: async () => { processed.clear(); inFlight.clear(); },
  };
};

function formatConversation(messages: { info: { role: string }; parts: Array<{ type: string; text?: string; synthetic?: boolean; ignored?: boolean; tool?: string }> }[]): string {
  if (!messages.length) return "";
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
    .join("\n\n");
}