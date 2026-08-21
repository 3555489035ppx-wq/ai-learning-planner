# Codex Terra 核心问题整改任务书

## 0. 执行目标

在不扩大产品范围、不接入后端和真实 AI 的前提下，修复首次规划阻断、数据迁移风险和计划语义冲突，使五个规定画像都能从空白状态完成：课程录入 → 目标 → 现实安排 → 诊断/计划 → 今日执行 → 证据 → 进展 → 周复盘 → Plan Recovery。

执行前必须先阅读同目录的《假期跃迁多用户画像模拟可用性测试报告.md》及全部截图。不要把旧数据补测结果当成五画像新数据结果。

## 1. 不应修改的范围

- 不新增登录、后端、云同步、支付、部署和真实 AI API。
- 不删除现有诊断版本、计划版本、ChangeSet、撤销、任务事件、迁移和测试。
- 不推翻 React/Vite/TypeScript、本地 store 和现有路由。
- 不为了让测试通过而跳过目标日期、关闭验证或硬编码成功状态。
- 不把 mock provider 写成真实 AI。
- 不新增营销型首页、排行榜、打卡火焰或 AI 装饰。

## 2. 必须保留的能力

- 三种课程评估模式：考试分数、熟练程度、作品/项目。
- canonical course 与 courseId 隔离。
- Explainable Planning。
- 实际学习时长、完成程度、卡点和后续任务证据。
- 今日快速自检的证据边界。
- 周复盘的证据门槛、调整差异、ChangeSet 和撤销。
- Plan Recovery 的用户确认机制。
- 本地数据导出、清除和迁移备份恢复。

## 3. P0：解除首次规划阻断

### P0-1 目标日期状态与持久化

重点文件：

- `src/pages/PlanningSetup.tsx`
- `src/providers.ts`
- `src/store.tsx`
- `src/types.ts`
- `e2e/holiday-leap.spec.ts`
- `e2e/portfolio-journeys.spec.ts`

任务：

1. 查明 `input[type=date]` 显示日期但 `course.targetDate` 仍为空的原因。
2. 检查受控输入、React onChange、store 更新、课程正规化和持久化之间是否发生覆盖。
3. 日期变更后立即持久化；失焦、刷新、返回上一步后保持。
4. 仅在真实空值或非法日期时报错，错误必须关联当前课程字段。
5. 修复后不得通过移除日期必填规则来规避问题。

验收：

- 鼠标选择日期、键盘输入日期、自动化 fill 三种方式都能保存。
- A/B/C/D/E 每门课程的日期刷新后仍存在。
- 点击“保存并继续”进入第三步，控制台无错误。
- E2E 覆盖单课程与四课程日期输入。

### P0-2 数据迁移去重与可恢复性

重点文件：

- `src/migration.ts`
- `src/store.tsx`
- `src/types.ts`
- `tests/regression-2.test.ts`
- `tests/v6-core.test.ts`

任务：

1. 对 legacy task pool 的无效 courseId/stageId/generationKey 做确定性修复或隔离。
2. 重复 generationKey 不得让整个迁移失败；保留一个主任务，其余写入 migration report。
3. 不丢失完成事件和学习证据。
4. UI 显示“已修复/已跳过多少项”与恢复入口，不直接暴露内部异常作为唯一说明。

验收：

- 使用本轮出现的“无效引用或重复任务”数据可完成迁移。
- 迁移前备份仍可恢复。
- 迁移幂等：同一数据迁移两次结果一致。
- 完成任务、任务事件、证据数量不减少。

## 4. P1：修正产品语义与计划可信度

### P1-1 目标模型覆盖高分与偏科用户

重点文件：

- `src/types.ts`
- `src/pages/PlanningSetup.tsx`
- `src/components/CourseManager.tsx`
- `src/pages/SettingsV4.tsx`
- `src/providers.ts`
- `src/globalPlanner.ts`

任务：

