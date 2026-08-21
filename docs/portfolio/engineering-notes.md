# 工程实现说明

- React 19、Vite 和 TypeScript 构成前端运行时。
- Store 负责本地状态、schema 迁移、跨标签同步、Toast 与 localStorage 持久化。
- `scheduleDomain.ts` 将旧的 `LearningTask` 编辑入口同步到 Stage、Task Pool、Placement 和 Weekly Schedule 领域模型。
- `scheduler.ts` 只为目标自然周排程；剩余任务保留为 backlog。
- `scheduleValidator.ts` 将 backlog 定义为可恢复提示，而不是阻断错误。
- `domain/recovery.ts` 根据真实执行事件生成 Recovery Signal 和可确认的恢复方案。
- `ChangeSet` 记录计划变更并支持精确撤销。
- Provider 接口可替换；当前实现是明确标记的本地规则 provider。
- 测试使用 Node Test Runner、Playwright E2E 和视觉截图回归。
