# Skill Improver — 完整重构计划

## TL;DR

> **Quick Summary**: 将当前的对话搬运器重写为完整的 Skill 学习引擎，实现：增量评估 → Observation 存储 → 跨 session Consolidation → Skill candidate 生成 → Plugin 工具确认 → Git commit。
>
> **Deliverables**:
> - 多模块插件（monitor, evaluator, router, store, consolidator, updater, regression）
> - 外部 LLM API 评估（可配置 + fallback）
> - 关键词路由（MVP）
> - 增量处理（不重复评估已处理消息）
> - 跨 session Consolidation（5 个不同 session 触发）
> - Skill candidate 生成 + 回归验证
> - Plugin 工具确认（approve/reject）
> - Review session（AI 展示 diff，用户确认）
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → F1-F4

---

## Context

### Original Request
用户要求将 Skill Improver 从"对话搬运器"重写为完整的 Skill 学习引擎，实现设计文档的 Phase 1+2+3。

### Interview Summary
**Key Discussions**:
- 范围: Phase 1+2+3 全部实现
- 评估方式: 外部 LLM API（可配置 1 个 + 1 个 fallback）
- 路由方式: 关键词匹配（MVP）
- Skill 配置: 用户手动指定
- 代码结构: 多模块（按设计文档拆分）
- Skill 更新: 人工确认后 commit（Plugin 工具确认）
- 数据收集: 增量处理（不重复评估已处理消息）
- Consolidation: 跨 session 计数（5 个不同 session 触发）

### Oracle Consultation
**Key Recommendations**:
- 增量处理：每次 session.idle 只处理新消息，附带上下文（最近 1-3 轮 + 滚动摘要）
- 跨 session Consolidation：按不同 session 计数，不按 idle 事件计数
- Plugin 工具确认：注册 approve/reject 工具，AI 调用工具执行确认
- Review session：AI 展示 diff，询问用户，调用 plugin 工具

### Design Reference
完整设计文档: `Skill Improver.md`（1034 行）

---

## Work Objectives

### Core Objective
将 Skill Improver 从 104 行的对话搬运器重写为完整的 Skill 学习引擎，实现：Session → 增量评估 → Observation → Consolidation → Skill candidate → Plugin 工具确认 → Git commit。

### Concrete Deliverables
- `.opencode/plugins/skill-improver.ts` — 插件入口
- `.opencode/plugins/skill-improver/` — 多模块目录
  - `monitor.ts` — Session Monitor（增量处理）
  - `extractor.ts` — Episode Extractor（增量提取）
  - `evaluator.ts` — Outcome Evaluator（外部 LLM）
  - `router.ts` — Skill Router（关键词匹配）
  - `store.ts` — Observation Store（持久化）
  - `consolidator.ts` — Consolidator（跨 session）
  - `updater.ts` — Skill Candidate Update
  - `regression.ts` — Regression Eval
  - `storage.ts` — 文件存储层
  - `types.ts` — 类型定义
  - `config.ts` — 配置管理
- `config/skills/*.yaml` — Skill 定义文件（用户手动创建）
- `config/skills.json` — Skill 索引
- `config/llm.json` — LLM 配置（provider + model + apiKey + fallback）
- `data/observations/*.json` — Observation 存储
- `data/benchmarks/*.json` — Benchmark 数据
- `data/reviews/*.json` — Review 记录
- `data/skill-improver-state.json` — 处理状态（per-session cursor）

### Definition of Done
- [ ] `tsc --noEmit` 零错误
- [ ] 插件能被 OpenCode 加载
- [ ] session.idle 触发增量处理
- [ ] 外部 LLM 评估返回结构化 JSON
- [ ] Observation 正确存储（不重复）
- [ ] Consolidation 跨 session 触发（5 个不同 session）
- [ ] Skill candidate 正确生成
- [ ] Regression eval 正确对比
- [ ] Plugin 工具 approve/reject 正确执行
- [ ] Review session 正确创建和交互

