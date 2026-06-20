# Draft: 项目收尾

## Requirements
1. 写开发经验总结 MD
2. 恢复参数为正常值 + 创建可配置参数文件
3. Git commit → 删除隐私 → 开源 → gh cli 上传 GitHub

## Technical Decisions
- 参数文件: `config/params.json`（consolidation_threshold, min_novelty_score, llm_timeout）
- 隐私: 删除 config/llm.json 中的 apiKey，创建 config/llm.json.example 模板
- 经验总结: 放在项目根目录 `DEVELOPMENT.md`
- GitHub: 用 gh CLI 创建仓库并推送

## Files to create/modify
- `DEVELOPMENT.md` — 开发经验总结
- `config/params.json` — 可配置参数
- `config/llm.json.example` — LLM 配置模板
- `config/llm.json` — 删除 apiKey
- `.gitignore` — 添加 config/llm.json（避免泄露）
- `consolidator.ts` — 从 params.json 读取阈值
- `README.md` — 开源项目说明

## Scope
- INCLUDE: 经验总结、参数配置、隐私清理、GitHub 上传
- EXCLUDE: 功能修改、新功能开发