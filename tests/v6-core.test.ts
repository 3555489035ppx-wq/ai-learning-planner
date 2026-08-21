import test from 'node:test'
import assert from 'node:assert/strict'
import { applyNormalizationToCourse } from '../src/courseCatalog.ts'
import { createCourse, createTask, initialData } from '../src/data.ts'
import { addDays, mondayOfWeek } from '../src/dateUtils.ts'
import { evidenceFromCompletion } from '../src/domain/evidence.ts'
import { buildRecoveryProposal, detectRecoverySignals } from '../src/domain/recovery.ts'
import { buildGlobalPlanDraft, validateGlobalPlanDraft } from '../src/globalPlanner.ts'
import { migrateV4ToV6, validateV6Data } from '../src/migration.ts'
import { buildDiagnosis, localPlanningProvider } from '../src/providers.ts'
import { tasksFromResource } from '../src/scheduler.ts'
import type { AppData, GlobalPlanDraft, PlanningBasis } from '../src/types.ts'

const completeMath = (data: AppData) => applyNormalizationToCourse(createCourse({
  id: 'math-v6', name: '高等数学', stage: '大学', courseType: '公共基础课', assessmentMode: 'score',
  score: 58, maxScore: 150, passScore: 90, examType: '期末考试', mastery: '基础薄弱', goalType: '补弱', targetScore: 100,
  targetDate: addDays(data.schedule.holidayStart, 35), desiredResult: '先达到补考线并完成一套阶段测验', priority: true,
}))

test('V6 不生成 15 分钟以下的普通学习任务尾段', () => {
  const data = initialData()
  const course = completeMath(data)
  const resource = data.resources.find(item => item.canonicalCourseIds.includes(course.canonicalId))!
  const task = createTask({ courseId: course.id, estimatedMinutes: 48, watchMinutes: 33, practiceMinutes: 10, quizMinutes: 5, title: '高等数学 · 极限练习', knowledgePoint: '极限' })
  const parts = tasksFromResource({ ...resource, durationMin: 33 }, course, task, { ...data.schedule, maxFocusMinutes: 45 })
  assert.ok(parts.every(part => part.taskType === 'micro_check' || part.estimatedMinutes >= 15), JSON.stringify(parts.map(part => part.estimatedMinutes)))
  assert.equal(parts.reduce((sum, part) => sum + part.estimatedMinutes, 0), 48)
})

test('V7 课程预算仅用于解释，低完成率不会阻止部分周课表启用', () => {
  const data = initialData()
  const course = completeMath(data)
  data.courses = [course]
  const date = data.schedule.holidayStart
  const basis: PlanningBasis = { source: 'score-baseline', courseId: course.id, currentLevel: '成绩基线', priorityProblems: ['前置基础'], target: course.desiredResult, confidence: 'medium', evidenceRefs: ['score:58/150'], createdAt: new Date().toISOString() }
  const task = createTask({
    id: 'small-budget-task', planId: 'draft-v6', date, originalPlannedDate: date, time: data.schedule.timeSlots[0].start, slotId: data.schedule.timeSlots[0].id,
    courseId: course.id, title: '高等数学 · 基础练习', action: '完成基础练习并记录结果', stageLabel: '第 1 阶段', stageStartDate: date, stageEndDate: addDays(date, 6), knowledgePoint: '前置基础', unitId: 'u1', estimatedMinutes: 30,
    completionCriteria: '完成 3 道题并记录错因', arrangementReason: '成绩与目标差距较大，先补前置基础。', phaseId: 'math-v6:phase:1', weeklyGoalId: 'math-v6:phase:1:week', knowledgePointIds: ['u1'],
    rationale: { summary: '成绩与及格线存在差距。', reasonCodes: ['score_gap'], evidenceIds: ['score:58/150'], dependencyTaskIds: [], factors: [{ key: 'score-gap', weight: 1, explanation: '当前分数低于及格线。' }], confidence: .6, limitations: [] },
    evidenceRequirement: { acceptedTypes: ['task_completion', 'objective_result'], minimumCount: 1, completionRule: '记录正确数或错因。' }, minimumViableMinutes: 15,
  })
  const draft: GlobalPlanDraft = {
    id: 'draft-v6', version: 1, courseIds: [course.id], createdAt: new Date().toISOString(), activatedAt: '', dateRange: { start: date, end: addDays(date, 6) }, tasks: [task],
    stagesByCourse: { [course.id]: [] }, phasesByCourse: { [course.id]: [{ id: 'math-v6:phase:1', courseId: course.id, title: '基础补弱', startDate: date, endDate: addDays(date, 6), objective: '建立前置基础', exitCriteria: ['完成基础练习'], dependencyPhaseIds: [] }] }, weeklyGoals: [{ id: 'math-v6:phase:1:week', phaseId: 'math-v6:phase:1', courseId: course.id, weekStart: mondayOfWeek(date), objective: '建立前置基础', plannedMinutes: 600, completionCriteria: ['完成基础练习'], knowledgePointIds: ['u1'] }],
    allocationByCourse: { [course.id]: 600 }, weeklyCapacityMinutes: 750, weeklyBudgetMinutesByCourse: { [course.id]: 600 }, scheduledMinutesByCourseWeek: {}, budgetFulfillmentRatio: {}, allocationReasons: { [course.id]: '测试预算。' }, planningBases: { [course.id]: basis }, dayReasons: {}, planInputHash: 'test', validation: {} as GlobalPlanDraft['validation'], status: 'draft', source: 'local-rules',
  }
  const validation = validateGlobalPlanDraft(data, draft)
  assert.equal(validation.valid, true)
  assert.equal(validation.issues.some(issue => issue.code === 'budget'), false)
  assert.ok(validation.quality.budgetFulfillmentRatio[course.id] < .1)
})