### Must Have
- 外部 LLM API 调用（可配置 + fallback）
- 关键词路由（MVP）
- 增量处理（per-session cursor）
- Observation 存储（持久化，去重）
- 跨 session Consolidation（5 个不同 session）
- Skill candidate 生成（YAML 格式）
- Regression eval（新旧对比）
- Plugin 工具确认（approve/reject）
- Review session（AI 展示 diff，用户确认）
- 并发防护（inFlight Set）
- 递归防护（跳过分析 session）

### Must NOT Have (Guardrails)
- 不做 topic segmentation（MVP 简化：1 session = 1 episode）
- 不做 multi-agent voting
- 不做 semantic routing（用关键词匹配）
- 不做 RL scoring
- 不做 embedding search
- 不自动 commit（等人工确认）
- 不调用 OpenCode 自身 AI（用外部 LLM）
- 不重复评估已处理消息（增量处理）
- 不让 AI 直接执行 git commit（plugin 工具负责）

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None（手动验证）
- **Agent-Executed QA**: ALWAYS（每个 task 都有 QA scenarios）

### QA Policy
每个 task 必须有 agent-executed QA scenarios。
Evidence 保存到 `.omo/evidence/task-{N}-{scenario-slug}.{ext}`。

- **LLM 调用**: 用 curl 验证 API 连通性
- **文件存储**: 检查文件是否存在、内容是否正确
- **插件加载**: OpenCode 启动时验证
- **管道完整性**: 模拟 session.idle 事件

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - foundation):
├── Task 1: 类型定义 + 配置管理 [quick]
├── Task 2: 文件存储层 [quick]
└── Task 3: LLM 客户端（可配置 + fallback） [unspecified-high]

Wave 2 (After Wave 1 - core pipeline):
├── Task 4: Session Monitor + Episode Extractor (depends: 1, 2) [unspecified-high]
├── Task 5: Outcome Evaluator (depends: 1, 3) [unspecified-high]
├── Task 6: Skill Router + Skill 配置 (depends: 1, 2) [unspecified-high]
└── Task 7: Observation Store (depends: 1, 2) [unspecified-high]

Wave 3 (After Wave 2 - consolidation + update):
├── Task 8: Consolidator (depends: 7) [unspecified-high]
├── Task 9: Skill Updater (depends: 6, 8) [unspecified-high]
└── Task 10: Regression Eval (depends: 9) [unspecified-high]

