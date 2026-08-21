# 发布前验证计划

本项目只验证本地前端交付，不包含部署、公开域名、HTTPS、CloudBase、Vercel 或多人访问。

## 发布门槛

1. `pnpm run lint` 通过。
2. `pnpm run typecheck` 通过。
3. `pnpm run test:unit` 通过。
4. `pnpm run test:e2e` 通过。
5. `pnpm run test:visual` 通过。
6. `pnpm run build` 通过。
7. 1440px、1024px、390px 核心路由无页面级横向溢出与控制台错误。
8. 高中数学、产品设计、计算机三条演示旅程通过课程隔离验证。
9. 计划未排完时展示 backlog，不阻断本周课表。
10. Plan Recovery 应用、ChangeSet 和撤销可运行。
11. 文档不将本地规则、模拟资源或设计假设描述为真实 AI、真实研究或学习效果。
