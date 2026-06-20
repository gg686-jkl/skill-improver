# Skill Improver v2 — MVP Phase 1 (Closed Loop)

## TL;DR

> **Quick Summary**: Build a minimal plugin that captures OpenCode sessions, routes them to skills via keyword matching, evaluates outcomes via LLM, and stores improvement observations — forming the `session → observation` closed loop.
>
> **Deliverables**:
> - OpenCode plugin with session hooks (monitor)
> - File-based JSON storage behind a repository interface
> - Keyword-based skill router (RouterV0)
> - LLM-based outcome evaluator with provenance tracking
> - Observation store with threshold filtering
>
> **Estimated Effort**: Short (1-2 days)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (scaffolding) → Task 2 (types) → Task 3-5 (parallel core) → Task 6 (integration) → Task 7 (QA)

---

## Context

### Original Request
Implement the MVP for Skill Improver v2 (Phase 1 — Closed Loop) as described in `Skill Improver.md`.

### Hyperplan Adversarial Review Summary
Four hostile critics (Minimalist, Completist, Strategist, Iconoclast) reviewed the MVP design. All rated it **4/10** and identified:

**Accepted Corrections**:
- **SHRINK scope**: Remove Episode Extractor (1 session = 1 episode is a no-op), remove Cooldown mechanism (no consolidation yet), remove numeric scoring (scores imply calibration we don't have). Keep: Monitor → Route → Evaluate → Store.
- **ADD repository interface**: Wrap file-based JSON behind a `StorageRepository` interface so SQLite can replace it in Phase 2 without rewriting business logic.
- **ADD versioning**: Every stored record includes `schemaVersion`, `evaluatorVersion`, and `routerVersion`.
- **ADD distinct IDs**: `sessionId`, `episodeId`, `observationId` are separate from day one, even though episodeId == sessionId in MVP.
- **ADD error handling**: LLM call failures, concurrent write protection, partial session data.

**Rejected Corrections** (for Phase 2):
- Event-driven learning (iconoclast) — too radical for MVP; session-driven is simpler to validate
- Per-skill scorecards — requires multi-session aggregation; Phase 1 is single-session
- Heuristic evaluation instead of LLM — LLM evaluation is the core thing we're validating

### Research Findings
- OpenCode plugin system: hooks are available via plugin API (needs exploration during implementation)
- No existing test infrastructure in this project (new repo)
- Target: 1-3 skills (docker-skill, debug-skill, refactor-skill)

---

## Work Objectives

### Core Objective
Build a minimal OpenCode plugin that automatically captures session data, routes it to the correct skill, evaluates the outcome via LLM, and stores learning observations — proving the `session → observation` closed loop works end-to-end.

### Concrete Deliverables
- `plugins/skill-improver/index.ts` — Plugin entry point
- `plugins/skill-improver/monitor.ts` — Session event hooks
- `plugins/skill-improver/router.ts` — Keyword-based skill routing
- `plugins/skill-improver/evaluator.ts` — LLM outcome evaluation
- `plugins/skill-improver/storage.ts` — Repository interface + JSON implementation
- `plugins/skill-improver/types.ts` — All TypeScript interfaces
- `config/skills.json` — Skill definitions (keywords, goals, prompts)
- `data/` — Runtime storage directory (.gitignored)

### Definition of Done
- [ ] Plugin hooks into OpenCode session lifecycle events
- [ ] Session data is captured and saved as JSON
- [ ] Session is routed to the correct skill via keyword matching
- [ ] Outcome evaluation runs via LLM and produces observation JSON
- [ ] Observations with failureScore >= 0.6 are stored
- [ ] End-to-end test: simulate a session, verify observation is created

### Must Have
- Session event hooks (session.start, user.message, assistant.message, tool.call, session.end)
- Session JSON storage (atomic writes, versioned schema)
- Keyword-based skill routing with fallback ("general" skill)
- LLM outcome evaluator with structured JSON output
- Observation store with threshold filtering
- Repository interface abstracting storage implementation
- Schema versioning on all stored records
- Error handling for LLM failures, concurrent writes, missing data

### Must NOT Have (Guardrails)
- **NO** Episode Extractor component (1:1 mapping is a no-op, just use sessionId)
- **NO** Consolidator (Phase 2)
- **NO** Skill updater that writes to skill files (Phase 2)
- **NO** Git commit/rollback (Phase 2)
- **NO** Benchmark/eval system (Phase 3)
- **NO** Cooldown mechanism (no consolidation, so no need)
- **NO** Semantic routing, embedding search, RL scoring
- **NO** Multi-agent voting, topic segmentation
- **NO** Numeric scoring beyond what LLM naturally outputs (no calibration system)
- **NO** Direct file writes in business logic — always go through StorageRepository

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None (MVP validation via manual e2e + agent QA)
- **Framework**: N/A
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI/Backend**: Use Bash — run the plugin, simulate session events, validate output files
- **API**: Use Bash (curl) — call LLM evaluator, assert response structure

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation files):
├── Task 1: Project scaffolding + config [quick]
├── Task 2: Type definitions [quick]
└── Task 3: Storage repository interface + JSON impl [quick]