Wave 4 (After Wave 3 - integration):
├── Task 11: 插件入口 + 管道串联 (depends: 4, 5, 6, 7, 8, 9, 10) [deep]
└── Task 12: Plugin 工具 + Review session (depends: 11) [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1    | -          | 4, 5, 6, 7 |
| 2    | -          | 4, 6, 7 |
| 3    | -          | 5 |
| 4    | 1, 2       | 11 |
| 5    | 1, 3       | 11 |
| 6    | 1, 2       | 9, 11 |
| 7    | 1, 2       | 8, 11 |
| 8    | 7          | 9 |
| 9    | 6, 8       | 10, 11 |
| 10   | 9          | 11 |
| 11   | 4-10       | 12 |
| 12   | 11         | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks → T1 `quick`, T2 `quick`, T3 `unspecified-high`
- **Wave 2**: 4 tasks → T4 `unspecified-high`, T5 `unspecified-high`, T6 `unspecified-high`, T7 `unspecified-high`
- **Wave 3**: 3 tasks → T8 `unspecified-high`, T9 `unspecified-high`, T10 `unspecified-high`
- **Wave 4**: 2 tasks → T11 `deep`, T12 `unspecified-high`
- **FINAL**: 4 tasks → F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. 类型定义 + 配置管理

  **What to do**:
  - 创建 `types.ts`：定义 Session, Episode, Observation, Outcome, Skill, SkillCandidate, Benchmark, Review 等核心类型
  - 创建 `config.ts`：管理 LLM 配置（provider, model, apiKey, fallback）、skill 配置路径、存储路径、consolidation 阈值
  - 配置文件格式：`config/llm.json`（LLM provider + fallback）、`config/skills.json`（skill 索引）
  - 支持环境变量覆盖：`LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`
  - 状态管理：per-session cursor（lastProcessedMessageId）

  **Must NOT do**:
  - 不要硬编码 API key
  - 不要创建过多配置项（MVP 够用即可）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `Skill Improver.md:278-295` — SessionEvent, Session 数据结构
  - `Skill Improver.md:387-393` — Outcome 数据结构
  - `Skill Improver.md:473-483` — Observation 数据结构
  - `Skill Improver.md:578-605` — Skill YAML schema
  - `开发文档/opencode SDK指南.md:64-68` — SDK 类型导入

  **Acceptance Criteria**:
  - [ ] `types.ts` 包含所有核心类型定义
  - [ ] `config.ts` 能读取 `config/llm.json` 和 `config/skills.json`
  - [ ] 环境变量能覆盖配置文件
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 配置文件读取
    Tool: Bash
    Preconditions: 创建 config/llm.json 和 config/skills.json
    Steps:
      1. 创建 config/llm.json: {"provider": "openai", "model": "gpt-4o-mini", "apiKey": "sk-test", "fallback": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "apiKey": "sk-ant-test"}}
      2. 创建 config/skills.json: {"skills": [{"id": "docker", "name": "Docker Skill", "triggers": ["docker", "compose"], "path": "config/skills/docker-skill.yaml"}]}
      3. 运行 tsc --noEmit
    Expected Result: 零错误，类型正确
    Evidence: .omo/evidence/task-1-config-read.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add type definitions and config management`
  - Files: `types.ts`, `config.ts`

- [x] 2. 文件存储层

  **What to do**:
  - 创建 `storage.ts`：统一的文件读写层
  - 支持 JSON 文件读写（observations, reviews, state）
  - 支持 YAML 文件读写（skill definitions）
  - 目录自动创建（`data/observations/`, `data/reviews/`, `config/skills/`）
  - 原子写入（先写临时文件，再 rename）

  **Must NOT do**:
  - 不要使用数据库（纯文件存储）
  - 不要引入额外依赖（用 node:fs + node:path）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 6, 7
  - **Blocked By**: None

  **References**:
  - `Skill Improver.md:500-506` — 目录结构
  - `.opencode/plugins/skill-improver.ts:7-20` — 当前 loadProcessed/saveProcessed 实现

  **Acceptance Criteria**:
  - [ ] `storage.ts` 导出 readJSON, writeJSON, readYAML, writeYAML 函数
  - [ ] 目录不存在时自动创建
  - [ ] 原子写入（不会因中断导致文件损坏）
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: JSON 读写
    Tool: Bash
    Preconditions: data/ 目录存在
    Steps:
      1. 调用 writeJSON('data/test.json', {test: true})
      2. 调用 readJSON('data/test.json')
      3. 验证返回 {test: true}
      4. 删除 data/test.json
    Expected Result: 读写一致，文件正确创建和删除
    Evidence: .omo/evidence/task-2-json-rw.txt

  Scenario: YAML 读写
    Tool: Bash
    Preconditions: config/skills/ 目录存在
    Steps:
      1. 调用 writeYAML('config/skills/test.yaml', {name: 'test'})
      2. 调用 readYAML('config/skills/test.yaml')
      3. 验证返回 {name: 'test'}
      4. 删除 config/skills/test.yaml
    Expected Result: YAML 格式正确，读写一致
    Evidence: .omo/evidence/task-2-yaml-rw.txt
  ```

  **Commit**: YES
  - Message: `feat(storage): add file storage layer with JSON/YAML support`
  - Files: `storage.ts`

