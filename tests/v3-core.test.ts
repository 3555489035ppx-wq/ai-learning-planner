import test from 'node:test'
import assert from 'node:assert/strict'
import { createTaskChangeSet, revertChangeSet } from '../src/changeSets.ts'
import { applyNormalizationToCourse, normalizeCourseName } from '../src/courseCatalog.ts'
import { createCourse, createTask, initialData, todayISO } from '../src/data.ts'
import { addDays, dayName, mondayOfWeek, zonedDateISO } from '../src/dateUtils.ts'
import { migrateV2ToV3 } from '../src/migration.ts'
import {
  activatePlanPreview, applyNextWeekPlan, buildDiagnosis, buildHolidayPlan, canApplyNextWeekPlan,
  completeDiagnosisAttempt, createTasksFromResource, deriveProgress, localPlanningProvider,
  matchingResources, nextWeekLockKey, nextWeekRevision, previewPlanForCourse, recordTaskEvent,
  resourceMatchesCourse,
} from '../src/providers.ts'
import { capacityForDate, scheduleTasks, validateScheduleChange } from '../src/scheduler.ts'
import { markStaleDependencies } from '../src/versioning.ts'
import { buildGlobalPlanDraft } from '../src/globalPlanner.ts'
import type { AppData, Course, LearningTask } from '../src/types.ts'

const makeCourse = (name = '高等数学', score = 58): Course => applyNormalizationToCourse(createCourse({
  name, stage: '大学', courseType: '必修课', assessmentMode: 'score', score, maxScore: 100, passScore: 60,
  examType: '期末考试', goalType: '补弱', targetScore: 70, targetDate: addDays(todayISO(), 41),
  priority: true, priorityWeight: 2, desiredResult: '完成可比较的阶段复测',
}))

const completeDiagnosis = (data: AppData, course: Course) => {
  const draft = buildDiagnosis(data, course.id)
  const answers = Object.fromEntries(draft.diagnosticQuiz.map(question => [question.id, question.options[0]]))
  const result = completeDiagnosisAttempt(data, draft, answers)
  data.diagnoses[course.id] = result.diagnosis
  data.diagnosisHistory.push(result.diagnosis)
  data.quizEvents.push(...result.events)
  return result.diagnosis
}

test('成绩基线可先生成全课程草案，完成诊断后可生成更高置信度的单课程预览', () => {
  const data = initialData()
  const course = makeCourse()
  data.courses = [course]
  const baseline = buildGlobalPlanDraft(data)
  assert.ok(baseline.tasks.length > 0)
  assert.equal(baseline.planningBases[course.id].source, 'score-baseline')
  const draft = buildDiagnosis(data, course.id)
  data.diagnoses[course.id] = draft
  assert.equal(data.tasks.length, 0)
  assert.equal(data.plans.length, 0)
  assert.throws(() => previewPlanForCourse(data, course.id), /完成当前课程/)
  const answers = Object.fromEntries(draft.diagnosticQuiz.map(question => [question.id, question.options[0]]))
  const completed = completeDiagnosisAttempt(data, draft, answers)
  data.diagnoses[course.id] = completed.diagnosis
  data.quizEvents.push(...completed.events)
  const preview = previewPlanForCourse(data, course.id)
  assert.equal(data.tasks.length, 0)
  assert.equal(preview.plan.status, 'draft')
  const activated = activatePlanPreview(data, preview.plan, preview.tasks)
  assert.equal(activated.plans.at(-1)?.status, 'active')
  assert.ok(activated.tasks.length > 0)
})

