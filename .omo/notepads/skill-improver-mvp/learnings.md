

# Learnings - Skill Improver MVP

## 2026-06-19T11:18:00Z Session Start
- Plan: skill-improver-mvp, 7 implementation + 4 final wave tasks
- Workspace: Clean (only .omo/ and Skill Improver.md)
- TypeScript, no existing package.json, no tsconfig.json
- OpenCode plugin system: hooks available but exact API surface unknown - will use abstract plugin interface

## 2026-06-19T11:20:00Z Task 2 — types.ts
- Created plugins/skill-improver/types.ts with all MVP interfaces
- 12 interfaces: SessionEvent, Session, Episode, Outcome, Observation, SkillDefinition, SkillConfig, GoalConfig, StorageRepository, SkillRouter, OutcomeEvaluator, EvaluatorConfig
- `tsc --noEmit` passes cleanly (no errors)
- Created tsconfig.json (ES2020, commonjs, strict) + package.json
- Observation includes schemaVersion (number), evaluatorVersion (string), routerVersion (string)
- StorageRepository, SkillRouter, OutcomeEvaluator are all interfaces (not classes)
- All exports are named exports (no `export default`)

## 2026-06-19T12:00:00Z Task 3 — evaluator.ts
- Created plugins/skill-improver/evaluator.ts with LLMOutcomeEvaluator class
- Implements OutcomeEvaluator interface
- Uses fetch (built-in Node 22+) to call OpenAI-compatible API
- Retry logic: try once, retry once, then fallback Outcome on persistent failure
- Response parsing: strips markdown code fences before JSON.parse()
- Validates 5 required fields + score range (0-1)
- Fallback Outcome returns all zeros with error summary
- `tsc --noEmit` passes cleanly

## 2026-06-19T12:10:00Z Task 4 — router.ts
- Created plugins/skill-improver/router.ts with KeywordSkillRouter class
- Implements SkillRouter interface
- Keyword matching: concatenates all user messages, lowercases, checks against skill triggers
- Returns first matching skill name, or 'general' for no match/empty
- Reads config/skills.json once in constructor
- getRouterVersion() returns '1.0.0'
- `tsc --noEmit` passes cleanly
- 8/8 inline tests pass (docker, debug, refactor, no-match, empty, case-insensitive, multi-word, first-match)