- [x] 3. LLM 客户端（可配置 + fallback）

  **What to do**:
  - 创建 `llm.ts`：外部 LLM API 调用客户端
  - 支持 OpenAI API 格式（兼容大多数 provider）
  - 主 provider 失败时自动切换到 fallback
  - 支持结构化输出（JSON Schema）
  - 超时控制（30s 默认）
  - 错误重试（1 次）

  **Must NOT do**:
  - 不要调用 OpenCode 自身 AI（用外部 HTTP API）
  - 不要硬编码 API endpoint（从配置读取）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `Skill Improver.md:756-781` — Outcome Evaluator Prompt
  - `Skill Improver.md:786-803` — Consolidator Prompt
  - OpenAI API: https://platform.openai.com/docs/api-reference/chat/create
  - Anthropic API: https://docs.anthropic.com/en/api/messages

  **Acceptance Criteria**:
  - [ ] `llm.ts` 导出 `callLLM(prompt, schema)` 函数
  - [ ] 支持 OpenAI 和 Anthropic API 格式
  - [ ] 主 provider 失败时自动切换到 fallback
  - [ ] 返回结构化 JSON（当提供 schema 时）
  - [ ] 超时 30s，重试 1 次
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: LLM 调用成功
    Tool: Bash
    Preconditions: config/llm.json 配置有效的 API key
    Steps:
      1. 调用 callLLM('Say hello', {type: 'object', properties: {greeting: {type: 'string'}}})
      2. 验证返回 JSON 包含 greeting 字段
    Expected Result: 返回结构化 JSON
    Evidence: .omo/evidence/task-3-llm-success.txt

  Scenario: Fallback 触发
    Tool: Bash
    Preconditions: config/llm.json 配置无效的主 provider key，有效的 fallback key
    Steps:
      1. 调用 callLLM('Say hello', null)
      2. 验证主 provider 失败后自动切换到 fallback
      3. 验证最终返回成功结果
    Expected Result: fallback 成功返回
    Evidence: .omo/evidence/task-3-llm-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(llm): add external LLM client with fallback support`
  - Files: `llm.ts`

- [x] 4. Session Monitor + Episode Extractor（增量处理）

  **What to do**:
  - 创建 `monitor.ts`：监听 session.idle 事件，获取对话内容
  - 创建 `extractor.ts`：增量提取新消息（从 lastProcessedMessageId 开始）
  - 保留现有的 guard 逻辑：inFlight 并发防护、标题递归防护
  - 维护 per-session state：lastProcessedMessageId, rollingSummary
  - 格式化对话：过滤 synthetic/ignored，保留 text + tool 调用
  - 附带上下文：最近 1-3 轮对话 + 滚动摘要

  **Must NOT do**:
  - 不要重复处理已处理的消息（增量处理）
  - 不要每次发送整个对话（只发送新消息 + 上下文）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `.opencode/plugins/skill-improver.ts:22-84` — 当前 session.idle 处理逻辑
  - `.opencode/plugins/skill-improver.ts:86-104` — formatConversation 函数
  - `Skill Improver.md:254-295` — Session Monitor 设计
  - `Skill Improver.md:298-358` — Episode Extractor 设计
  - `开发文档/opencode插件开发.md:102-133` — 可用事件列表

  **Acceptance Criteria**:
  - [ ] `monitor.ts` 正确监听 session.idle 事件
  - [ ] `extractor.ts` 增量提取新消息（不重复处理）
  - [ ] Guard 逻辑完整（inFlight, title check）
  - [ ] per-session state 正确维护（lastProcessedMessageId）
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 增量提取
    Tool: Bash
    Preconditions: 有测试对话数据，设置 lastProcessedMessageId
    Steps:
      1. 构造测试消息数组（10 条消息）
      2. 设置 lastProcessedMessageId = 第 5 条消息的 ID
      3. 调用 extractNewMessages(messages, lastProcessedMessageId)
      4. 验证只返回第 6-10 条消息
    Expected Result: 只返回新消息
    Evidence: .omo/evidence/task-4-incremental.txt
  ```

  **Commit**: YES
  - Message: `feat(monitor): add session monitor with incremental extraction`
  - Files: `monitor.ts`, `extractor.ts`