test('目标与时间只使计划过期，成绩只使对应诊断过期', () => {
  const data = initialData()
  const course = makeCourse()
  data.courses = [course]
  completeDiagnosis(data, course)
  const preview = previewPlanForCourse(data, course.id)
  const active = activatePlanPreview(data, preview.plan, preview.tasks)
  const changed = { ...active, courses: active.courses.map(item => ({ ...item, targetScore: 80 })) }
  const stale = markStaleDependencies(active, changed)
  assert.equal(stale.plans.find(plan => plan.courseId === course.id)?.status, 'stale')
  assert.equal(stale.diagnoses[course.id].status, 'completed')
  const timeChanged = markStaleDependencies(stale, { ...stale, schedule: { ...stale.schedule, weekdayMinutes: 30 } })
  assert.match(timeChanged.plans.find(plan => plan.courseId === course.id)?.staleReasons.join(' ') ?? '', /时间/)
  assert.equal(timeChanged.diagnoses[course.id].status, 'completed')
  const scoreChanged = markStaleDependencies(active, { ...active, courses: active.courses.map(item => ({ ...item, score: 30 })) })
  assert.equal(scoreChanged.diagnoses[course.id].status, 'superseded')
})

test('新诊断激活新计划时保留已完成任务', () => {
  const data = initialData()
  const course = makeCourse()
  data.courses = [course]
  completeDiagnosis(data, course)
  const first = previewPlanForCourse(data, course.id)
  let active = activatePlanPreview(data, first.plan, first.tasks)
  const completedTask = { ...active.tasks[0], status: '已完成' as const }
  active.tasks = active.tasks.map(task => task.id === completedTask.id ? completedTask : task)
  const nextDraft = buildDiagnosis(active, course.id)
  const answers = Object.fromEntries(nextDraft.diagnosticQuiz.map(question => [question.id, question.options.at(-1)!]))
  const nextDiagnosis = completeDiagnosisAttempt(active, nextDraft, answers)
  active.diagnoses[course.id] = nextDiagnosis.diagnosis
  const second = previewPlanForCourse(active, course.id)
  const updated = activatePlanPreview(active, second.plan, second.tasks)
  assert.ok(updated.tasks.some(task => task.id === completedTask.id && task.status === '已完成'))
  assert.equal(updated.plans.filter(plan => plan.courseId === course.id && plan.status === 'active').length, 1)
})

test('9、58、80 分会产生不同任务密度、练习量和难度', () => {
  const shapes = [9, 58, 80].map(score => {
    const data = initialData()
    const course = makeCourse('高等数学', score)
    data.courses = [course]
    const diagnosis = completeDiagnosis(data, course)
    const tasks = buildHolidayPlan(data, diagnosis)
    return { score, count: tasks.length, duration: tasks[0]?.estimatedMinutes, practice: tasks[0]?.practiceCount, difficulty: tasks[0]?.difficulty, stage: diagnosis.learningStages[0].title, warning: diagnosis.feasibilityWarning }
  })
  assert.notDeepEqual(shapes[0], shapes[1])
  assert.notDeepEqual(shapes[1], shapes[2])
  assert.ok(shapes[0].count > shapes[2].count)
  assert.equal(shapes[0].difficulty, '基础')
  assert.equal(shapes[2].difficulty, '进阶')
})

test('极端目标结合剩余天数与容量显示可行性警告', () => {
  const data = initialData()
  data.schedule.weekdayMinutes = 30
  data.schedule.weekendMinutes = 30
  const course = makeCourse('高等数学', 9)
  course.targetScore = 95
  course.targetDate = addDays(todayISO(), 20)
  data.courses = [course]
  assert.match(buildDiagnosis(data, course.id).feasibilityWarning, /不保证|阶段性/)
})