Wave 2 (After Wave 1 — core modules, MAX PARALLEL):
├── Task 4: Session monitor (hooks) [quick]
├── Task 5: Skill router (keyword) [quick]
└── Task 6: Outcome evaluator (LLM) [unspecified-high]

Wave 3 (After Wave 2 — integration + wiring):
└── Task 7: Plugin entry point + end-to-end wiring [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1**: — — 4, 5, 2
- **2**: — — 4, 5, 6, 2
- **3**: — — 4, 6, 2
- **4**: 1, 2 — 7, 2
- **5**: 1, 2 — 7, 2
- **6**: 2, 3 — 7, 2
- **7**: 4, 5, 6 — F1-F4, 3

### Agent Dispatch Summary
- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **3** — T4 → `quick`, T5 → `quick`, T6 → `unspecified-high`
- **Wave 3**: **1** — T7 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Project scaffolding + configuration files

  **What to do**:
  - Create `plugins/skill-improver/` directory structure
  - Create `config/skills.json` with 3 initial skills (docker-skill, debug-skill, refactor-skill)
  - Create `config/goals.json` with skill goals
  - Create `.gitignore` entry for `data/` directory
  - Create `data/` directory structure (sessions/, observations/)
  - Create `package.json` if needed for dependencies

  **Must NOT do**:
  - Don't create any TypeScript source files yet (that's Tasks 2-7)
  - Don't create benchmark files (Phase 3)
  - Don't create consolidation-related config

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure file/directory creation, no logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None (can start immediately)

  **References**:
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:657-675` — Storage structure (`skill-improver/` directory layout)
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:578-605` — Skill schema (YAML format for skills)

  **Acceptance Criteria**:
  - [ ] Directory `plugins/skill-improver/` exists
  - [ ] `config/skills.json` contains 3 skills with `name`, `triggers` (keywords), `goal`, `workflow`, `rules`, `antiPatterns`
  - [ ] `config/goals.json` maps skillId → goal string
  - [ ] `data/sessions/` and `data/observations/` directories exist
  - [ ] `.gitignore` includes `data/`

  **QA Scenarios**:
  ```
  Scenario: Directory structure is correct
    Tool: Bash
    Preconditions: Clean workspace
    Steps:
      1. ls plugins/skill-improver/
      2. ls config/
      3. ls data/
    Expected Result: All directories exist, skills.json and goals.json are valid JSON
    Evidence: .omo/evidence/task-1-dir-structure.txt

  Scenario: Skills config is valid JSON with correct schema
    Tool: Bash
    Preconditions: config/skills.json exists
    Steps:
      1. node -e "const s = require('./config/skills.json'); console.log(s.length, s[0].name, s[0].triggers)"
    Expected Result: Prints "3 docker-skill ['docker','compose']" (or similar)
    Evidence: .omo/evidence/task-1-config-valid.txt
  ```

  **Commit**: YES (groups with Task 2, 3)
  - Message: `feat(skill-improver): project scaffolding and config files`
  - Files: `plugins/skill-improver/`, `config/skills.json`, `config/goals.json`, `.gitignore`, `data/.gitkeep`

---

