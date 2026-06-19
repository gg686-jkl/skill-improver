import type { Plugin } from "@opencode-ai/plugin";

export const SkillImprover: Plugin = async (ctx) => {
  const { client, directory } = ctx;
  const processed = new Set<string>();

  return {
    event: async ({ event }) => {
      try {
        if (event.type !== "session.idle") return;
        const { sessionID } = event.properties as { sessionID: string };

        // Guard: skip analysis sessions to prevent recursion
        if (sessionID.startsWith("skill-improver-")) return;

        // Guard: idempotency — process each session only once
        if (processed.has(sessionID)) return;
        processed.add(sessionID);

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
      } catch (err) {
        await client.app.log({
          body: { service: "skill-improver", level: "error", message: String(err) },
        });
      }
    },
    dispose: async () => { processed.clear(); },
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