- [x] 5. Outcome Evaluator

  **What to do**:
  - 创建 `evaluator.ts`：使用外部 LLM 评估对话结果
  - 输入：Episode（新消息 + 上下文）+ Skill + Goal
  - 输出：Outcome（successScore, failureScore, noveltyScore, summary, suggestedRule）
  - 使用设计文档的 Evaluator Prompt 模板
  - 支持结构化输出（JSON Schema）

  **Must NOT do**:
  - 不要调用 OpenCode 自身 AI
  - 不要硬编码 prompt（从配置或常量读取）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 3

  **References**:
  - `Skill Improver.md:362-405` — Outcome Evaluator 设计
  - `Skill Improver.md:756-781` — Evaluator Prompt 模板
  - `Skill Improver.md:408-421` — Signal 列表（positive/negative）

  **Acceptance Criteria**:
  - [ ] `evaluator.ts` 导出 `evaluate(episode, skill, goal)` 函数
  - [ ] 返回 Outcome 类型（successScore, failureScore, noveltyScore, summary, suggestedRule）
  - [ ] 使用外部 LLM API（通过 llm.ts）
  - [ ] 支持结构化输出
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 评估成功对话
    Tool: Bash
    Preconditions: config/llm.json 配置有效 API key
    Steps:
      1. 构造一个成功的对话 Episode（用户请求 docker compose，AI 正确生成）
      2. 调用 evaluate(episode, dockerSkill, goal)
      3. 验证返回 Outcome 包含 successScore > 0.5
    Expected Result: 成功对话被正确评估为高分
    Evidence: .omo/evidence/task-5-eval-success.txt
  ```

  **Commit**: YES
  - Message: `feat(evaluator): add outcome evaluator with external LLM`
  - Files: `evaluator.ts`

- [x] 6. Skill Router + Skill 配置

  **What to do**:
  - 创建 `router.ts`：根据关键词匹配识别对话属于哪个 skill
  - 读取 `config/skills.json` 获取 skill 列表和 triggers
  - 匹配逻辑：遍历 skill 的 triggers，检查对话文本是否包含关键词
  - 创建示例 skill YAML 文件（test-skill.yaml）
  - 创建 `config/skills.json` 索引文件

  **Must NOT do**:
  - 不要做语义路由（用关键词匹配）
  - 不要自动创建 skill（用户手动创建）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Tasks 9, 11
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `Skill Improver.md:424-460` — Skill Router 设计
  - `Skill Improver.md:578-605` — Skill YAML schema
  - `Skill Improver.md:903-918` — MVP skill 列表

  **Acceptance Criteria**:
  - [ ] `router.ts` 导出 `route(episode)` 函数
  - [ ] 返回匹配的 skillId 或 null
  - [ ] `config/skills.json` 包含 skill 索引
  - [ ] 示例 `config/skills/test-skill.yaml` 存在
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 关键词匹配
    Tool: Bash
    Preconditions: config/skills.json 包含 test skill（triggers: ['test', 'example']）
    Steps:
      1. 构造包含 'test' 关键词的 Episode
      2. 调用 route(episode)
      3. 验证返回 'test'
    Expected Result: 正确匹配到 test skill
    Evidence: .omo/evidence/task-6-route-match.txt
  ```

  **Commit**: YES
  - Message: `feat(router): add keyword-based skill router and config`
  - Files: `router.ts`, `config/skills.json`, `config/skills/test-skill.yaml`

