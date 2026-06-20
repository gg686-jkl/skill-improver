# Draft: Skill Improver 重构计划

## Requirements (confirmed)
- **范围**: Phase 1+2+3 全部实现
- **评估方式**: 外部 LLM API（可配置 1 个 + 1 个 fallback）
- **路由方式**: 关键词匹配（MVP）
- **Skill 配置**: 用户手动指定
- **代码结构**: 多模块（按设计文档拆分）
- **Skill 更新**: Plugin 工具确认（approve/reject）
- **数据收集**: 增量处理（不重复评估已处理消息）
- **Consolidation**: 跨 session 计数（5 个不同 session 触发）

## Technical Decisions
- LLM: 可配置 provider + model + apiKey，支持 fallback
- Skill YAML: 手动创建，放在 config/skills/ 目录
- Observation: 存储在 data/observations/ 目录
- Consolidation: 跨 session 计数（5 个不同 session）
- Regression Eval: 对比新旧 skill 的 benchmark 分数
- Git commit: Plugin 工具确认后执行
- Review session: AI 展示 diff，用户确认，调用 plugin 工具
- 增量处理: per-session cursor（lastProcessedMessageId）

## Oracle Consultation
- 增量处理：每次 session.idle 只处理新消息，附带上下文
- 跨 session Consolidation：按不同 session 计数，不按 idle 事件
- Plugin 工具确认：注册 approve/reject 工具，AI 调用工具执行确认
- Review session：AI 展示 diff，询问用户，调用 plugin 工具

## Scope Boundaries
- INCLUDE: Session Monitor, Episode Extractor, Outcome Evaluator, Skill Router, Observation Store, Consolidator, Skill Updater, Regression Eval, Plugin 工具确认
- EXCLUDE: Topic segmentation, multi-agent voting, semantic routing, RL scoring, embedding search

## Plan Status
- Plan generated: `.omo/plans/skill-improver-refactor.md`
- Tasks: 12 implementation + 4 verification
- Waves: 4 parallel waves + final verification