- 为分数型课程增加“巩固”“拔高/冲刺”或等价目标。
- 不改变作品型课程的“完成作品/项目交付”。
- 目标类型参与优先级和任务密度，但不把高分课程误判为补弱。

验收：

- A 的三门课程可选择拔高/巩固。
- C 的英语优先补弱，数学与物理低频巩固或拔高。
- Explainable Planning 明确解释时间取舍。

### P1-2 课程语义与建议隔离

重点文件：

- `src/courseCatalog.ts`
- `src/courseIntelligence.ts`
- `src/providers.ts`
- `src/catalog/high-school.cn.ts`
- `tests/course-corpus.test.ts`
- `tests/portfolio-journeys.test.ts`

任务：

- 高中语文建议应落在阅读、写作、文言文、材料提取等课程维度。
- 数据结构建议应落在结构实现、算法过程、复杂度、边界测试，不使用泛化“小功能”作为主要完成结果。
- Photoshop/Illustrator/Rhino/Python/高数/数据库继续绑定各自 canonicalId 与 courseId。
- 找不到可靠课程模板时，明确显示“通用建议”，不得伪装为精确课程知识。

验收：

- B 的高中语文不出现“作品、理论或传播框架”式泛化建议。
- D 不出现数学、Python、数据库内容。
- E 的 Python 不出现 Rhino/Photoshop，高数不出现项目建模内容。
- 单元测试覆盖禁止词与允许词集合。

### P1-3 统一计划统计口径

重点文件：

- `src/components/PlanDraftSummary.tsx`
- `src/globalPlanner.ts`
- `src/scheduleValidator.ts`
- `src/pages/PlanV4.tsx`
- `tests/schedule-engine.test.ts`

任务：

- 区分 `totalScheduled`、`currentWeekScheduled`、`backlog`、`blockingInvalid`、`needsAttention`。
- “本周已安排”只能使用当前自然周任务数。
- 全计划 67 项应标为“计划总任务”或“已排入整个计划范围”。
- backlog 只提示延续到下一周，不影响合法计划启用。
- 只有冲突、非法引用、无效日期、不可用时间和严重顺序错误才能阻止启用。

验收：

- 总览与周课表对同一周显示相同数量。
- `7 项已安排 + 1 项 backlog` 时合法草案可以启用。
- “需要补充”与“等待后续安排”视觉和逻辑分离。

### P1-4 今日容量解释

重点文件：

- `src/pages/TodayV4.tsx`
- `src/timetable.ts`
- `src/scheduleDomain.ts`

任务：

- 说明今日容量来自默认模板、每日覆盖或现实约束中的哪一项。
- 在只有 45 分钟任务时，主摘要优先显示“剩余任务 45 分钟”；309 分钟容量降级为次要信息或可展开说明。
- 调整容量前后显示任务是否受影响。

验收：

- 用户能在一个页面内解释“309 分钟”的计算来源。
- 容量不是进度，不与预计剩余时间混为一谈。

### P1-5 空 Slot 与任务卡信息架构

重点文件：

- `src/pages/PlanV4.tsx`
- 全局样式文件中 schedule/task card 相关规则
- `e2e/visual-audit.spec.ts`

任务：

- 空 Slot 默认不显示“可安排”；hover/focus 显示“＋ 添加任务”。
- 拖动时只高亮合法位置。
- 特殊状态继续显示旅行、休息、不可用、固定活动、已锁定。
- 任务卡只常驻显示：课程与状态、知识点、动作类型与时长；完整行动说明进入 Sheet/Dialog。
- 强制 `width:100%`、`max-width:100%`、`min-width:0`、`box-sizing:border-box`，标题最多两行。

验收：

- 7×10 周课表空白区域不出现 60 余个“可安排”。
- 长知识点、长课程名和 200% 字体缩放均不覆盖相邻列。
- 键盘聚焦空 Slot 时可发现添加入口。

## 5. P2：降低首次规划负担

重点文件：

- `src/pages/PlanningSetup.tsx`
- `src/components/OnboardingCourseForm.tsx`
- `src/providers.ts`
- `e2e/holiday-leap.spec.ts`