- [x] 7. Observation Store

  **What to do**:
  - 创建 `store.ts`：存储和管理 Observation
  - 每个 skill 一个 JSON 文件：`data/observations/{skillId}.json`
  - 支持：add, list, count, clear 操作
  - Observation 包含：observationId, skillId, episodeId, failureScore, noveltyScore, summary, suggestedRule, timestamp, sessionId
  - 去重：同一 session 的同一 episode 不重复存储

  **Must NOT do**:
  - 不要使用数据库（纯文件存储）
  - 不要重复 storage.ts 的功能（直接调用）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 8, 11
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `Skill Improver.md:463-506` — Observation Store 设计
  - `Skill Improver.md:473-483` — Observation 数据结构

  **Acceptance Criteria**:
  - [ ] `store.ts` 导出 add, list, count, clear 函数
  - [ ] 每个 skill 独立的 JSON 文件
  - [ ] 自动生成 observationId 和 timestamp
  - [ ] 去重：同一 session 的同一 episode 不重复存储
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 添加和查询 Observation
    Tool: Bash
    Preconditions: data/observations/ 目录存在
    Steps:
      1. 调用 add({skillId: 'test', episodeId: 'ep-1', sessionId: 'ses-1', failureScore: 0.8, noveltyScore: 0.9, summary: 'test', suggestedRule: 'test rule'})
      2. 调用 list('test')
      3. 验证返回 1 条记录
      4. 调用 count('test')
      5. 验证返回 1
      6. 清理测试数据
    Expected Result: 正确存储和查询
    Evidence: .omo/evidence/task-7-store-add.txt
  ```

  **Commit**: YES
  - Message: `feat(store): add observation store`
  - Files: `store.ts`

- [x] 8. Consolidator（跨 session）

  **What to do**:
  - 创建 `consolidator.ts`：合并多个 Observation，防振荡
  - 触发条件：不同 session 的 observation 数量 >= 5
  - 使用设计文档的 Consolidator Prompt 模板
  - 输出：合并后的规则列表（去重、去冲突）
  - 调用外部 LLM 进行合并
  - 过滤条件：noveltyScore >= 0.6 且 suggestedRule 非空

  **Must NOT do**:
  - 不要在 observation < 5 时触发
  - 不要按 idle 事件计数（按不同 session 计数）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: Task 9
  - **Blocked By**: Task 7

  **References**:
  - `Skill Improver.md:508-552` — Consolidator 设计
  - `Skill Improver.md:786-803` — Consolidator Prompt 模板
  - `Skill Improver.md:544-552` — Trigger 条件（>= 5 observations）

  **Acceptance Criteria**:
  - [ ] `consolidator.ts` 导出 `consolidate(skillId)` 函数
  - [ ] 仅当不同 session 的 observation count >= 5 时触发
  - [ ] 调用外部 LLM 进行合并
  - [ ] 返回合并后的规则列表
  - [ ] 过滤低质量 observation（noveltyScore < 0.6）
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 触发 Consolidation
    Tool: Bash
    Preconditions: data/observations/test.json 包含 5 条来自不同 session 的记录
    Steps:
      1. 调用 consolidate('test')
      2. 验证返回合并后的规则列表
      3. 验证规则去重、去冲突
    Expected Result: 返回合并后的规则
    Evidence: .omo/evidence/task-8-consolidate.txt

  Scenario: 未达阈值不触发
    Tool: Bash
    Preconditions: data/observations/test.json 包含 3 条记录
    Steps:
      1. 调用 consolidate('test')
      2. 验证返回 null（未达阈值）
    Expected Result: 返回 null，不触发合并
    Evidence: .omo/evidence/task-8-consolidate-skip.txt
  ```

  **Commit**: YES
  - Message: `feat(consolidator): add cross-session observation consolidation`
  - Files: `consolidator.ts`