test('全局排程遵守 60 分钟容量、休息日、旅行日、下午偏好和假期边界', () => {
  const data = initialData()
  data.schedule.holidayStart = todayISO()
  data.schedule.holidayEnd = addDays(todayISO(), 6)
  data.schedule.weekdayMinutes = 60
  data.schedule.weekendMinutes = 60
  data.schedule.strictHolidayRange = true
  data.schedule.strictDailyCapacity = true
  data.schedule.maxFocusMinutes = 30
  data.schedule.preferredTimes = ['下午']
  data.schedule.restDays = [dayName(addDays(todayISO(), 1))]
  const travelDate = addDays(todayISO(), 2)
  data.schedule.constraints = [{ id: 'travel', startAt: `${travelDate}T00:00:00+08:00`, endAt: `${travelDate}T23:59:59+08:00`, type: 'travel', capacityMinutes: 0, note: '旅行' }]
  data.courses = [makeCourse('高等数学'), makeCourse('大学英语'), makeCourse('Python')].map((course, index) => ({ ...course, id: `course-${index}`, priority: index === 0 }))
  const candidates = data.courses.flatMap((course, courseIndex) => Array.from({ length: 4 }, (_, index) => createTask({ id: `${course.id}-${index}`, courseId: course.id, title: '候选任务', estimatedMinutes: 30, practiceMinutes: 25, quizMinutes: 5, order: courseIndex * 10 + index, date: '', time: '', status: '待确认' })))
  const tasks = scheduleTasks(candidates, data.courses, data.schedule)
  for (let date = data.schedule.holidayStart; date <= data.schedule.holidayEnd; date = addDays(date, 1)) {
    assert.ok(tasks.filter(task => task.date === date).reduce((sum, task) => sum + task.estimatedMinutes, 0) <= 60)
  }
  assert.equal(tasks.some(task => task.date === addDays(todayISO(), 1)), false)
  assert.equal(tasks.some(task => task.date === travelDate), false)
  assert.ok(tasks.filter(task => task.scheduleStatus === 'scheduled').every(task => task.time >= '14:00' && task.time < '18:00'))
  assert.ok(tasks.filter(task => task.date).every(task => task.date <= data.schedule.holidayEnd))
  assert.ok(tasks.filter(task => task.scheduleStatus === 'needs-confirmation').every(task => !task.date))
})

test('超长资源拆分后每项不超过专注上限且组件不超过预计时间', () => {
  const data = initialData()
  const course = makeCourse('高等数学')
  data.courses = [course]
  data.schedule.maxFocusMinutes = 30
  data.schedule.weekdayMinutes = 180
  data.schedule.weekendMinutes = 180
  const resource = data.resources.find(item => item.id === 'resource-mit-calculus')!
  const tasks = createTasksFromResource(data, resource, course, todayISO(), '第1周')
  assert.ok(tasks.length >= 3)
  assert.ok(tasks.every(task => task.estimatedMinutes <= 30))
  assert.ok(tasks.every(task => task.watchMinutes + task.practiceMinutes + task.quizMinutes <= task.estimatedMinutes))
})

test('手动移动必须经过容量和冲突校验', () => {
  const data = initialData()
  data.schedule.holidayStart = todayISO()
  data.schedule.holidayEnd = addDays(todayISO(), 2)
  data.schedule.weekdayMinutes = 60
  data.schedule.weekendMinutes = 60
  data.schedule.strictHolidayRange = true
  data.schedule.strictDailyCapacity = true
  const a = createTask({ id: 'a', date: todayISO(), time: '09:00', estimatedMinutes: 45 })
  const b = createTask({ id: 'b', date: addDays(todayISO(), 1), time: '09:00', estimatedMinutes: 30 })
  assert.equal(validateScheduleChange(b, { date: todayISO(), time: '09:00' }, [a, b], data.schedule).valid, false)
  assert.equal(validateScheduleChange(b, { date: addDays(data.schedule.holidayEnd, 1), time: '09:00' }, [a, b], data.schedule).valid, false)
})

test('教练旅行语义要求日期，并将下周 3 天结构化为下周约束', async () => {
  const data = initialData()
  data.courses = [makeCourse()]
  const unclear = await localPlanningProvider.adjustPlan('临时旅行 3 天', data)
  assert.equal(unclear.data.needsClarification, true)
  const clear = await localPlanningProvider.adjustPlan('我下周旅行 3 天', data)
  assert.equal(clear.data.constraintDraft?.startAt.slice(0, 10), addDays(mondayOfWeek(), 7))
  assert.equal(clear.data.constraintDraft?.endAt.slice(0, 10), addDays(mondayOfWeek(), 9))
})

