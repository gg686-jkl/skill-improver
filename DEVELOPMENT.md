# Skill Improver 开发经验总结

## 1. 架构概览

### 核心流水线

```
session.idle → extract → route → evaluate → store → consolidate → update → regression → review
```

**详细流程：**

1. **Session Idle** — 监听 OpenCode 的 `session.idle` 事件，捕获会话结束信号
2. **Extract** — 增量提取消息，避免重复处理已分析的内容
3. **Route** — 根据消息内容匹配触发词，路由到目标 Skill
4. **Evaluate** — 调用外部 LLM 评估会话质量，输出 success/failure/novelty 分数
5. **Store** — 将评估结果持久化为 Observation 记录
6. **Consolidate** — 当 Observation 积累到阈值后，合并去重生成候选规则
7. **Update** — LLM 将候选规则融入现有 SKILL.md，生成新版本
8. **Regression** — 对比新旧版本评分，确保不会越改越差
9. **Review** — 创建 Review 会话，由用户决定是否采纳

### 数据流

```
用户会话消息 → Episode → Outcome → Observation → Consolidated Rules → Skill Candidate → Review
```

---

## 2. 关键 Bug 与修复

### 2.1 自定义 YAML 解析器无法处理数组

**问题：** 最初实现了简单的 YAML frontmatter 解析器，但无法正确处理数组格式的 `triggers` 字段。

```yaml
# 这种格式解析失败
triggers:
  - docker
  - compose
```

**修复：** 添加字符串解析回退方案，当检测到非数组格式时，按行分割并去除 `- ` 前缀：

```typescript
if (typeof frontmatter.triggers === 'string') {
  const items = frontmatter.triggers
    .split('\n')
    .map(s => s.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
  triggers.push(...items);
}
```

### 2.2 JSON 配置文件损坏

**问题：** Edit 工具在编辑 JSON 文件时产生重复条目，导致配置文件结构损坏。

**修复：** 改用原子写入策略——先写入临时文件，再重命名覆盖：

```typescript
export function writeJSON(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
```

### 2.3 ES 模块中 `__dirname` 未定义

**问题：** TypeScript 编译为 ES 模块后，`__dirname` 不可用，导致路径解析失败。

**修复：** 使用 `fileURLToPath` polyfill：