- [x] 9. Skill Updater

  **What to do**:
  - 创建 `updater.ts`：根据合并后的 Observation 生成 Skill Candidate
  - 输入：old skill + consolidated observations + goal
  - 输出：new skill YAML（candidate）
  - 使用设计文档的 Consolidator Prompt 模板
  - 生成 candidate 文件：`data/candidates/{skillId}-{timestamp}.yaml`
  - 创建 review record：`data/reviews/{reviewId}.json`

  **Must NOT do**:
  - 不要自动 commit（只生成 candidate）
  - 不要直接修改原 skill 文件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 6, 8

  **References**:
  - `Skill Improver.md:554-605` — Skill Candidate Update 设计
  - `Skill Improver.md:578-605` — Skill YAML schema
  - `Skill Improver.md:786-803` — Consolidator Prompt（用于生成 candidate）

  **Acceptance Criteria**:
  - [ ] `updater.ts` 导出 `updateSkill(skillId, observations)` 函数
  - [ ] 生成 candidate YAML 文件
  - [ ] 创建 review record
  - [ ] 不修改原 skill 文件
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 生成 Skill Candidate
    Tool: Bash
    Preconditions: config/skills/test-skill.yaml 存在，data/observations/test.json 有合并后的规则
    Steps:
      1. 调用 updateSkill('test', consolidatedObservations)
      2. 验证 data/candidates/ 目录生成了新的 YAML 文件
      3. 验证 data/reviews/ 目录生成了 review record
      4. 验证 candidate 包含新规则
      5. 验证原 skill 文件未被修改
    Expected Result: candidate 正确生成，原文件不变
    Evidence: .omo/evidence/task-9-update.txt
  ```

  **Commit**: YES
  - Message: `feat(updater): add skill candidate updater`
  - Files: `updater.ts`

- [x] 10. Regression Eval

  **What to do**:
  - 创建 `regression.ts`：对比新旧 skill 的 benchmark 分数
  - 每个 skill 自带 benchmark：`data/benchmarks/{skillId}.json`
  - Benchmark 格式：`[{input, must_include}]`
  - 使用外部 LLM 评估新旧 skill 对同一输入的输出
  - 输出：`{oldScore, newScore, better: boolean}`

  **Must NOT do**:
  - 不要跳过 regression eval（必须对比）
  - 不要自动 commit（只返回结果）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 9

  **References**:
  - `Skill Improver.md:609-653` — Regression Eval 设计
  - `Skill Improver.md:617-630` — Benchmark 格式
  - `Skill Improver.md:635-653` — Eval 输出和 Commit Strategy

  **Acceptance Criteria**:
  - [ ] `regression.ts` 导出 `evaluateRegression(skillId, candidate)` 函数
  - [ ] 读取 benchmark 数据
  - [ ] 对比新旧 skill 的分数
  - [ ] 返回 `{oldScore, newScore, better}`
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 回归评估通过
    Tool: Bash
    Preconditions: data/benchmarks/test.json 存在，candidate 包含改进
    Steps:
      1. 调用 evaluateRegression('test', candidate)
      2. 验证返回 {oldScore: 数字, newScore: 数字, better: boolean}
      3. 验证 newScore > oldScore 时 better 为 true
    Expected Result: 正确对比分数
    Evidence: .omo/evidence/task-10-regression.txt
  ```

  **Commit**: YES
  - Message: `feat(regression): add regression evaluation`
  - Files: `regression.ts`

