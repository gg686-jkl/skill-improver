

---

# Skill Improver v2 — OpenCode 自动 Skill 学习系统开发文档

## 1. 背景（Background）

随着 Agent 使用频率增加，传统 Skill（Prompt / Workflow / Rules）会出现一个问题：

> Skill 是静态的，而用户需求是动态演化的。

例如在 **[OpenCode 官方站](https://opencode.ai?utm_source=chatgpt.com)** 中，一个 `docker-skill` 可能最初只包含：

```yaml
rules:
  - generate docker-compose.yml
```

但随着用户长期使用，系统可能逐渐发现：

* PostgreSQL 通常需要 healthcheck
* Redis 需要 restart policy
* 开发环境与生产环境配置不同
* 用户偏好 volume mount

这些信息并不会自动进入 Skill。

现有方案主要有三类：

---

## 1.1 手动改进（Manual Improvement）

开发者手动观察问题并更新 skill：

```text
发现问题 → 修改 SKILL.md → 测试 → 提交
```

问题：

* 人工成本高
* 容易遗漏
* 无法规模化

---

## 1.2 定时批处理学习（Batch Learning）

周期性分析大量历史记录：

```text
logs → batch analysis → update skill
```

问题：

* 上下文太大
* token 成本高
* 容易引入噪音

---

## 1.3 在线学习（Online Learning）

实时根据用户交互更新行为。

问题：

* 容易过拟合
* 容易震荡（oscillation）
* 缺少安全机制

---

# 2. 问题定义（Problem Statement）

我们希望构建一个系统，满足：

### Functional Goals

* 自动跟踪用户 session
* 自动提炼改进信号
* 自动更新 skill
* 支持多 skill
* 可回溯

---

### Non-functional Goals

* 用户无感
* 不干扰主会话
* 成本可控
* 防止错误学习
* 支持 rollback

---

### 核心问题

如何让 Agent：

> 从真实对话中持续学习 decision policy，而不是记忆具体回答。

---

# 3. 设计目标（Design Goals）

系统目标：

---

## G1 无感学习

用户无需执行：

```bash
/evolve
/improve
/train
```

学习自动发生。

---

## G2 Skill 对齐

学习必须围绕明确目标：

例如：

```text
当用户请求 Docker compose 时，生成 production-ready compose
```

---

## G3 稳定更新

防止：

```text
session1 -> 改坏
session2 -> 又改回来
```

即：

避免 oscillation。

---

## G4 可回滚

每次 skill 更新都必须：

* 可比较
* 可回退
* 可审计

---

# 4. 核心理念（Core Philosophy）

Skill Improver 不学习：

```text
answer
```

而学习：

```text
decision policy
```

例如：

不学习：

> docker compose 长什么样

而学习：

```text
If postgres exists:
    include healthcheck
```

即：

---

## 4.1 Skill = Policy

Skill 定义：

```text
When to do
What to do
How to do
What to avoid
```

---

## 4.2 Learning Unit = Observation

不是：

```text
session -> directly update skill
```

而是：

```text
session -> observation -> consolidate -> update skill
```

---

# 5. 系统架构（Architecture）

```text
Session Monitor
    ↓
Episode Extractor
    ↓
Outcome Evaluator
    ↓
Skill Router
    ↓
Observation Store
    ↓
Consolidator
    ↓
Skill Candidate Update
    ↓
Regression Eval
    ↓
Commit / Revert
```

---

# 6. 组件设计（Components）

---

# 6.1 Session Monitor

负责监听 OpenCode 生命周期。

Hook：

```ts
session.start
user.message
assistant.message
tool.call
session.end
```

职责：

* 记录对话
* 记录工具调用
* 保存原始 session

---

## 数据结构

```ts
interface SessionEvent {
  role: "user" | "assistant"
  content: string
  tools?: string[]
  timestamp: string
}
```

完整 session：

```ts
interface Session {
  sessionId: string
  events: SessionEvent[]
}
```

---

# 6.2 Episode Extractor

## 为什么需要 Episode？

因为：

```text
human + assistant
```

太细。

例如：

User:

> 写 docker compose

Assistant:

> ...

User:

> 加 redis

Assistant:

> ...

User:

> 加 healthcheck

这是一个任务。

不该拆成 3 个 chunk。

---

## Episode 定义

```ts
interface Episode {
  episodeId: string
  sessionId: string
  messages: SessionEvent[]
}
```

---

## MVP 简化

第一版：

```text
1 session = 1 episode
```

后续再做 topic split。

---

# 6.3 Outcome Evaluator

核心模块。

判断：

* 用户是否满意？
* Agent 是否失败？
* 是否值得学习？

---

## 输入

```ts
episode
skill
goal
```

---

## 输出

```ts
interface Outcome {
  successScore: number
  failureScore: number
  noveltyScore: number
  summary: string
}
```

示例：

```json
{
  "successScore": 0.2,
  "failureScore": 0.8,
  "noveltyScore": 0.9,
  "summary": "postgres service missing healthcheck"
}
```

---

## Signal

### Positive

* 谢谢
* accepted
* no retry

### Negative

* repeated ask
* user correction
* complaint

---

# 6.4 Skill Router

作用：

识别 episode 属于哪个 skill。

---

## 输入

```ts
episode
```

输出：

```ts
skillId
```

---

## MVP

Keyword routing：

```ts
if (text.includes("docker")) return "docker-skill"
if (text.includes("stack trace")) return "debug-skill"
```

---

## V2

LLM routing。

---

# 6.5 Observation Store

最重要。

Observation 是系统记忆。

---

## 数据结构

```ts
interface Observation {
  observationId: string
  skillId: string
  episodeId: string
  failureScore: number
  noveltyScore: number
  summary: string
  suggestedRule: string
}
```

---

示例：

```json
{
  "summary": "Agent omitted healthcheck",
  "suggestedRule": "Postgres should include healthcheck"
}
```

---

目录：

```text
data/
  observations/
    docker-skill.json
```

---

# 6.6 Consolidator

防止 skill oscillation。

---

## 为什么需要？

坏设计：

```text
chunk1 -> update skill
chunk2 -> update skill
chunk3 -> update skill
```

导致：

规则来回变化。

---

好设计：

```text
chunk1 -> observation
chunk2 -> observation
chunk3 -> observation
        ↓
 consolidate
        ↓
 update skill
```

---

## Trigger

```ts
if observations >= 5
```

执行 consolidation。

---

# 6.7 Skill Candidate Update

生成新的 skill candidate。

---

输入：

```text
old skill
+ observations
+ goal
```

输出：

```yaml
new skill
```

---

## Skill Schema

```yaml
name: docker-skill

description:
  Generate production-ready compose files

triggers:
  - docker
  - compose

workflow:
  - inspect stack
  - detect services
  - generate compose
  - add healthcheck

rules:
  - postgres requires healthcheck
  - redis requires restart

anti_patterns:
  - missing volume
  - missing healthcheck

examples:
  - input: laravel + postgres
    output: ...
```

---

# 6.8 Regression Eval

更新 skill 前必须验证。

否则可能越学越差。

---

## Benchmark

每个 skill 自带：

```json
[
  {
    "input": "docker compose for postgres",
    "must_include": [
      "healthcheck"
    ]
  }
]
```

---

## Eval 输出

```json
{
  "oldScore": 84,
  "newScore": 91
}
```

---

## Commit Strategy

```ts
if newScore > oldScore:
    commit()
else:
    revert()
```

---

# 7. 存储结构（Storage）

```text
skill-improver/
│
├── config/
│   ├── skills.json
│   └── goals.json
│
├── data/
│   ├── sessions/
│   ├── observations/
│   └── benchmarks/
│
├── skills/
│   ├── docker-skill.yaml
│   └── debug-skill.yaml
│
└── logs/
```

---

# 8. OpenCode 插件适配

推荐插件结构：

```text
plugins/
  skill-improver/
    ├── index.ts
    ├── hooks.ts
    ├── monitor.ts
    ├── extractor.ts
    ├── evaluator.ts
    ├── router.ts
    ├── observation.ts
    ├── consolidator.ts
    ├── updater.ts
    ├── eval.ts
    └── storage.ts
```

---

# 9. 核心流程

---

## Session Start

```ts
onSessionStart(() => {
  monitor.reset()
})
```

---

## During Session

记录：

```ts
onUserMessage()
onAssistantMessage()
onToolCall()
```

---

## Session End

```ts
onSessionEnd(async session => {
   saveSession(session)
   const episode = extract(session)
   const skill = route(episode)
   const observation = evaluate(episode, skill)
   store(observation)

   if (shouldConsolidate(skill)) {
      const candidate = updateSkill(skill)
      const result = eval(candidate)

      if (result.better) {
         commit(candidate)
      }
   }
})
```

---

# 10. LLM Prompts

---

## Outcome Evaluator Prompt

```text
Analyze this episode.

Goal:
{goal}

Skill:
{skill}

Episode:
{episode}

Tasks:
1. Was user satisfied?
2. Did agent fail?
3. Any novel learning?

Output JSON:
{
 success_score,
 failure_score,
 novelty_score,
 summary,
 suggested_rule
}
```

---

## Consolidator Prompt

```text
Current Skill:
{skill}

Observations:
{observations}

Goal:
{goal}

Update skill by:
1. preserving stable rules
2. merging repeated observations
3. removing conflicting rules

Output YAML only.
```

---

# 11. 安全机制（Safety）

---

## 11.1 Threshold Filter

过滤低价值样本。

```ts
if failureScore < 0.6:
    skip
```

---

## 11.2 Cooldown

防止频繁更新：

```ts
if updatedWithin(24h):
    skip
```

---

## 11.3 Rollback

使用 git：

```bash
git commit
git revert
```

---

# 12. MVP 开发路线

---

# Phase 1 — Closed Loop（1–2 天）

实现：

* Session hook
* Save session
* Skill router
* Outcome evaluator
* Observation store

流程：

```text
session → observation
```

目标：

验证学习信号提取。

---

# Phase 2 — Auto Learning（2–4 天）

实现：

* Consolidator
* Skill updater
* Git commit

流程：

```text
observation → skill update
```

---

# Phase 3 — Safe Learning（3–5 天）

实现：

* benchmark
* eval
* rollback

流程：

```text
candidate → eval → commit/revert
```

---

# 13. MVP 范围（建议）

第一版只做：

### 支持 skill 数量

```text
1–3 skills
```

例如：

* docker-skill
* debug-skill
* refactor-skill

---

### 不做

先不做：

* topic segmentation
* multi-agent voting
* semantic routing
* RL scoring
* embedding search

---

# 14. 性能预估

假设：

* 100 sessions/day
* 1 episode/session
* 10% 进入 observation
* 20 observations/skill/day

成本：

---

## LLM Calls

Phase 1：

每 session：

1 次 evaluator

≈ 100 calls/day

---

## Consolidation

每 5 observations：

≈ 4 calls/day

---

总计：

```text
104 calls/day
```

可控。

---

# 15. Future Roadmap

---

## V2

加入：

* semantic routing
* episode split
* embedding memory

---

## V3

加入：

* skill graph
* cross-skill transfer
* self-play eval

---

## V4

最终目标：

从：

```text
Static Skills
```

进化到：

```text
Self-Evolving Skills
```

---

# 16. 总结

Skill Improver 是一个后台 Meta-Agent。

它负责：

* 自动监控 OpenCode session
* 自动提炼 failure / novelty
* 自动学习 decision policy
* 自动更新 skill
* 自动验证并回滚

一句话定义：

> 一个无感运行的 Skill Learning Engine，让 OpenCode 在真实用户交互中持续进化。

---