- [x] 2. Type definitions

  **What to do**:
  - Create `plugins/skill-improver/types.ts`
  - Define all TypeScript interfaces:
    - `SessionEvent` (role, content, tools?, timestamp)
    - `Session` (sessionId, events: SessionEvent[])
    - `Episode` (episodeId, sessionId, messages: SessionEvent[]) — even though 1:1 now
    - `Outcome` (successScore, failureScore, noveltyScore, summary, suggestedRule)
    - `Observation` (observationId, skillId, episodeId, sessionId, failureScore, noveltyScore, summary, suggestedRule, schemaVersion, evaluatorVersion, routerVersion, timestamp)
    - `SkillDefinition` (name, triggers, goal, workflow, rules, antiPatterns)
    - `SkillConfig` (skills: SkillDefinition[])
    - `GoalConfig` (Record<string, string>)
    - `StorageRepository` interface (saveSession, saveObservation, getObservations, getSession)
    - `SkillRouter` interface (route: (session: Session) => string)
    - `OutcomeEvaluator` interface (evaluate: (episode: Episode, skill: SkillDefinition, goal: string) => Promise<Outcome>)

  **Must NOT do**:
  - Don't implement any functions — just types
  - Don't add runtime validation (zod) — keep it simple for MVP
  - Don't add Consolidator, Benchmark, or CandidateUpdate types (Phase 2/3)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions, no logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4, Task 5, Task 6
  - **Blocked By**: None (can start immediately)

  **References**:
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:278-294` — SessionEvent and Session interfaces
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:341-347` — Episode interface
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:387-393` — Outcome interface
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:473-483` — Observation interface

  **Acceptance Criteria**:
  - [ ] `types.ts` exports all interfaces listed above
  - [ ] `tsc --noEmit` passes on types.ts
  - [ ] Observation includes `schemaVersion`, `evaluatorVersion`, `routerVersion` fields
  - [ ] StorageRepository is an interface (not a class)

  **QA Scenarios**:
  ```
  Scenario: Types compile without errors
    Tool: Bash
    Preconditions: types.ts exists, tsconfig.json exists
    Steps:
      1. npx tsc --noEmit plugins/skill-improver/types.ts
    Expected Result: Exit code 0, no errors
    Evidence: .omo/evidence/task-2-types-compile.txt

  Scenario: All required interfaces are exported
    Tool: Bash
    Preconditions: types.ts exists
    Steps:
      1. node -e "const t = require('./plugins/skill-improver/types'); const keys = Object.keys(t); console.log(keys.sort())"
    Expected Result: Lists all expected interface names (may show as undefined since they're types, not values — verify differently)
    Failure Indicators: If tsc fails, types are malformed
    Evidence: .omo/evidence/task-2-types-exports.txt
  ```

  **Commit**: YES (groups with Task 1, 3)
  - Message: `feat(skill-improver): add type definitions`
  - Files: `plugins/skill-improver/types.ts`

---

