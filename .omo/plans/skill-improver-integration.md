# Skill Improver — OpenCode 集成

## TL;DR

将当前的伪 hooks 插件改写为真实 OpenCode 插件系统，使用 `event` 钩子 + `session.idle` 触发管道，SDK client 获取对话记录。

## TODOs

- [x] 1. 创建 .opencode/ 目录结构 + opencode.json 配置
- [x] 2. 安装 @opencode-ai/plugin 类型包
- [x] 3. 重写插件入口为真实 OpenCode 插件格式
- [x] 4. 用 event 钩子 + session.idle 替代伪 hooks
- [x] 5. 端到端测试：启动插件、模拟会话、验证管道

## Final Verification Wave

- [x] F1 类型检查 tsc --noEmit 通过
- [x] F2 插件加载测试：OpenCode 能识别并加载插件
- [x] F3 管道测试：完整 session → observation 链路