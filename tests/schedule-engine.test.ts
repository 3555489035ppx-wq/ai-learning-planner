import test from 'node:test'
import assert from 'node:assert/strict'
import { createCourse, createTask, initialData } from '../src/data.ts'
import { addDays, localDateISO, mondayOfWeek } from '../src/dateUtils.ts'
import { buildRecoveryProposal, returnMissedTasksToPool, scheduleBacklogForWeek } from '../src/domain/recovery.ts'
import { migrateV6ToV7, validateV7Data } from '../src/migration.ts'
import { reconcileScheduleDomain } from '../src/scheduleDomain.ts'
import { validateScheduleDomain } from '../src/scheduleValidator.ts'
import { scheduleTasks } from '../src/scheduler.ts'

const course = () => createCourse({ id: 'math', name: '高中数学', stage: '高中', courseType: '学科课程' })
const task = (id: string, date = '') => createTask({
  id,
  planId: 'plan', courseId: 'math', phaseId: 'math:stage:1', weeklyGoalId: 'legacy-week',
  stageLabel: '基础建立', stageStartDate: '2026-07-18', stageEndDate: '2026-07-24',
  title: `高中数学 · 任务 ${id}`, action: '完成基础练习', knowledgePoint: '一元二次函数与不等式',
  unitId: 'quadratic', knowledgePointIds: ['quadratic'], completionCriteria: '完成 3 道练习并记录错因',
  completionCriteriaItems: ['完成 3 道练习并记录错因'], arrangementReason: '基础知识需要优先补弱。',
  estimatedMinutes: 24, minimumViableMinutes: 15, date, originalPlannedDate: date,
  slotId: date ? 'morning-1' : '', time: date ? '08:00' : '', scheduleStatus: date ? 'scheduled' : 'needs-confirmation',
})

test('V6 迁移到 V7 会保留历史任务，并建立可验证的任务池与排程记录', () => {
  const legacy = initialData()
  legacy.version = 6
  legacy.schemaVersion = 8
  legacy.courses = [course()]
  legacy.tasks = [task('legacy-late', '2026-07-25')]
  const migrated = migrateV6ToV7(legacy)
  const checked = validateV7Data(migrated)
  assert.equal(checked.version, 7)
  assert.equal(checked.taskPool.some(item => item.id === 'legacy-late'), true)
  assert.equal(checked.taskPlacements.some(item => item.taskId === 'legacy-late' && item.date === '2026-07-25'), true)
  assert.equal(checked.learningStages[0]?.legacyTiming?.endDate, '2026-07-24')
})

test('阶段日期只是迁移审计信息：7/25 的周课表任务仍然合法', () => {
  const data = initialData()
  data.courses = [course()]
  data.schedule.holidayStart = '2026-07-18'
  data.schedule.holidayEnd = '2026-07-24'
  data.tasks = [task('late', '2026-07-25')]
  const migrated = reconcileScheduleDomain(data)
  const issues = validateScheduleDomain(migrated)
  assert.equal(issues.some(item => item.severity === 'blocking'), false)
  assert.equal(migrated.learningStages[0].legacyTiming?.endDate, '2026-07-24')
})

test('旧 V7 的重复任务池可以从任务源数据重建，不会把有效课程和任务一起丢失', () => {
  const data = initialData()
  data.version = 7
  data.courses = [course()]
  data.tasks = [task('pool-source', '2026-07-25')]
  const valid = reconcileScheduleDomain(data)
  const stale = { ...valid, taskPool: [...valid.taskPool, { ...valid.taskPool[0], id: 'duplicate-pool-item' }] }
  assert.throws(() => validateV7Data(stale), /重复任务/)
  const repaired = reconcileScheduleDomain(stale)
  assert.doesNotThrow(() => validateV7Data(repaired))
  assert.equal(repaired.taskPool.length, 1)
  assert.equal(repaired.tasks[0].id, 'pool-source')
})

test('24 分钟任务可放入 45 分钟 Slot，余量是缓冲而不是错误', () => {
  const data = initialData()
  data.courses = [course()]
  const date = mondayOfWeek()
  const result = scheduleTasks([task('short')], data.courses, data.schedule, [], date)
  const placed = result.find(item => item.id === 'short')!
  assert.equal(placed.scheduleStatus, 'scheduled')
  assert.equal(placed.estimatedMinutes, 24)
  assert.equal(placed.slotId, 'morning-1')
})

