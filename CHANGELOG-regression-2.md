# 假期跃迁第二轮回归修改记录

日期：2026-07-18

## 根因与修复

### P0：规划主链路

- 根因：全局排程器只读取 `completed` 诊断，导致没有完成诊断的课程被静默跳过；校验器又把“未完成诊断”当作失败，首次规划无法直接形成可执行计划。
- 修复：新增 `PlanningBasis` 与 `getPlanningBasis()`，按“当前有效诊断 → 成绩基线 → 自评/作品基线”选择依据。所有启用课程必须先取得依据，再进入同一个原子草案。
- 结果：高中 6 门、大学 6 门均可在不完成精细诊断时直接生成、校验并启用全课程计划；缺少必要事实时会返回具体字段，不再静默跳过。

### P0：依赖过期与课程隔离

- 根因：旧指纹把目标和时间表混入诊断输入；任何时间变化都会废弃全部诊断。
- 修复：拆分 `diagnosisInputHash` 与 `planInputHash`。成绩、课程身份、教材和评估证据只影响对应课程诊断；目标、优先级、旅行、容量和节次只使计划过期。
- 结果：单课程修改不会污染其他课程；旅行、容量和关闭晚间节次只触发计划差异与重排。

### P0：排程确定性与容量

- 根因：课程与任务队列在分数相同时依赖输入数组顺序，且排程只检查上限，没有目标利用率与空日原因。
- 修复：风险、截止、先修、用户优先级后使用稳定 `courseId` 排序；任务队列使用阶段、知识点和标题稳定排序。排程目标为每日容量的 75%–90%，不可拆分导致的例外写入 `dayReasons`。
- 结果：输入课程顺序不同仍生成语义一致的计划；每个假期日期都有任务或结构化原因。

### P0：课程切换器

- 根因：选中课程、优先课程会被移动到首位，造成六个页面的按钮顺序跳动。
- 修复：新增 `stableCourseOrder()`，只读取可选 `displayOrder`，否则严格保留源数组顺序；“全部课程”固定在首位，超过 6 门展开搜索。
- 结果：诊断、计划、资源、今日、进展和周复盘页面切换课程时顺序稳定。

### P0/P2：学习资源

- 根因：12 条人工审核 B 站资源只覆盖 6 门课程，旧空状态只有单个宽泛搜索入口，并会把无热度快照当成 0 分。
- 修复：建立独立 `ResourceProvider`、`ResourceQuery`、`ResourceSnapshot` 与导入校验；每门稳定课程生成 8 条基于课程、教材、知识点和基础的“未审核检索建议”。热度为 `null` 时从评分分母中排除，不按 0 处理。
- 结果：高中 9 科与大学 100 门稳定课程均有 6–10 条检索建议；人工审核目录与检索建议严格分层，不伪造标题、作者、链接或统计。

### P1：今日自检

- 根因：没有待提交题时会回退到最近已提交题，并渲染一套禁用表单。
- 修复：拆分 `pendingCheck`、`latestSubmittedCheck` 和 `latestSubmittedEvent`；已提交记录只显示时间、证据、判断说明与复习建议。增加“稍后再做”、每日自检开关和题库耗尽提示。
- 结果：非客观题不显示正确/错误；无题时不渲染空表单。

### P1：计划与首页

- 计划页新增日/周/月真实切换，默认周视图；桌面课表单元仅显示课程、短任务和时长，详细动作与标准在弹窗中查看；移动端保持纵向日期列表。
- 首页使用 `100dvh` 网格组织导航、Hero、能力流程和页脚；补齐隐私、条款、本地数据与版本入口，并修复 1440×900 与 390×844 布局。

## 主要修改文件

- `src/planningBasis.ts`
- `src/globalPlanner.ts`
- `src/scheduler.ts`
- `src/versioning.ts`
- `src/resourceProvider.ts`
- `src/courseOrder.ts`
- `src/types.ts`
- `src/data.ts`
- `src/store.tsx`
- `src/providers.ts`
- `src/courseIntelligence.ts`
- `src/components.tsx`
- `src/components/PlanDraftSummary.tsx`
- `src/pages/PlanningSetup.tsx`
- `src/pages/Diagnosis.tsx`
- `src/pages/TodayV4.tsx`
- `src/pages/PlanV4.tsx`
- `src/pages/Resources.tsx`
- `src/pages/Landing.tsx`
- `src/pages/SettingsV4.tsx`
- `src/index.css`
- `src/v4.css`
- `tests/regression-2.test.ts`
- `tests/v3-core.test.ts`
- `tests/v4-stage-c.test.ts`
- `e2e/holiday-leap.spec.ts`
- `e2e/visual-audit.spec.ts`
- `playwright.config.ts`