- [x] 11. 插件入口 + 管道串联

  **What to do**:
  - 重写 `skill-improver.ts`：串联完整管道
  - 管道流程：session.idle → monitor → extractor → evaluator → router → store → consolidator → updater → regression
  - 保留现有 guard 逻辑（inFlight, title check）
  - 每个步骤记录日志（client.app.log）
  - 错误处理：单个步骤失败不影响其他 session
  - 维护 per-session state（lastProcessedMessageId）

  **Must NOT do**:
  - 不要跳过任何管道步骤
  - 不要自动 commit（只生成 candidate）
  - 不要重复处理已处理消息

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Task 12)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5, 6, 7, 8, 9, 10

  **References**:
  - `.opencode/plugins/skill-improver.ts` — 当前实现
  - `Skill Improver.md:700-746` — 核心流程设计
  - 所有前序 task 的模块

  **Acceptance Criteria**:
  - [ ] `skill-improver.ts` 串联所有模块
  - [ ] session.idle 触发增量处理
  - [ ] 每个步骤有日志记录
  - [ ] 错误处理正确（单个 session 失败不影响其他）
  - [ ] per-session state 正确维护
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: 完整管道执行
    Tool: Bash
    Preconditions: 所有模块已实现，config 配置正确
    Steps:
      1. 模拟 session.idle 事件
      2. 验证管道依次执行：extractor → evaluator → router → store
      3. 验证 observation 正确存储
      4. 验证日志记录完整
    Expected Result: 管道完整执行，observation 存储成功
    Evidence: .omo/evidence/task-11-pipeline.txt

  Scenario: 增量处理
    Tool: Bash
    Preconditions: 同一 session 触发两次 session.idle
    Steps:
      1. 第一次触发：处理消息 1-5
      2. 第二次触发：处理消息 6-10（不重复 1-5）
      3. 验证 lastProcessedMessageId 正确更新
    Expected Result: 增量处理，不重复
    Evidence: .omo/evidence/task-11-incremental.txt
  ```

  **Commit**: YES
  - Message: `feat(plugin): integrate full pipeline with incremental processing`
  - Files: `skill-improver.ts`

- [x] 12. Plugin 工具 + Review session

  **What to do**:
  - 注册 plugin 工具：`skill_improver_approve`, `skill_improver_reject`
  - 创建 Review session：`client.session.create({ title: "Skill Improver - Review {skillId}" })`
  - 发送 Review prompt：包含 reviewId, 旧 skill, 新 candidate, diff, 审查指令
  - AI 在 session 里展示 diff，询问用户，调用 plugin 工具
  - approve → 替换 skill 文件 → git commit → 清空 observations
  - reject → 删除 candidate → 保留 observations

  **Must NOT do**:
  - 不要让 AI 直接执行 git commit（plugin 工具负责）
  - 不要跳过 regression eval

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 11)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 11

  **References**:
  - `Skill Improver.md:645-653` — Commit Strategy
  - `Skill Improver.md:833-843` — Rollback（git commit/revert）
  - `开发文档/opencode SDK指南.md:266-284` — TUI API（showToast）
  - `开发文档/opencode插件开发.md:140-145` — tui.toast.show 事件
  - `开发文档/opencode插件开发.md:196-218` — 自定义工具（tool helper）

  **Acceptance Criteria**:
  - [ ] `skill_improver_approve` 工具正确注册
  - [ ] `skill_improver_reject` 工具正确注册
  - [ ] Review session 正确创建
  - [ ] Review prompt 包含完整信息（reviewId, 旧 skill, 新 candidate, diff）
  - [ ] approve 执行：替换 skill 文件 → git commit → 清空 observations
  - [ ] reject 执行：删除 candidate → 保留 observations
  - [ ] `tsc --noEmit` 零错误

  **QA Scenarios**:
  ```
  Scenario: Approve 流程
    Tool: Bash
    Preconditions: candidate 已生成，review record 已创建
    Steps:
      1. 调用 skill_improver_approve({ reviewId: 'test' })
      2. 验证 skill 文件被替换
      3. 验证 git commit 执行
      4. 验证 observations 被清空
      5. 验证 review record 状态变为 approved
    Expected Result: approve 正确执行所有副作用
    Evidence: .omo/evidence/task-12-approve.txt

  Scenario: Reject 流程
    Tool: Bash
    Preconditions: candidate 已生成，review record 已创建
    Steps:
      1. 调用 skill_improver_reject({ reviewId: 'test' })
      2. 验证 candidate 文件被删除
      3. 验证 observations 保留
      4. 验证 review record 状态变为 rejected
    Expected Result: reject 正确执行
    Evidence: .omo/evidence/task-12-reject.txt
  ```

  **Commit**: YES
  - Message: `feat(confirm): add plugin tools and review session`
  - Files: `skill-improver.ts`

---
## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit`. Review all changed files for: `as any`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(types): add type definitions and config management` — types.ts, config.ts
- **Wave 2**: `feat(core): add evaluator, router, store, monitor` — evaluator.ts, router.ts, store.ts, monitor.ts, extractor.ts
- **Wave 3**: `feat(learning): add consolidator, updater, regression eval` — consolidator.ts, updater.ts, regression.ts
- **Wave 4**: `feat(plugin): integrate pipeline and confirmation flow` — skill-improver.ts, storage.ts
- **Final**: `chore: final verification and cleanup`

---

## Success Criteria

### Verification Commands
```bash
tsc --noEmit                    # Expected: 0 errors
ls .opencode/plugins/           # Expected: skill-improver.ts + skill-improver/ directory
ls config/skills/               # Expected: *.yaml files
ls data/observations/           # Expected: *.json files after processing
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `tsc --noEmit` passes
- [ ] Plugin loads in OpenCode
- [ ] Full pipeline works end-to-end