test('本周排不完会形成 backlog，不会令整个计划失败', () => {
  const data = initialData()
  data.courses = [course()]
  data.schedule.maxAutoTasksPerDay = 1
  const week = mondayOfWeek()
  const result = scheduleTasks(Array.from({ length: 10 }, (_, index) => task(`pool-${index + 1}`)), data.courses, data.schedule, [], week)
  assert.ok(result.filter(item => item.scheduleStatus === 'scheduled').length <= 7)
  assert.ok(result.some(item => item.scheduleStatus === 'needs-confirmation'))
})

test('多门课程会先各自排入一项任务，再开始分配同一课程的后续任务', () => {
  const data = initialData()
  const courseIds = ['python', 'structures', 'math', 'database']
  data.courses = courseIds.map((id, index) => createCourse({
    id,
    name: ['Python', '数据结构', '高等数学', '数据库'][index],
    stage: '大学',
    courseType: '学科课程',
    priority: index === 1,
  }))
  data.schedule.maxAutoTasksPerDay = 2
  const week = mondayOfWeek()
  const candidates = courseIds.flatMap(courseId => Array.from({ length: 3 }, (_, index) => ({
    ...task(`${courseId}-${index + 1}`),
    courseId,
    phaseId: `${courseId}:stage:1`,
    title: `${courseId} 任务 ${index + 1}`,
    order: index + 1,
  })))
  const result = scheduleTasks(candidates, data.courses, data.schedule, [], week)
  const firstRound = result.filter(item => item.scheduleStatus === 'scheduled').slice(0, courseIds.length)
  assert.equal(firstRound.length, courseIds.length)
  assert.deepEqual(new Set(firstRound.map(item => item.courseId)), new Set(courseIds))
})

test('未完成任务回到同一个任务池项，并在下一周获得新 Placement', () => {
  const data = initialData()
  data.courses = [course()]
  const week = mondayOfWeek()
  const overdue = task('recover', addDays(week, -1))
  data.tasks = [overdue]
  const returned = returnMissedTasksToPool(reconcileScheduleDomain(data), week)
  assert.equal(returned.taskPool.find(item => item.id === 'recover')?.status, 'deferred')
  assert.equal(returned.taskPlacements.some(item => item.taskId === 'recover' && item.status === 'missed'), true)
  const rescheduled = scheduleBacklogForWeek(returned, week)
  const next = rescheduled.taskPlacements.find(item => item.taskId === 'recover' && item.status === 'published')
  assert.ok(next)
  assert.equal(next?.weekStart, week)
})

test('恢复方案展示不同的处理后果，而不是把三种选项写成同一种影响', () => {
  const data = initialData()
  data.courses = [{ ...course(), priority: true }]
  const week = mondayOfWeek()
  data.tasks = [task('late-a', addDays(week, -3)), task('late-b', addDays(week, -2))]
  const proposal = buildRecoveryProposal(data, [{ id: 'overdue', type: 'overdue', severity: 'actionable', explanation: '有任务逾期。', evidenceIds: [], detectedAt: '', windowStart: week, windowEnd: week }])
  assert.ok(proposal)
  const summaries = proposal!.options.map(option => option.impact.summary)
  assert.equal(new Set(summaries).size, proposal!.options.length)
  assert.match(proposal!.options.find(option => option.type === 'extend_horizon')!.impact.summary, /下一周/)
})

test('新建计划从假期开始日开始，不会排到开始日前', () => {
  const data = initialData()
  data.courses = [course()]
  data.schedule.holidayStart = localDateISO()
  data.schedule.holidayEnd = addDays(data.schedule.holidayStart, 6)
  data.schedule.strictHolidayRange = false
  const result = scheduleTasks([task('start-boundary')], data.courses, data.schedule)
  const placed = result.find(item => item.id === 'start-boundary')
  assert.ok(placed)
  assert.ok(placed!.date >= data.schedule.holidayStart)
})
