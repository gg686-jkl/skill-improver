# Skill Improver

OpenCode 插件，自动从会话中学习并改进 Skill 定义。

## 架构

```
用户会话
    ↓
Session Monitor (监听 session.idle 事件)
    ↓
Episode Extractor (提取增量消息)
    ↓
Skill Router (匹配目标 Skill)
    ↓
Outcome Evaluator (LLM 评估成功/失败/新颖度)
    ↓
Observation Store (持久化观察记录)
    ↓
Consolidator (合并去重规则)
    ↓
Skill Candidate Update (生成候选更新)
    ↓
Regression Eval (回归测试)
    ↓
Review Session (人工审批)
    ↓
Commit / Revert
```

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url>
cd skill-improver

# 2. 配置 LLM
cp config/llm.json.example config/llm.json
# 编辑 config/llm.json，填入 API key

# 3. 配置监控的 Skill
# 创建 config/monitored-skills.json
echo '{"skills": ["your-skill-name"]}' > config/monitored-skills.json

# 4. 启动 OpenCode
# 在项目目录下启动 OpenCode 会话

# 5. 开始监控
# 对 AI 说："监控这个 session"

# 6. 正常对话
# 插件会在后台自动分析并生成改进建议
```

## 配置

### config/llm.json

LLM API 配置：

```json
{
  "provider": "openai",
  "model": "deepseek-v4-flash",
  "apiKey": "sk-xxx",
  "baseUrl": "https://api.openai.com/v1"
}
```

支持 `openai` 和 `anthropic` 两种 provider。可选 `fallback` 字段配置备用模型。

### config/monitored-skills.json

监控的 Skill 列表：

```json
{
  "skills": ["math-tutor", "docker-skill"]
}
```

### config/params.json

调优参数（可选）。

## 工作原理

1. **Session 监听**: 插件监听 `session.idle` 事件，捕获会话结束信号
2. **消息提取**: 增量提取新消息，避免重复处理
3. **Skill 路由**: 根据消息内容匹配触发词，找到目标 Skill
4. **LLM 评估**: 调用 LLM 分析会话质量，输出 success/failure/novelty 分数
5. **观察存储**: 将评估结果持久化为 Observation 记录
6. **规则合并**: 当 Observation 积累到阈值后，合并去重生成候选规则
7. **候选更新**: LLM 将候选规则融入现有 SKILL.md，生成新版本
8. **回归测试**: 对比新旧版本评分，确保不会越改越差
9. **人工审批**: 创建 Review 会话，由用户决定是否采纳

## 插件工具

| 工具 | 说明 |
|------|------|
| `skill_improver_watch` | 开始监控当前会话 |
| `skill_improver_unwatch` | 停止监控当前会话 |
| `skill_improver_approve` | 批准 Skill 改进提案 |
| `skill_improver_reject` | 拒绝 Skill 改进提案 |

## 目录结构

```
skill-improver/
├── config/
│   ├── llm.json              # LLM 配置
│   ├── monitored-skills.json # 监控列表
│   └── params.json           # 调优参数
├── data/
│   ├── observations/         # 观察记录
│   ├── candidates/           # 候选更新
│   ├── reviews/              # 审批记录
│   └── debug.log             # 调试日志
├── .opencode/
│   ├── plugins/              # 插件源码
│   └── skills/               # Skill 定义
└── package.json
```

## License

MIT