test('下周调整只移动本周未完成，课程锁彼此独立', () => {
  const data = initialData()
  const a = makeCourse('高等数学'); a.id = 'a'
  const b = makeCourse('大学英语'); b.id = 'b'
  data.courses = [a, b]
  const week = mondayOfWeek()
  const currentA = createTask({ id: 'current-a', courseId: 'a', date: week, originalPlannedDate: week, status: '待完成' })
  const futureA = createTask({ id: 'future-a', courseId: 'a', date: addDays(week, 21), originalPlannedDate: addDays(week, 21), status: '待完成' })
  const currentB = createTask({ id: 'current-b', courseId: 'b', date: week, originalPlannedDate: week, status: '待完成' })
  const next = applyNextWeekPlan([currentA, futureA, currentB], 'a')
  assert.notEqual(next.find(task => task.id === 'current-a')?.date, currentA.date)
  assert.equal(next.find(task => task.id === 'future-a')?.date, futureA.date)
  assert.equal(next.find(task => task.id === 'current-b')?.date, currentB.date)
  data.progress.appliedLocks[nextWeekLockKey('a', week)] = nextWeekRevision(week)
  assert.equal(canApplyNextWeekPlan(data, 'a', week), false)
  assert.equal(canApplyNextWeekPlan(data, 'b', week), true)
})

test('ChangeSet 撤销不会删除调整后新增或完成的其他任务', () => {
  const data = initialData()
  const before = createTask({ id: 'before', date: todayISO(), status: '待完成' })
  const moved = { ...before, date: addDays(todayISO(), 1) }
  const changeSet = createTaskChangeSet([before], [moved], '移动任务')
  const later = createTask({ id: 'later', date: todayISO(), status: '已完成' })
  const withChange: AppData = { ...data, tasks: [moved, later], changeSets: [changeSet] }
  const reverted = revertChangeSet(withChange, changeSet.id)
  assert.equal(reverted.tasks.find(task => task.id === 'before')?.date, before.date)
  assert.equal(reverted.tasks.find(task => task.id === 'later')?.status, '已完成')
})

test('同一诊断 attempt 不可重复提交', () => {
  const data = initialData()
  const course = makeCourse()
  data.courses = [course]
  const draft = buildDiagnosis(data, course.id)
  const answers = Object.fromEntries(draft.diagnosticQuiz.map(question => [question.id, question.options[0]]))
  const first = completeDiagnosisAttempt(data, draft, answers)
  data.quizEvents.push(...first.events)
  assert.throws(() => completeDiagnosisAttempt(data, draft, answers), /不能重复/)
})

test('自评不计入客观正确率，延期后仍保留原计划周，实际时长来自用户输入', () => {
  const data = initialData()
  const course = makeCourse('Photoshop')
  data.courses = [course]
  const week = mondayOfWeek()
  const task = createTask({ id: 'task', courseId: course.id, date: addDays(week, 8), originalPlannedDate: week, status: '已延期', estimatedMinutes: 60 })
  data.tasks = [task]
  data.taskEvents = [recordTaskEvent(task, 'delayed', '延期'), recordTaskEvent(task, 'completed', '部分完成', 17, { completionDegree: '部分完成' })]
  data.quizEvents = [{ id: 'quiz', attemptId: 'self', questionVersion: 1, source: 'today', evidenceType: 'self_assessment', courseId: course.id, questionId: 'q', point: '图层', score: 2, maxScore: 2, answer: '可以', occurredAt: `${week}T12:00:00.000Z` }]
  const progress = deriveProgress(data, course.id, week)
  assert.equal(progress.weeklyTasks.length, 1)
  assert.equal(progress.accuracy, null)
  assert.equal(progress.actualMinutes, 17)
})

