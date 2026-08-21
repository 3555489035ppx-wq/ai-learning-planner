# 假期跃迁 V2｜Repository Audit

日期：2026-08-16  
范围：现有 React/Vite 前端、核心学习闭环、浏览器真实状态、作品集展示风险。

## 结论

当前仓库不是需要推倒重写的 UI Demo。它已经具备一套值得保留的 Personal Learning System（个人学习系统）骨架：课程事实、诊断置信度、总计划草案、Task Pool、周课表、今日执行、学习证据、周复盘、Plan Recovery、变更预览与撤销。

V2 的正确策略是：**冻结核心业务逻辑，重建表达层与交互层，并把 Evidence → Review → Adapt 提升为产品主叙事。**

## 现有技术与结构

- React 19.2.7、Vite 8.1.4、TypeScript 7、React Router 7。
- 数据保存在 localStorage，包含迁移、备份、导入与恢复逻辑。
- 路由按页面懒加载；受保护页面在 onboarding 完成前会回到首次规划。
- 已有 Node Test Runner 单元测试、Playwright E2E 与视觉回归。
- 全局视觉主要集中在 `tokens.css`、`src/index.css`、`src/v4.css`。
- 主要页面：Landing、PlanningSetup、TodayV4、PlanV4、WeeklyReview、Diagnosis、Resources、ProgressV4、Coaching、SettingsV4。

## 必须保留的产品资产

### Understand

- 高中与大学课程标准化和别名解析。
- 分数、自评、诊断题和执行记录共同构成 Planning Basis。
- 诊断置信度与证据边界已经存在，适合强化成 Confidence-based Diagnosis。

### Plan

- `globalPlanner.ts` 已实现课程预算、阶段、周目标、任务拆分与计划校验。
- `scheduleDomain.ts`、`scheduler.ts`、`scheduleValidator.ts` 已区分任务、Placement、Slot、容量和冲突。
- 计划草案支持预览、启用、版本与撤销，不应被 Calendar UI 替代。

### Execute / Evidence

- 今日任务支持开始、完成、延期、跳过、实际时长、完成程度与备注。
- `domain/evidence.ts` 会把执行行为转换为 task completion、time spent 等证据。
- 每日自检区分客观题、表现任务与自评，避免把所有回答伪装成客观正确率。

### Review / Adapt

- 周复盘基于真实任务事件和证据生成，不制造假趋势。
- Recovery 会识别连续低完成、延期和跳过，并生成可比较方案。
- ChangeSet 支持应用、差异预览与精确撤销，符合 Human-in-the-loop。

## 当前浏览器审计

### 首页

- 优点：已能用课程分数表达起点，主 CTA 明确。
- 问题：仍是典型左文案 + 右白卡；大面积冷白背景、亮蓝大标题和悬空 Card 形成明显 AI Template 感。
- 问题：Hero 纵向占满首屏，下一章节不可见；浏览器下半屏缺少叙事推进。
- 问题：右侧预览只说明“会生成计划”，没有证明计划会根据执行证据继续调整。

### Today

- 优点：已有恢复计划提示、课程筛选与容量解释。
- 问题：真实浏览器当前显示 0/0、0 分钟和大面积 Empty State，作品集状态不可用。
- 问题：任务为空时页面失去中心焦点；没有把 Focus Queue、预计结束时间和 Mini Timeline 形成一个完成闭环。

### Plan

- 优点：已有 Week View、拖动、键盘移动、任务详情和 Task Pool。
- 问题：当前课表是静态 CSS Grid 语义，尚不支持自然 Resize；时间密度与事件布局需要成熟 Calendar Engine。
- 问题：页头、筛选、版本、日期、容量提示和课表层层堆叠，首屏真正的 Calendar 被推到下方。
- 问题：空周显示 7×10 大量“添加任务”，会让界面看起来像未完成表格。

### Weekly Review

- 优点：逻辑上已经把证据限制、未完成任务和调整方案关联。
- 问题：页面当前以空状态结束，无法展示本项目最有竞争力的 Adapt 能力。
- 问题：数据事实、AI Insight、调整前后差异和用户确认尚未形成强视觉序列。

### Navigation / Coaching

- 顶部同时出现“1 对 1 辅导”和“学习教练”，信息架构容易让用户误解为两个相同入口。
- 推荐保留“学习教练”作为系统级计划调整入口；“1 对 1 辅导”只承担真人导师匹配与会话结果回写，两者通过 Evidence 相连。

## 根因

1. 业务逻辑按真实状态诚实展示，但作品集模式没有提供固定、完整、跨页一致的数据快照。
2. 页面结构按功能模块逐步追加，缺少围绕一个主任务的视觉焦点。
3. 全局组件主要靠边框与相同圆角区分，Surface、Elevation、Inset、Floating Control 没有形成语义系统。
4. Calendar 既承担数据表又承担交互容器，导致视觉密度和可操作性互相妥协。
5. “AI”主要隐藏在 provider 和规则里，界面没有把 Input → Reasoning → Proposal → Confirm → Persist 讲清楚。

## V2 改造边界

### 保留

- 数据模型、课程目录、Provider 接口、计划生成、证据、复盘、恢复和 ChangeSet。
- 现有路由和主要 User Flow。
- localStorage 迁移、备份与恢复。
- 现有可访问性基础：语义按钮、焦点恢复、Modal 键盘路径、reduced-motion。

### 重构

- Design Tokens、AppShell、TopNav、Button、Segmented Control、Surface 与 Motion。
- Landing、Today、Plan、Weekly Review 的信息层级和布局。
- Calendar 的呈现和 Drag/Resize 交互层，但不替换任务与计划领域模型。
- Portfolio Mode、固定 Demo Data、截图流程和跨页一致性验证。

### 不做

- 不新增后端、登录、云同步或伪远程 AI。
- 不增加与核心闭环无关的 Dashboard、排行榜、打卡或社交功能。
- 不让第三方 Calendar 直接拥有业务状态；它只负责视图和手势。

## V2 验收重点

- 10 秒内看懂 Understand → Plan → Execute → Evidence → Review → Adapt。
- 1440×900 首页同时看到完整 Hero 与下一章节开头。
- `/plan` 首屏以 Week Calendar 为主角，Task Pool 与解释作为辅助。
- `/weekly-review` 能看到事实、Insight、调整差异和确认动作。
- `?portfolio=true` 使用固定 Demo，不出现 0/0、空课表和随机跨页数据。
- Calendar 的拖动、调整时长、详情、完成、延期、键盘替代路径均可用。

