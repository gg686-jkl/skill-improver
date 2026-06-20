# Skill Improver Refactor - Learnings

## llm.ts (Wave 1)

- Config loaded from ../../config/llm.json relative to module dir
- Providers: openai and anthropic detected from config provider field
- Fallback: if primary fails (non-2xx, timeout, network), retries once then tries fallback config
- Timeout: 30s per request via node:https RequestOptions.timeout
- Structured output: OpenAI uses response_format with json_schema, Anthropic uses tool_use
- Response parsing handles both text and tool_use content blocks for Anthropic
- Returns null if both primary and fallback fail
- No external dependencies - uses node:https / node:http only