- [x] 3. Storage repository interface + JSON implementation

  **What to do**:
  - Create `plugins/skill-improver/storage.ts`
  - Implement `JsonStorageRepository` class implementing `StorageRepository` interface
  - `saveSession(session: Session)`: atomic write to `data/sessions/{sessionId}.json` using write-temp-then-rename pattern
  - `saveObservation(observation: Observation)`: append to `data/observations/{skillId}.json` (read-modify-write array, atomic)
  - `getSession(sessionId: string)`: read and parse session JSON
  - `getObservations(skillId: string)`: read and parse observations array
  - Handle file-not-found gracefully (return null/empty array)

  **Must NOT do**:
  - Don't add SQLite or any database — keep it file-based JSON
  - Don't add migration logic (just schemaVersion field on records)
  - Don't add locking beyond atomic write (no mutex, no file locks)
  - Don't add observation deduplication

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file I/O with well-defined interface
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4, Task 6
  - **Blocked By**: None (can start immediately)

  **References**:
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:500-504` — Observation storage directory structure
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:657-675` — Storage directory layout

  **Acceptance Criteria**:
  - [ ] `JsonStorageRepository` implements `StorageRepository` interface
  - [ ] `saveSession` writes valid JSON to `data/sessions/{id}.json`
  - [ ] `saveObservation` appends to array in `data/observations/{skillId}.json`
  - [ ] Atomic writes: uses temp file + rename pattern
  - [ ] `getSession` returns null for missing files
  - [ ] `getObservations` returns [] for missing files

  **QA Scenarios**:
  ```
  Scenario: Save and retrieve a session
    Tool: Bash
    Preconditions: storage.ts compiles, data/sessions/ exists
    Steps:
      1. node -e "
         const { JsonStorageRepository } = require('./plugins/skill-improver/storage');
         const repo = new JsonStorageRepository();
         repo.saveSession({ sessionId: 'test-1', events: [{ role: 'user', content: 'hello', timestamp: new Date().toISOString() }] });
         const s = repo.getSession('test-1');
         console.log(JSON.stringify(s));
         "
    Expected Result: Prints the saved session JSON with correct sessionId
    Evidence: .omo/evidence/task-3-save-session.txt

  Scenario: Save observation and verify array append
    Tool: Bash
    Preconditions: storage.ts compiles, data/observations/ exists
    Steps:
      1. node -e "
         const { JsonStorageRepository } = require('./plugins/skill-improver/storage');
         const repo = new JsonStorageRepository();
         repo.saveObservation({ observationId: 'obs-1', skillId: 'docker-skill', episodeId: 'ep-1', sessionId: 'sess-1', failureScore: 0.8, noveltyScore: 0.5, summary: 'test', suggestedRule: 'test rule', schemaVersion: 1, evaluatorVersion: '1.0', routerVersion: '1.0', timestamp: new Date().toISOString() });
         repo.saveObservation({ observationId: 'obs-2', skillId: 'docker-skill', episodeId: 'ep-2', sessionId: 'sess-2', failureScore: 0.7, noveltyScore: 0.3, summary: 'test2', suggestedRule: 'test rule2', schemaVersion: 1, evaluatorVersion: '1.0', routerVersion: '1.0', timestamp: new Date().toISOString() });
         const obs = repo.getObservations('docker-skill');
         console.log(obs.length, obs[0].observationId, obs[1].observationId);
         "
    Expected Result: "2 obs-1 obs-2"
    Evidence: .omo/evidence/task-3-save-observation.txt

  Scenario: Missing file returns null/empty
    Tool: Bash
    Preconditions: storage.ts compiles
    Steps:
      1. node -e "
         const { JsonStorageRepository } = require('./plugins/skill-improver/storage');
         const repo = new JsonStorageRepository();
         console.log('session:', repo.getSession('nonexistent'));
         console.log('obs:', JSON.stringify(repo.getObservations('nonexistent')));
         "
    Expected Result: "session: null" and "obs: []"
    Evidence: .omo/evidence/task-3-missing-file.txt
  ```

  **Commit**: YES (groups with Task 1, 2)
  - Message: `feat(skill-improver): add storage repository with JSON implementation`
  - Files: `plugins/skill-improver/storage.ts`

---

