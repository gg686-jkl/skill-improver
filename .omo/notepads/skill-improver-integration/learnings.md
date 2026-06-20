# Skill Improver Integration — Learnings

## 2026-06-19: Plugin Entry Point Rewrite

### What was done
Rewrote `.opencode/plugins/skill-improver.ts` to use the real OpenCode plugin API.

### Key patterns discovered

**Plugin format:**
```typescript
import type { Plugin } from "@opencode-ai/plugin";
export const SkillImprover: Plugin = async (ctx) => {
  return { event: async ({ event }) => {}, dispose: async () => {} };
};
```

**Event hook** receives discriminated Event union from @opencode-ai/sdk.
Use switch(event.type) for type narrowing.

**session.idle** fires when session finishes processing.
Properties: { sessionID: string }. Ideal trigger for post-hoc evaluation.

**client.session.messages()** returns Array<{ info: Message, parts: Part[] }>.
Message has role/time but NO content field. Content lives in TextPart/ToolPart parts.
Filter out synthetic and ignored text parts.

**client.app.log()** for structured logging. Never use console.log.
Format: { body: { service, level, message, extra? } }

**Import paths** from `.opencode/plugins/` use `../../plugins/skill-improver/*.js` (two levels up).
Core modules are CJS compiled to .js. Bun handles both ESM and CJS.

### Gotchas
- Plugin type: `(input: PluginInput, options?) => Promise<Hooks>` — must return hooks object
- client methods return RequestResult — access `.data` for payload
- Config files read from workspace directory root via node:fs
- Bun executes .ts directly, no build step needed
- Old `plugins/skill-improver/index.ts` kept as reference, not modified