test('中国时区凌晨日期使用本地日历而非 UTC 日期切片', () => {
  const instant = new Date('2026-07-15T16:30:00.000Z')
  assert.equal(zonedDateISO(instant, 'Asia/Shanghai'), '2026-07-16')
})

test('Java、JavaScript、SPSS、Photoshop 精确隔离，AI 和 CAD 必须消歧', () => {
  assert.notEqual(normalizeCourseName('Java').canonicalId, normalizeCourseName('JavaScript').canonicalId)
  assert.notEqual(normalizeCourseName('SPSS').canonicalId, normalizeCourseName('PS').canonicalId)
  assert.ok(normalizeCourseName('AI').ambiguityOptions?.length)
  assert.ok(normalizeCourseName('CAD').ambiguityOptions?.length)
  const data = initialData()
  const java = makeCourse('Java')
  const jsResource = data.resources.find(resource => resource.id === 'resource-mdn-js')!
  const spss = makeCourse('SPSS')
  const psResource = data.resources.find(resource => resource.id === 'resource-adobe-photoshop')!
  assert.equal(resourceMatchesCourse(jsResource, java), false)
  assert.equal(resourceMatchesCourse(psResource, spss), false)
})

test('常用简称正确标准化，六级进入英语考试域', () => {
  const expected: Record<string, string> = { 高数: '高等数学', 线代: '线性代数', 大英: '大学英语', 四级: '大学英语四级', 六级: '大学英语六级', C语言: 'C语言程序设计', PS: 'Adobe Photoshop', PR: 'Adobe Premiere Pro', AE: 'Adobe After Effects', 犀牛: 'Rhino', 毛概: '毛泽东思想和中国特色社会主义理论体系概论', 马原: '马克思主义基本原理' }
  Object.entries(expected).forEach(([input, canonical]) => assert.equal(normalizeCourseName(input).canonicalName, canonical))
  assert.equal(normalizeCourseName('六级').subjectDomain, '大学英语与语言考试')
})

test('三维软件诊断不串入 Photoshop 蒙版或选区', () => {
  for (const name of ['Rhino', 'Blender', 'AutoCAD']) {
    const data = initialData()
    const course = makeCourse(name)
    data.courses = [course]
    const text = JSON.stringify(buildDiagnosis(data, course.id))
    assert.doesNotMatch(text, /蒙版|选区|调色/)
  }
})

test('v2 迁移保留课程、任务、事件和原始备份，并把旧计划标记 stale', () => {
  const legacy = { version: 2, onboardingCompleted: true, courses: [makeCourse()], tasks: [createTask({ id: 'old-task' })], taskEvents: [{ id: 'event', taskId: 'old-task', courseId: '', type: 'completed', actualMinutes: 60 }], quizEvents: [], resources: [], settings: {}, progress: {}, schedule: {} }
  const raw = JSON.stringify(legacy)
  const migrated = migrateV2ToV3(legacy, raw)
  assert.equal(migrated.version, 4)
  assert.equal(migrated.courses.length, 1)
  assert.equal(migrated.tasks.length, 1)
  assert.equal(migrated.taskEvents[0].actualMinutes, 0)
  assert.equal(migrated.migrationBackup, raw)
  assert.ok(migrated.plans.every(plan => plan.status === 'stale'))
})

test('无匹配审核资源时诚实返回空列表', () => {
  const data = initialData()
  const course = makeCourse('量子场论专题')
  data.courses = [course]
  assert.deepEqual(matchingResources(data, course.id), [])
})

test('容量函数读取单日覆盖值而不修改全局工作日容量', () => {
  const data = initialData()
  const original = data.schedule.weekdayMinutes
  data.schedule.dailyOverrides[todayISO()] = 20
  assert.equal(capacityForDate(todayISO(), data.schedule), 20)
  assert.equal(data.schedule.weekdayMinutes, original)
})