任务：

1. 空白课程不得计入“已保存 N 门课程”。
2. 每门课程显示“未完成/已完成”状态，完成后默认折叠为摘要。
3. 只在选择高中/大学、分数/熟练度/作品后显示对应字段。
4. 多课程用户保留批量录入效率，不重复要求非必要信息。
5. 提交失败时摘要列出具体课程和字段，并滚动到第一处错误。

验收：

- 新增空课程时按钮显示“尚未保存”，继续按钮保持禁用。
- E 四门课程录入时每门都能折叠并看到完成状态。
- 返回上一步、刷新和浏览器会话恢复后数据不丢失。

## 6. P2：强化 Plan Recovery 决策差异

重点文件：

- `src/domain/recovery.ts`
- `src/pages/TodayV4.tsx`
- `src/pages/WeeklyReview.tsx`

任务：

- 每个恢复方案分别显示移动数量、拆分数量、优先课程影响、日期范围和总分钟变化。
- 不要让三个方案都只显示“预计影响 24 项”。
- 继续保留“暂不改动”和撤销。

验收：

- 用户无需打开 Debug Panel 即可说出四个方案差异。
- 已完成任务在任何方案中都不移动、不删除。
- 应用后生成 ChangeSet，撤销恢复原日期与节次。

## 7. P3：回归、可用性与发布门槛

### 自动化测试

必须新增或更新：

- `e2e/holiday-leap.spec.ts`
- `e2e/portfolio-journeys.spec.ts`
- `e2e/visual-audit.spec.ts`
- `tests/course-corpus.test.ts`
- `tests/schedule-engine.test.ts`
- `tests/regression-2.test.ts`
- `tests/portfolio-journeys.test.ts`

覆盖：

1. 五画像完整课程录入。
2. date picker 鼠标、键盘、自动化 fill。
3. 第三步现实安排与计划生成。
4. A/C 优先级取舍。
5. D/E 课程隔离。
6. backlog 不阻止启用。
7. 当前周与全计划统计一致。
8. 今日完成、证据、自检、延期、跳过。
9. 周复盘、应用、ChangeSet、撤销。
10. 刷新持久化与迁移幂等。
11. 1280px、1440px、390px，无页面级横向溢出。
12. 200% 字体缩放、键盘导航、focus-visible、减少动效。

### 五条真实浏览器旅程

- A：数学 128/150、英语 126/150、物理 86/100；验证拔高与巩固。
- B：数学 48、英语 57、语文 82；验证低置信度、基础诊断和负荷控制。
- C：数学 136、英语 62、物理 82；验证英语优先、数理保留。
- D：Photoshop、Illustrator、Rhino；验证作品证据和零数学串用。
- E：高数、Python、数据结构、数据库；验证 score/proficiency 混合建模与课程隔离。

每条旅程必须保存：输入完成、诊断、计划、今日、进展、周复盘、Recovery 的截图和控制台日志。

### 发布门槛

必须全部通过：

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test:unit`
- `pnpm run test:e2e`
- `pnpm run test:visual`
- `pnpm run build`

并满足：

- 五画像均从空白数据完成首次规划。
- 日期不再丢失。
- 迁移不因可修复重复任务导致整库失败。
- 不出现课程串用。
- backlog 不阻止合法计划。
- 统计口径无冲突。
- 控制台 0 error、0 warning。
- 桌面和移动端无横向溢出。

## 8. Terra 最终交付格式

1. 修改文件列表。
2. P0/P1/P2/P3 逐项完成状态。
3. 日期问题根因与修复证据。
4. 迁移前后数据数量对比。
5. 五画像完整旅程结果。
6. 课程隔离报告。
7. 计划统计口径说明。
8. Plan Recovery 差异与撤销证据。
9. 自动化测试与构建结果。
10. 截图目录。
11. 仍存在的真实限制。

未通过的项目必须明确写“未通过”，不得以旧数据、mock 成功状态或静态截图替代。
