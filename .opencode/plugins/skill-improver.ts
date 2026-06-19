import type { Plugin } from "@opencode-ai/plugin";

export const SkillImprover: Plugin = async (ctx) => {
  const { client, directory } = ctx;

  async function handleIdle(event: any): Promise<void> {
    try {
      if (event.type !== "session.idle") return;
      const { sessionID } = event.properties;

      // 1. Fetch full conversation
      const msgs = await client.session.messages({ sessionID, directory } as any);
      const conversation = formatConversation(msgs.data ?? []);

      if (!conversation) return;

      // 2. Create new session
      const newSession = await client.session.create({
        query: { directory },
        body: { title: `Skill Improver - ${sessionID}` },
      } as any);

      // 3. Send context for analysis (noReply = background injection)
      if (!newSession.data) return;
      await client.session.prompt({
        sessionID: newSession.data.id,
        directory,
        noReply: true,
        parts: [{ type: "text", text: "分析以下对话，评估技能是否生效，提取可以改进的规则和反模式。对话内容如下：\n\n" + conversation }],
      } as any);
    } catch (err) {
      await client.app.log({
        body: { service: "skill-improver", level: "error", message: String(err) },
      } as any);
    }
  }

  return {
    event: async ({ event }) => { await handleIdle(event); },
    dispose: async () => {},
  };
};

function formatConversation(messages: any[]): string {
  if (!messages || messages.length === 0) return "";
  return messages
    .map((m) => {
      const role = m.info?.role ?? m.role ?? "unknown";
      const parts = m.parts ?? [];
      const text = parts
        .filter((p: any) => p.type === "text" && !p.synthetic && !p.ignored)
        .map((p: any) => p.text)
        .join("\n");
      const tools = parts
        .filter((p: any) => p.type === "tool")
        .map((p: any) => `[tool: ${p.tool}]`)
        .join(" ");
      const content = text || tools || "[no content]";
      return `[${role}]: ${content}`;
    })
    .join("\n\n");
}