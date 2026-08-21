# 作品集交付测试报告

执行日期：2026-08-21（本地 Windows 环境）。

## 结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 静态规范 | `pnpm run lint` | 通过 |
| 类型检查 | `pnpm run typecheck` | 通过 |
| 单元测试 | `pnpm run test:unit` | 107 / 107 通过 |
| 全量端到端 | `pnpm run test:e2e` | 18 / 18 通过 |
| 视觉回归 | `pnpm run test:visual` | 1 / 1 通过 |
| 生产构建 | `pnpm run build` | 通过 |

## 覆盖的作品集旅程

1. 高中数学 9/100：页面显示低置信度与基础诊断；存在待安排/未完成任务时，今日页提供 Plan Recovery 方案入口。
2. 产品设计：Photoshop、Illustrator、Rhino 在计划页保留独立课程上下文，不出现数学、Python 或数据结构内容。
3. 计算机：Python、数据结构与高等数学同时存在时，课程及任务不出现 Photoshop、Illustrator 或 Rhino 串用。

端到端套件还覆盖了资源加入计划、任务完成、延期、跳过、任务池回流、下周安排、周复盘应用、ChangeSet 撤销、刷新持久化、移动端无页面级横向溢出和控件可访问名称。

本轮产品化整理后重新验证了首页 Demo 入口、六科 Demo 计划标题、课程隔离和所有核心路由。npm 直装未作为门禁依据：当前工作机的全局 npm 解析配置对本项目触发 workspace/离线依赖解析错误；`pnpm install --frozen-lockfile --offline` 已通过，仓库以 `pnpm-lock.yaml` 作为可复现安装来源。

## 视觉证据

视觉回归使用“高中数学 9/100 + 低置信度诊断 + 恢复信号”本地演示数据，并检查：

- 1440×900：首页、学习概况、诊断、学习计划、今日、学习资源、学习进展、周复盘、设置和 Plan Recovery 对话框；
- 390×844：首页、今日、诊断、学习计划、周复盘和设置；
- 全部页面无控制台 error，且 `scrollWidth - clientWidth <= 1`。

截图位于 [`docs/screenshots/after/`](../screenshots/after/)。

## 诚实边界

这些验证覆盖前端本地数据、mock provider 与浏览器交互；不代表真实 AI API、云端同步、真实学习效果或外部视频可用性的验证。详见 [限制说明](./limitations.md)。