```typescript
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

### 2.4 `callLLMStructured` 不支持 deepseek-v4-flash

**问题：** deepseek-v4-flash 模型不支持 OpenAI 的 `response_format.json_schema` 结构化输出。

**修复：** 改用 `callLLM` + 手动 JSON 解析：

```typescript
const result = await callLLM(prompt);
if (!result) return null;
try {
  const parsed = typeof result === "string" ? JSON.parse(result) : result;
  if (typeof parsed.successScore === "number" && typeof parsed.summary === "string") {
    return parsed as Outcome;
  }
  return null;
} catch (e) {
  return null;
}
```

### 2.5 `suggestedRule` 为 null 导致 TypeError

**问题：** LLM 返回的 `suggestedRule` 字段可能为 `null`，后续字符串操作抛出 TypeError。

**修复：** 添加空值检查：

```typescript
Suggested rule: ${obs.suggestedRule || "No specific suggestion"}
```

### 2.6 回归测试超时阻止 Review 会话创建

**问题：** 回归测试可能因 LLM 超时而失败，导致整个流水线中断，无法创建 Review 会话。

**修复：** 移除回归测试作为 Review 创建的门控条件，即使回归测试失败也继续创建 Review：

```typescript
// Always create review session (even if regression fails)
await log("info", `[${sessionID}] Creating review session for "${skillId}"`);
```

---

## 3. 设计决策

### 3.1 为什么使用外部 LLM 而不是 OpenCode 自身的 AI？

**原因：**
- **解耦评估与执行**：评估者不应是执行者，避免"自己评自己"的偏差
- **成本控制**：可以使用更便宜的模型（如 deepseek-v4-flash）进行批量评估
- **灵活性**：支持多种 LLM 提供商，便于切换和降级
- **独立性**：即使 OpenCode 主模型不可用，评估流水线仍可运行

### 3.2 为什么手动标记 Session 而不是自动检测？

**原因：**
- **精确控制**：用户明确知道哪些会话被监控，避免意外分析
- **隐私保护**：敏感对话不应被自动分析
- **资源节约**：只分析用户主动标记的会话，减少不必要的 LLM 调用
- **调试友好**：便于复现和测试特定场景

### 3.3 为什么使用文件存储 Observation？

**原因：**
- **简单可靠**：无需额外数据库依赖，降低部署复杂度
- **可审计**：所有观察记录都是人类可读的 JSON 文件
- **易于备份**：直接复制文件即可备份
- **Git 友好**：可以版本控制观察记录的演变
- **调试方便**：直接查看文件即可了解系统状态

### 3.4 为什么使用插件工具进行 Approve/Reject？

**原因：**
- **无缝集成**：用户无需离开 OpenCode 即可完成审批
- **AI 辅助**：AI 可以解释变更内容，帮助用户做出决策
- **原子操作**：审批操作包含文件替换、清理、Git 提交等多个步骤，工具确保原子性
- **可追溯**：所有审批决策都有记录，便于回溯

---

## 4. 模块结构（11 个文件）

```
.opencode/plugins/skill-improver/
├── types.ts          # 核心类型定义（Episode, Outcome, Observation, Skill 等）
├── session.ts        # 会话状态管理、消息提取与格式化
├── router.ts         # Skill 路由（触发词匹配、Skill 加载）
├── evaluator.ts      # 结果评估（调用 LLM 分析会话质量）
├── store.ts          # 观察存储（持久化 Observation 记录）
├── consolidator.ts   # 规则合并（阈值检查、LLM 合并去重）
├── updater.ts        # 候选更新（生成新 SKILL.md 版本）
├── regression.ts     # 回归测试（对比新旧版本评分）
├── llm.ts            # LLM 调用封装（多提供商支持、重试、降级）
├── file-utils.ts     # 文件工具（JSON/YAML 读写、路径解析）
└── git.ts            # Git 操作（提交、分支检查）
```

**主入口：** `skill-improver.ts` — 注册插件工具和事件监听器

**职责划分：**
- **types.ts** — 定义所有数据结构，确保类型安全
- **session.ts** — 管理会话状态，实现增量处理
- **router.ts** — 识别消息属于哪个 Skill
- **evaluator.ts** — 调用 LLM 评估会话质量
- **store.ts** — 持久化观察记录，支持去重
- **consolidator.ts** — 合并多个观察为候选规则
- **updater.ts** — 生成新的 Skill 版本
- **regression.ts** — 验证新版本不会降低质量
- **llm.ts** — 统一 LLM 调用接口，支持多提供商
- **file-utils.ts** — 提供可靠的文件操作
- **git.ts** — 管理版本控制操作

---

## 5. 经验教训

### 5.1 渐进式开发

**教训：** 先实现最小可用版本，再逐步完善。

**实践：**
- Phase 1：只实现 session → observation 流程
- Phase 2：添加 consolidation 和 skill 更新
- Phase 3：添加回归测试和安全机制

### 5.2 防御性编程

**教训：** LLM 输出不可靠，必须做好容错处理。

**实践：**
- 所有 LLM 调用都有 null 检查
- JSON 解析使用 try-catch 包裹
- 关键字段都有默认值或空值处理

### 5.3 原子文件操作

**教训：** 直接写入文件可能导致数据损坏。

**实践：**
- 先写入临时文件，再重命名覆盖
- 使用 `ensureDir` 确保目录存在
- 关键操作记录日志

### 5.4 增量处理

**教训：** 重复处理相同消息会浪费资源。

**实践：**
- 维护 `lastProcessedMessageId` 状态
- 只提取消息 ID 之后的新消息
- 使用 Set 进行去重

### 5.5 并发控制

**教训：** 同一 Session 可能多次触发 `session.idle` 事件。

**实践：**
- 使用 `inFlight` Set 跟踪正在处理的 Session
- 处理完成后立即移除
- 使用 try-finally 确保清理

### 5.6 日志优先

**教训：** 调试分布式系统需要详细的日志。

**实践：**
- 每个模块都有 `debugLog` 函数
- 关键步骤记录输入输出
- 使用文件日志而非 console.log

### 5.7 配置外部化

**教训：** 硬编码配置会限制灵活性。

**实践：**
- LLM 配置从 `config/llm.json` 加载
- 监控的 Skill 列表从 `config/monitored-skills.json` 加载
- 调优参数从 `config/params.json` 加载
- 支持环境变量覆盖

### 5.8 测试策略

**教训：** LLM 相关代码难以单元测试。

**实践：**
- 核心逻辑（路由、存储、状态管理）独立于 LLM
- LLM 调用封装在独立模块，便于 mock
- 使用 debug.log 记录实际调用，便于复现问题

---

## 6. 技术栈

- **运行时：** Bun（OpenCode 插件系统）
- **语言：** TypeScript（ES Module）
- **依赖：**
  - `@opencode-ai/plugin` — OpenCode 插件 SDK
  - `yaml` — YAML 解析（用于 frontmatter）
  - `node:fs`, `node:path`, `node:url` — Node.js 标准库
  - `node:https`, `node:http` — HTTP 客户端
  - `node:child_process` — Git 命令执行

---

## 7. 未来改进方向

1. **语义路由** — 使用 Embedding 替代关键词匹配
2. **Episode 分割** — 自动识别会话中的不同任务
3. **多 Skill 协作** — 支持跨 Skill 的知识迁移
4. **自动基准测试** — 根据历史数据自动生成测试用例
5. **A/B 测试** — 同时维护多个 Skill 版本，对比效果
6. **实时反馈** — 在会话过程中提供即时改进建议

---

## 8. 调试技巧

### 查看日志

```bash
tail -f data/debug.log
```

### 检查观察记录

```bash
cat data/observations/<skill-id>.json | jq
```

### 查看待审批的候选

```bash
ls data/reviews/ | grep pending
```

### 手动触发评估

```typescript
// 在 OpenCode 中调用
skill_improver_watch  // 开始监控
// 进行对话...
skill_improver_unwatch  // 停止监控
```

### 重置状态

```bash
rm data/skill-improver-state.json
rm data/monitored-sessions.json
rm -rf data/observations/*
```