- [x] 4. Session monitor (hooks)

  **What to do**:
  - Create `plugins/skill-improver/monitor.ts`
  - Implement `SessionMonitor` class that:
    - Creates a new session on `session.start` with unique sessionId (UUID)
    - Appends `SessionEvent` on `user.message` and `assistant.message`
    - Appends tool names on `tool.call`
    - On `session.end`: saves the complete session via `StorageRepository.saveSession()`
  - Export hook registration functions that OpenCode plugin system can call
  - Handle edge case: session.start without session.end (timeout/dangling sessions)

  **Must NOT do**:
  - Don't implement the actual OpenCode hook registration (Task 7 wires it)
  - Don't evaluate outcomes (that's Task 6)
  - Don't route to skills (that's Task 5)
  - Don't persist anything mid-session — only on session.end

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward event collector with clear interface
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:254-273` — Session Monitor component design
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:278-294` — SessionEvent and Session data structures
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:706-746` — Core flow (onSessionStart, onSessionEnd)

  **Acceptance Criteria**:
  - [ ] `SessionMonitor` class with `start()`, `recordEvent()`, `end()` methods
  - [ ] Generates unique sessionId on start
  - [ ] Collects events between start and end
  - [ ] Calls `storage.saveSession()` on end
  - [ ] Handles duplicate start calls (idempotent or error)
  - [ ] Handles end without start (no-op)

  **QA Scenarios**:
  ```
  Scenario: Full session lifecycle
    Tool: Bash
    Preconditions: monitor.ts, storage.ts, types.ts all compile
    Steps:
      1. node -e "
         const { SessionMonitor } = require('./plugins/skill-improver/monitor');
         const { JsonStorageRepository } = require('./plugins/skill-improver/storage');
         const repo = new JsonStorageRepository();
         const monitor = new SessionMonitor(repo);
         monitor.start();
         monitor.recordEvent({ role: 'user', content: 'write docker compose', timestamp: new Date().toISOString() });
         monitor.recordEvent({ role: 'assistant', content: 'here is your compose', tools: ['write'], timestamp: new Date().toISOString() });
         const sessionId = monitor.end();
         console.log('sessionId:', sessionId);
         const saved = repo.getSession(sessionId);
         console.log('events:', saved.events.length);
         console.log('first event:', saved.events[0].content);
         "
    Expected Result: sessionId is a non-empty string, events: 2, first event: "write docker compose"
    Evidence: .omo/evidence/task-4-session-lifecycle.txt

  Scenario: End without start is no-op
    Tool: Bash
    Preconditions: monitor.ts compiles
    Steps:
      1. node -e "
         const { SessionMonitor } = require('./plugins/skill-improver/monitor');
         const { JsonStorageRepository } = require('./plugins/skill-improver/storage');
         const repo = new JsonStorageRepository();
         const monitor = new SessionMonitor(repo);
         const result = monitor.end();
         console.log('result:', result);
         "
    Expected Result: "result: null" or "result: undefined"
    Evidence: .omo/evidence/task-4-end-no-start.txt
  ```

  **Commit**: YES (groups with Task 5, 6)
  - Message: `feat(skill-improver): add session monitor with event hooks`
  - Files: `plugins/skill-improver/monitor.ts`

---

- [x] 5. Skill router (keyword-based)

  **What to do**:
  - Create `plugins/skill-improver/router.ts`
  - Implement `KeywordSkillRouter` class implementing `SkillRouter` interface
  - Load skill definitions from `config/skills.json`
  - `route(session: Session)`: concatenate all user messages, check against each skill's `triggers` keywords
  - Return first matching skillId, or `"general"` if no match
  - Case-insensitive matching
  - Store router version in metadata

  **Must NOT do**:
  - Don't use LLM for routing (Phase 2)
  - Don't do semantic matching or embeddings
  - Don't handle multi-skill routing (return first match only)
  - Don't cache skill config (re-read each time for simplicity)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple string matching, no external dependencies
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:424-455` — Skill Router component design
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:446-454` — MVP keyword routing example

  **Acceptance Criteria**:
  - [ ] `KeywordSkillRouter` implements `SkillRouter` interface
  - [ ] Routes "docker compose for postgres" → "docker-skill"
  - [ ] Routes "help me debug this stack trace" → "debug-skill"
  - [ ] Routes "refactor this function" → "refactor-skill"
  - [ ] Routes "hello world" → "general" (no match)
  - [ ] Case-insensitive: "Docker Compose" → "docker-skill"
  - [ ] Returns "general" for empty session

  **QA Scenarios**:
  ```
  Scenario: Keyword routing matches correctly
    Tool: Bash
    Preconditions: router.ts, types.ts compile, config/skills.json exists
    Steps:
      1. node -e "
         const { KeywordSkillRouter } = require('./plugins/skill-improver/router');
         const router = new KeywordSkillRouter();
         const tests = [
           { input: 'write a docker compose for postgres', expected: 'docker-skill' },
           { input: 'help me debug this stack trace error', expected: 'debug-skill' },
           { input: 'refactor this function to be cleaner', expected: 'refactor-skill' },
           { input: 'hello world', expected: 'general' },
           { input: 'DOCKER COMPOSE', expected: 'docker-skill' },
           { input: '', expected: 'general' },
         ];
         let pass = 0;
         for (const t of tests) {
           const session = { sessionId: 'test', events: [{ role: 'user', content: t.input, timestamp: new Date().toISOString() }] };
           const result = router.route(session);
           const ok = result === t.expected;
           console.log(ok ? 'PASS' : 'FAIL', t.input, '→', result, '(expected:', t.expected + ')');
           if (ok) pass++;
         }
         console.log(pass + '/' + tests.length + ' passed');
         "
    Expected Result: All 6 tests PASS
    Evidence: .omo/evidence/task-5-routing-tests.txt

  Scenario: Multi-keyword skill matches first trigger
    Tool: Bash
    Preconditions: router.ts compiles, docker-skill has triggers: [docker, compose]
    Steps:
      1. node -e "
         const { KeywordSkillRouter } = require('./plugins/skill-improver/router');
         const router = new KeywordSkillRouter();
         const session = { sessionId: 'test', events: [{ role: 'user', content: 'i need a compose file', timestamp: new Date().toISOString() }] };
         console.log(router.route(session));
         "
    Expected Result: "docker-skill" (matched by "compose" keyword)
    Evidence: .omo/evidence/task-5-multi-keyword.txt
  ```

  **Commit**: YES (groups with Task 4, 6)
  - Message: `feat(skill-improver): add keyword-based skill router`
  - Files: `plugins/skill-improver/router.ts`

---

- [x] 6. Outcome evaluator (LLM)

  **What to do**:
  - Create `plugins/skill-improver/evaluator.ts`
  - Implement `LLMOutcomeEvaluator` class implementing `OutcomeEvaluator` interface
  - `evaluate(episode, skill, goal)`: construct prompt from template, call LLM, parse JSON response
  - Prompt template (from doc):
    ```
    Analyze this episode.
    Goal: {goal}
    Skill: {skill.name} - {skill.description}
    Episode: {episode.messages}
    Tasks:
    1. Was user satisfied? (look for: thanks, accepted, no retry)
    2. Did agent fail? (look for: repeated ask, user correction, complaint)
    3. Any novel learning? (something the skill should know but doesn't)
    Output JSON: { success_score: 0-1, failure_score: 0-1, novelty_score: 0-1, summary: string, suggested_rule: string }
    ```
  - Handle LLM failures gracefully: retry once, then store error observation
  - Store evaluator version in metadata
  - Parse and validate JSON response structure

  **Must NOT do**:
  - Don't hardcode the LLM provider — use an abstraction (configurable endpoint)
  - Don't implement calibration or scoring thresholds (just raw LLM output)
  - Don't batch or queue evaluations (one per session for MVP)
  - Don't store evaluation history beyond the observation itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LLM integration with prompt engineering, error handling, JSON parsing
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2, Task 3

  **References**:
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:362-405` — Outcome Evaluator component (input/output/interfaces)
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:756-781` — Outcome Evaluator LLM prompt template
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:410-422` — Signal definitions (positive/negative signals)

  **Acceptance Criteria**:
  - [ ] `LLMOutcomeEvaluator` implements `OutcomeEvaluator` interface
  - [ ] Constructs prompt from episode + skill + goal
  - [ ] Calls LLM API and parses JSON response
  - [ ] Validates response has all required fields (success_score, failure_score, novelty_score, summary, suggested_rule)
  - [ ] Retries once on LLM failure
  - [ ] Returns fallback Outcome on persistent failure
  - [ ] Stores evaluatorVersion in result metadata

  **QA Scenarios**:
  ```
  Scenario: Evaluator produces valid outcome for docker session
    Tool: Bash
    Preconditions: evaluator.ts, types.ts, storage.ts compile, LLM endpoint configured
    Steps:
      1. node -e "
         const { LLMOutcomeEvaluator } = require('./plugins/skill-improver/evaluator');
         const evaluator = new LLMOutcomeEvaluator({ endpoint: process.env.LLM_ENDPOINT, apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL });
         const episode = {
           episodeId: 'ep-test',
           sessionId: 'sess-test',
           messages: [
             { role: 'user', content: 'write a docker compose for postgres', timestamp: new Date().toISOString() },
             { role: 'assistant', content: 'here is your compose file', tools: ['write'], timestamp: new Date().toISOString() },
             { role: 'user', content: 'this is missing a healthcheck, fix it', timestamp: new Date().toISOString() },
             { role: 'assistant', content: 'added healthcheck', tools: ['edit'], timestamp: new Date().toISOString() },
           ]
         };
         const skill = { name: 'docker-skill', triggers: ['docker', 'compose'], goal: 'Generate production-ready compose files', workflow: [], rules: [], antiPatterns: [] };
         const goal = 'Generate production-ready Docker Compose files with healthchecks, restart policies, and volumes';
         const outcome = await evaluator.evaluate(episode, skill, goal);
         console.log('success:', outcome.successScore);
         console.log('failure:', outcome.failureScore);
         console.log('novelty:', outcome.noveltyScore);
         console.log('summary:', outcome.summary);
         console.log('rule:', outcome.suggestedRule);
         "
    Expected Result: failureScore > 0.5 (user corrected), summary mentions healthcheck, suggestedRule mentions postgres healthcheck
    Evidence: .omo/evidence/task-6-evaluator-output.txt

  Scenario: Evaluator handles LLM failure gracefully
    Tool: Bash
    Preconditions: evaluator.ts compiles
    Steps:
      1. node -e "
         const { LLMOutcomeEvaluator } = require('./plugins/skill-improver/evaluator');
         const evaluator = new LLMOutcomeEvaluator({ endpoint: 'http://invalid-endpoint:9999', apiKey: 'fake', model: 'fake' });
         const episode = { episodeId: 'ep-test', sessionId: 'sess-test', messages: [{ role: 'user', content: 'test', timestamp: new Date().toISOString() }] };
         const skill = { name: 'test', triggers: [], goal: '', workflow: [], rules: [], antiPatterns: [] };
         const outcome = await evaluator.evaluate(episode, skill, 'test');
         console.log('success:', outcome.successScore, 'failure:', outcome.failureScore, 'summary:', outcome.summary);
         "
    Expected Result: Returns fallback outcome (e.g., successScore: 0, failureScore: 0, summary: "evaluation failed")
    Failure Indicators: Throws uncaught error instead of returning fallback
    Evidence: .omo/evidence/task-6-evaluator-fallback.txt
  ```

  **Commit**: YES (groups with Task 4, 5)
  - Message: `feat(skill-improver): add LLM outcome evaluator`
  - Files: `plugins/skill-improver/evaluator.ts`

---

- [x] 7. Plugin entry point + end-to-end wiring

  **What to do**:
  - Create `plugins/skill-improver/index.ts`
  - Wire all components together:
    - Instantiate `JsonStorageRepository`
    - Instantiate `SessionMonitor` with storage
    - Instantiate `KeywordSkillRouter`
    - Instantiate `LLMOutcomeEvaluator` with config
  - Register OpenCode plugin hooks:
    - `onSessionStart` → `monitor.start()`
    - `onUserMessage` → `monitor.recordEvent()`
    - `onAssistantMessage` → `monitor.recordEvent()`
    - `onToolCall` → `monitor.recordEvent()`
    - `onSessionEnd` → `monitor.end()` → `router.route(session)` → `evaluator.evaluate(episode, skill, goal)` → `storage.saveObservation()` (if failureScore >= 0.6)
  - Export the plugin for OpenCode to load
  - Handle the threshold filter: only store observations with `failureScore >= 0.6`

  **Must NOT do**:
  - Don't add consolidation logic
  - Don't add skill file writing
  - Don't add git operations
  - Don't add cooldown mechanism

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Wiring existing components together, no new logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Tasks 4, 5, 6)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4, Task 5, Task 6

  **References**:
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:679-697` — Plugin structure
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:706-746` — Core flow (session start, during, end)
  - `C:\Users\XAMIN\Desktop\Skill Improver\Skill Improver.md:815-818` — Threshold filter

  **Acceptance Criteria**:
  - [ ] Plugin exports correctly for OpenCode loading
  - [ ] Full pipeline: session → save → route → evaluate → store observation (if failureScore >= 0.6)
  - [ ] Low-failure sessions (failureScore < 0.6) do NOT create observations
  - [ ] All components receive correct dependencies
  - [ ] Error in one component doesn't crash the pipeline

  **QA Scenarios**:
  ```
  Scenario: Full pipeline end-to-end with docker session
    Tool: Bash
    Preconditions: All modules compile, config files exist, LLM endpoint configured
    Steps:
      1. node -e "
         const plugin = require('./plugins/skill-improver/index');
         // Simulate a session where user corrects the agent
         plugin.onSessionStart({ sessionId: 'e2e-test-1' });
         plugin.onUserMessage({ content: 'write a docker compose for postgres and redis' });
         plugin.onAssistantMessage({ content: 'here is your compose', tools: ['write'] });
         plugin.onUserMessage({ content: 'you forgot the healthcheck for postgres' });
         plugin.onAssistantMessage({ content: 'added healthcheck', tools: ['edit'] });
         plugin.onSessionEnd({ sessionId: 'e2e-test-1' });
         // Wait for async evaluation
         setTimeout(() => {
           const { JsonStorageRepository } = require('./plugins/skill-improver/storage');
           const repo = new JsonStorageRepository();
           const session = repo.getSession('e2e-test-1');
           const observations = repo.getObservations('docker-skill');
           console.log('session saved:', !!session);
           console.log('session events:', session ? session.events.length : 0);
           console.log('observations:', observations.length);
           if (observations.length > 0) {
             console.log('failureScore:', observations[0].failureScore);
             console.log('summary:', observations[0].summary);
           }
         }, 5000);
         "
    Expected Result: session saved: true, session events: 4, observations: 1 (failureScore >= 0.6 because user corrected)
    Evidence: .omo/evidence/task-7-e2e-pipeline.txt

  Scenario: Low-failure session does not create observation
    Tool: Bash
    Preconditions: All modules compile, LLM endpoint configured
    Steps:
      1. node -e "
         const plugin = require('./plugins/skill-improver/index');
         plugin.onSessionStart({ sessionId: 'e2e-test-2' });
         plugin.onUserMessage({ content: 'write a docker compose for postgres' });
         plugin.onAssistantMessage({ content: 'here is your compose with healthcheck', tools: ['write'] });
         plugin.onUserMessage({ content: 'thanks, looks good' });
         plugin.onSessionEnd({ sessionId: 'e2e-test-2' });
         setTimeout(() => {
           const { JsonStorageRepository } = require('./plugins/skill-improver/storage');
           const repo = new JsonStorageRepository();
           const observations = repo.getObservations('docker-skill');
           console.log('observations count:', observations.length);
           console.log('no observation stored for low-failure:', observations.length === 0 || !observations.find(o => o.sessionId === 'e2e-test-2'));
         }, 5000);
         "
    Expected Result: "observations count: 0" or "no observation stored for low-failure: true"
    Evidence: .omo/evidence/task-7-low-failure-filter.txt
  ```

  **Commit**: YES
  - Message: `feat(skill-improver): plugin entry point with full pipeline wiring`
  - Files: `plugins/skill-improver/index.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in `.omo/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` on all source files. Review for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Execute ALL QA scenarios from ALL tasks. Verify evidence files exist. Test cross-task integration: session → route → evaluate → store. Test edge cases: empty session, LLM failure, missing skill config.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(skill-improver): project scaffolding, types, and storage` — config/, plugins/skill-improver/types.ts, plugins/skill-improver/storage.ts, .gitignore
- **Wave 2**: `feat(skill-improver): session monitor, router, and evaluator` — plugins/skill-improver/monitor.ts, plugins/skill-improver/router.ts, plugins/skill-improver/evaluator.ts
- **Wave 3**: `feat(skill-improver): plugin entry point and pipeline wiring` — plugins/skill-improver/index.ts

---

## Success Criteria

### Verification Commands
```bash
# Type check all source files
npx tsc --noEmit plugins/skill-improver/*.ts

# Verify directory structure
ls plugins/skill-improver/ config/ data/

# Run end-to-end simulation
node -e "require('./plugins/skill-improver/index')"
```

### Final Checklist
- [ ] All 7 tasks completed with evidence
- [ ] "Must Have" items all present (session hooks, JSON storage, keyword routing, LLM evaluation, observation store, repository interface, versioning, error handling, threshold filter)
- [ ] "Must NOT Have" items all absent (no consolidator, no skill updater, no git ops, no cooldown, no benchmarks, no semantic routing)
- [ ] All QA scenarios pass
- [ ] F1-F4 all APPROVE
- [ ] User explicitly approves final verification