test('V6 诊断将 58/150 识别为需补弱，而不是基础稳定', () => {
  const data = initialData()
  const course = completeMath(data)
  data.courses = [course]
  const diagnosis = buildDiagnosis(data, course.id)
  assert.doesNotMatch(diagnosis.currentLevel, /稳定|较稳/)
  assert.match(diagnosis.assessmentSummary, /58\/150/)
})

test('V4 数据迁移到 V6 会保留原事件并建立可追溯 Evidence', () => {
  const source = initialData()
  const course = completeMath(source)
  source.courses = [course]
  const task = createTask({ id: 'legacy-task', courseId: course.id, planId: 'legacy-plan', title: '旧任务', knowledgePoint: '前置基础' })
  source.tasks = [task]
  source.taskEvents = [{ id: 'legacy-completed', taskId: task.id, courseId: course.id, planId: task.planId, type: 'completed', occurredAt: new Date().toISOString(), plannedDate: task.date, actualMinutes: 35, completionDegree: '全部完成', detail: '完成旧任务' }]
  const legacy = { ...source, version: 4 as unknown as 6, schemaVersion: 7 } as AppData
  const migrated = migrateV4ToV6(legacy)
  assert.equal(migrated.version, 6)
  assert.ok(migrated.evidenceRecords.some(record => record.provenance.eventId === 'legacy-completed' && record.type === 'task_completion'))
  assert.ok(migrated.evidenceRecords.some(record => record.provenance.eventId === 'legacy-completed' && record.type === 'time_spent'))
  assert.equal(validateV6Data(JSON.parse(JSON.stringify(migrated))).version, 6)
})

test('V6 完成记录会生成时间、完成程度和可选反思证据，不把完成直接当作掌握度', () => {
  const task = createTask({ id: 'evidence-task', courseId: 'course-a', knowledgePoint: '极限', knowledgePointIds: ['limit'] })
  const records = evidenceFromCompletion(task, { actualMinutes: 42, degree: '部分完成', note: '换元步骤仍会卡住' })
  assert.deepEqual(records.map(record => record.type), ['time_spent', 'task_completion', 'self_check'])
  assert.equal(records.find(record => record.type === 'time_spent')?.value, 42)
  assert.equal(records.some(record => record.type === 'objective_result'), false)
})

test('V6 恢复引擎只在可观察的连续执行问题后给出可确认方案，资源未完成不是信号', () => {
  const data = initialData()
  const today = data.schedule.holidayStart
  data.tasks = [0, 1, 2].map(index => createTask({ id: `recovery-${index}`, courseId: 'course-a', date: addDays(today, index), originalPlannedDate: addDays(today, index), estimatedMinutes: 40, status: '待完成' }))
  const signals = detectRecoverySignals(data, addDays(today, 2))
  assert.ok(signals.some(item => item.type === 'low_completion' && item.severity === 'actionable'))
  const proposal = buildRecoveryProposal(data, signals)
  assert.ok(proposal)
  assert.deepEqual(proposal?.options.map(item => item.type), ['reduce_daily_load', 'extend_horizon', 'rebalance_priority', 'keep_plan'])
  assert.equal(proposal?.options.find(item => item.type === 'reduce_daily_load')?.changeSetPreview?.changes.some(change => change.after.__exists === false), false)
})

test('V6 学习教练对连续未完成返回恢复预览，不再用固定比例删除任务', async () => {
  const data = initialData()
  const start = data.schedule.holidayStart
  data.tasks = [0, 1, 2].map(index => createTask({ id: `coach-recovery-${index}`, courseId: 'course-a', date: addDays(start, index), originalPlannedDate: addDays(start, index), estimatedMinutes: 40, status: '待完成' }))
  data.taskEvents = data.tasks.slice(0, 2).map(task => ({ id: `coach-skip-${task.id}`, taskId: task.id, courseId: task.courseId, planId: task.planId, type: 'skipped' as const, occurredAt: new Date().toISOString(), plannedDate: task.date, actualMinutes: 0, detail: '临时安排冲突' }))
  const response = await localPlanningProvider.adjustPlan('连续未完成，想减少学习量', data)
  assert.match(response.data.message, /恢复建议/)
  assert.ok(response.data.changeSet)
  assert.equal(response.data.changeSet?.changes.some(change => change.after.__exists === false), false)
})
