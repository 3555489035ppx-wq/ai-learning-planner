# 假期跃迁 V2｜Visual & Product Research

日期：2026-08-16  
设计方向：Soft Academic Instrument（柔和学习工具）  
核心闭环：Understand → Plan → Execute → Evidence → Review → Adapt

## 研究原则

- 借布局、层级、交互模型和产品方法，不复制品牌、页面或功能组合。
- UI 必须让学生更快决定“现在学什么”和“计划为什么改变”。
- AI 只在判断、建议和调整中出现，不以聊天框、星星或大面积装饰占据视觉中心。

## 用户参考图 1｜Color / Surface / Atmosphere

状态：**本轮附件中缺少原图，尚未完成视觉核对。**

已知要求：冷白与淡灰背景、极弱蓝灰、柔和光影、Surface 主要由亮度、阴影、模糊和对比建立；避免传统 Neumorphism 的低对比问题。

- What to borrow：背景与表面之间的柔和层次、抬升与内嵌语义。
- What not to copy：白底白字、过度浮雕、所有控件同一材质。
- Mapping：AppShell、Planner、Today、表单输入、浮动控制条。

## 用户参考图 2｜Module / Control / Depth

状态：**本轮附件中缺少原图，尚未完成视觉核对。**

已知要求：Soft Raised Surface、Inset Surface、Floating Control、Compact Utility Control。

- What to borrow：模块通过空间和触感建立层级，不依赖粗边框。
- What not to copy：把每一行都做成独立圆角卡片。
- Mapping：Calendar Toolbar、Task Detail、Segmented Control、Progress 与 Mini Statistics。

## 用户参考图 3｜Button / Interaction

状态：**本轮附件中缺少原图，尚未完成视觉核对。**

已知要求：按钮具有 Idle、Hover、Pressed、Loading、Success、Disabled、Focus；按下时产生轻微内嵌和位移反馈。

- What to borrow：短促、物理但克制的状态变化。
- What not to copy：弹跳、磁吸、强光晕与无意义循环动效。
- Mapping：生成计划、应用调整、任务完成、日期导航和辅助控件。

## Simon Rico

Reference: https://simonrico.com/

- Why it works：复杂产品被组织成可信、透明、可扩展的工具；强调 intuitive、beautiful、deeply human。
- What to borrow：把复杂系统收敛为少量明确动作；用层级和上下文解释建立信任。
- What not to copy：Web3、空间计算或金融产品的品牌符号与视觉语言。
- Mapping：诊断置信度、计划理由、调整差异与撤销路径。

## Jordan Borth

Reference: https://dribbble.com/jordanborth

- Why it works：Mac Utility、Popover、Tool State 与 inline workflow 让操作保持在当前上下文。
- What to borrow：紧凑浮动控制、就地编辑、即时状态反馈。
- What not to copy：旧式拟物材质与纯展示型 Dribbble 场景。
- Mapping：Calendar Event Detail、Task Quick Actions、Mini Timeline 与 Segment Control。

## Daniil Chebotarev

Reference: https://www.daniilch.design/

- Why it works：设计与真实代码结合，Motion、Interaction 和细节服务于产品行为。
- What to borrow：把动效放在状态转换和直接操控上，而不是页面装饰上。
- What not to copy：与学习工具无关的 WebGL 或实验性表现。
- Mapping：生成计划阶段、事件逐项出现、拖放反馈、应用调整前后变化。

## Sunsama｜Guided Planning

References:

- https://help.sunsama.com/docs/usage-guides/daily-planning/
- https://help.sunsama.com/docs/usage-guides/weekly-objectives/weekly-review/

- Why it works：Daily Planning 被拆成 Reflect → Add Tasks → Workload → Finalize；Weekly Review 先回看目标和时间，再进入下一阶段。
- What to borrow：仪式化但短的规划流程、负荷预测、关机时间、事实先于建议。
- What not to copy：面向职场的频道、会议和团队集成结构。
- Mapping：Onboarding、Today Focus Queue、Daily Capacity、Weekly Review。

## Amie｜Todo + Calendar

References:

- https://amie.so/documentation/features/tasks
- https://amie.so/documentation/features/ai-scheduling

- Why it works：Task 与 Calendar 同屏；任务可以拖入时间轴、移动和 Resize；AI 建议后仍允许手动调整。
- What to borrow：Task Pool → Calendar 的直接操控、Duration 优先、Manual Override。
- What not to copy：通用生产力软件的 Inbox/List 体系。
- Mapping：学习任务池、周课表、任务时长、AI 排程后的可编辑性。

## Motion｜Adaptive Scheduling

References:

- https://www.usemotion.com/help/time-management/auto-scheduling
- https://www.usemotion.com/help/time-management/auto-scheduling/reference-auto-scheduling/how-auto-scheduling-works-behind-the-scenes

- Why it works：Duration、Deadline、Priority、Availability 共同决定排程；发生冲突后会重算；无法安排时明确标记 unschedulable。
- What to borrow：动态计划、任务拆块、明确失败状态、变化后重新优化。
- What not to copy：企业项目管理、自动重排一切以及让用户失去控制。
- Mapping：学习任务长度、休息、连续延期信号、Recovery Proposal 与人工确认。

## Akiflow｜Today + Time Blocking

References:

- https://product.akiflow.com/articles/0741055-today-page
- https://product.akiflow.com/help/articles/8286936-task-planning

- Why it works：Today 只显示当天已决定的事情；任务从 Today 拖入 Calendar 后仍保留在完成语境中。
- What to borrow：Focus Queue 与 Calendar 同步、待办和已安排的清晰区别。
- What not to copy：通用 Inbox 和大量外部集成。
- Mapping：Today 三任务队列、Mini Timeline、Task Pool 与周计划。

## 现有假期跃迁

References:

- `docs/screenshots/after/landing-1440x900.png`
- `docs/screenshots/after/today-1440x900.png`
- `docs/screenshots/after/plan-1440x900.png`
- `docs/screenshots/after/weekly-review-1440x900.png`

- Why it works：产品逻辑诚实、信息完整、拥有可撤销的计划调整。
- What to borrow：课程事实、Planning Basis、Task Pool、证据边界和 Recovery。
- What not to copy：亮蓝大标题、白卡 + 细边框、相同圆角、模块堆叠和空状态主导。
- Mapping：V2 不改变核心领域模型，只重建视觉与交互表达。

## 最终设计规则

1. 首页不是营销 Hero，而是把完整自适应闭环压缩成一个可读的产品预览。
2. Today 首屏只回答：现在做什么、做多久、完成标准是什么、结束时间是多少。
3. Plan 首屏优先显示 Week Calendar；版本、课程筛选和任务池退到二级控制。
4. Review 先展示真实事实，再展示短而具体的 Insight，最后给出可确认的调整。
5. Surface 使用 Base / Raised / Inset / Floating 四级语义；Accent 页面占比不超过约 8%。
6. Button 和 Drag 的 Motion 表达状态变化，不表达“AI 魔法”。
7. Portfolio Mode 必须固定同一学生、同一课程目标、同一周任务和同一证据链。

## 视觉研究缺口

用户 PRD 明确要求图 1/2/3 决定颜色、表面、控件和按钮语言，但当前粘贴附件只包含文字。三个原始图片必须补齐后，才能完成视觉方案生成、1:1 比较和最终 Design QA。

