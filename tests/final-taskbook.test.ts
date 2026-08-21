import test from 'node:test'
import assert from 'node:assert/strict'
import { createTaskChangeSet, revertChangeSet } from '../src/changeSets.ts'
import { applyNormalizationToCourse } from '../src/courseCatalog.ts'
import { getCourseIntelligence } from '../src/courseIntelligence.ts'
import { createCourse, createTask, initialData } from '../src/data.ts'
import { addDays, dayName, daysBetween, mondayOfWeek } from '../src/dateUtils.ts'
import { submitDailyCheck } from '../src/dailyCheck.ts'
import { activateGlobalPlanDraft, buildGlobalPlanDraft, validateGlobalPlanDraft } from '../src/globalPlanner.ts'
import { mergeResourceCatalog, migrateWeekReflectionKeys, validateV4Data } from '../src/migration.ts'
import { buildDiagnosis, completeDiagnosisAttempt, deriveProgress, nextWeekLockKey, recordTaskEvent } from '../src/providers.ts'
import { scheduleTasks } from '../src/scheduler.ts'
import type { AppData, Course, LearningResource } from '../src/types.ts'

const completeCourse = (data: AppData, name: string, id: string, score: number): Course => {
  const course = applyNormalizationToCourse(createCourse({
    id,
    name,
    stage: '大学',
    courseType: name === 'Python' ? '专业基础课' : '公共基础课',
    assessmentMode: 'score',
    score,
    maxScore: 100,
    passScore: 60,
    examType: '期末考试',
    mastery: '基础薄弱',
    mainDifficulty: '离开示例后不能独立完成',
    selfEvidence: '最近三次练习都需要查看示例',
    goalType: '补弱',
    targetScore: 70,
    targetDate: addDays(data.schedule.holidayStart, 35),
    desiredResult: '完成阶段复测并记录错因',
    priority: score < 30,
    curriculum: {
      ...createCourse().curriculum,
      stage: '大学', school: '示例大学', major: '示例专业', semester: '上学期', textbookVersion: '用户课程大纲', syllabusTitle: '用户课程大纲', source: 'user-input',
      syllabusUnits: [
        { id: `${id}-u1`, title: name === 'Python' ? '语法与函数' : '函数与极限', order: 1, prerequisites: [] },
        { id: `${id}-u2`, title: name === 'Python' ? '调试与测试' : '导数与应用', order: 2, prerequisites: [`${id}-u1`] },
      ],
    },
  }))
  data.courses.push(course)
  const draft = buildDiagnosis(data, course.id)
  const answers = Object.fromEntries(draft.diagnosticQuiz.map(question => [question.id, question.options[0]]))
  const completed = completeDiagnosisAttempt(data, draft, answers)
  data.diagnoses[course.id] = completed.diagnosis
  data.diagnosisHistory.push(completed.diagnosis)
  data.quizEvents.push(...completed.events)
  return course
}

test('P0 全课程草案包含全部已启用课程并原子激活', () => {
  const data = initialData()
  const math = completeCourse(data, '高等数学', 'math', 15)
  const python = completeCourse(data, 'Python', 'python', 68)
  const draft = buildGlobalPlanDraft(data)
  assert.deepEqual(new Set(draft.courseIds), new Set([math.id, python.id]))
  assert.ok(draft.tasks.some(task => task.courseId === math.id))
  assert.ok(draft.tasks.some(task => task.courseId === python.id))
  const failedStage = draft.tasks.find(task => task.scheduleStatus !== 'scheduled')?.stageLabel
  const debugTasks = draft.tasks.filter(task => task.stageLabel === failedStage).map(task => ({ title: task.title, courseId: task.courseId, date: task.date, slotId: task.slotId, minutes: task.estimatedMinutes, status: task.scheduleStatus, order: task.order }))
  assert.equal(draft.validation.valid, true, JSON.stringify({ reasons: draft.validation.reasons, failedStage, debugTasks }, null, 2))
  const activated = activateGlobalPlanDraft(data, draft)
  assert.equal(activated.globalPlanDraft?.status, 'activated')
  assert.deepEqual(new Set(activated.tasks.map(task => task.courseId)), new Set([math.id, python.id]))
  const reloaded = validateV4Data(JSON.parse(JSON.stringify(activated)))
  assert.equal(reloaded.onboardingCompleted, activated.onboardingCompleted)
  assert.equal(reloaded.globalPlanDraft?.status, 'activated')
})

test('P1 未排入本周的任务保留在任务池，不阻止学习计划启用', () => {
  const data = initialData()
  completeCourse(data, '高等数学', 'math', 15)
  const draft = buildGlobalPlanDraft(data)
  const broken = { ...draft, tasks: draft.tasks.map((task, index) => index ? task : { ...task, date: '', slotId: '', scheduleStatus: 'needs-confirmation' as const }) }
  const validation = validateGlobalPlanDraft(data, broken)
  assert.equal(validation.valid, true)
  assert.equal(validation.scheduledTaskIds.includes(broken.tasks[0].id), false)
  assert.equal(validation.failedTaskIds.includes(broken.tasks[0].id), false)
  assert.equal(validation.confirmationTaskIds.includes(broken.tasks[0].id), true)
})

test('P0 全课程任务分母等于各课程分母之和，计划事件和归档重复只计一次', () => {
  const data = initialData()
  const weekStart = mondayOfWeek()
  const first = createCourse({ id: 'a', name: '高等数学', stage: '大学' })
  const second = createCourse({ id: 'b', name: 'Python', stage: '大学' })
  data.courses = [first, second]
  const a = createTask({ id: 'task-a', courseId: first.id, date: weekStart, originalPlannedDate: weekStart, status: '已完成' })
  const b = createTask({ id: 'task-b', courseId: second.id, date: weekStart, originalPlannedDate: weekStart, status: '待完成' })
  data.tasks = [a, b]
  data.taskEvents = [recordTaskEvent(a, 'completed', '完成', 30)]
  data.weekArchives = [{ id: 'archive-all', weekStart, weekEnd: addDays(weekStart, 6), courseId: 'all', planVersionIds: [], plannedTaskIds: [a.id, b.id], plannedTasks: [{ taskId: a.id, courseId: first.id }, { taskId: b.id, courseId: second.id }], reflection: '', archivedAt: new Date().toISOString() }]
  const all = deriveProgress(data, '', weekStart)
  const firstProgress = deriveProgress(data, first.id, weekStart)
  const secondProgress = deriveProgress(data, second.id, weekStart)
  assert.equal(all.weeklyTaskIds.size, firstProgress.weeklyTaskIds.size + secondProgress.weeklyTaskIds.size)
  assert.equal(firstProgress.weeklyTaskIds.size, 1)
  assert.equal(all.completed, 1)
})

test('P1 旧用户自建资源与个性状态保留，同时合并新版内置目录', () => {
  const fresh = initialData().resources
  const builtIn = fresh[0]
  const custom: LearningResource = { ...builtIn, id: 'user-custom', title: '我的课程链接', platform: '用户提供', userProvided: true, humanVerified: false, status: '可用' }
  const merged = mergeResourceCatalog([{ ...builtIn, status: '不感兴趣', dismissedAt: '2026-01-01T00:00:00.000Z' }, custom], fresh)
  assert.equal(merged.length, fresh.length + 1)
  assert.equal(merged.find(resource => resource.id === builtIn.id)?.status, '不感兴趣')
  assert.equal(merged.find(resource => resource.id === builtIn.id)?.title, builtIn.title)
  assert.equal(merged.find(resource => resource.id === custom.id)?.userProvided, true)
})

test('P1 同一周不同课程反思使用独立键，旧周键迁移到全部课程', () => {
  const migrated = migrateWeekReflectionKeys({ '2026-01-12': '旧复盘', 'math:2026-01-19': '数学复盘' })
  assert.equal(migrated['all:2026-01-12'], '旧复盘')
  assert.equal(migrated['math:2026-01-19'], '数学复盘')
  assert.notEqual(nextWeekLockKey('math', '2026-01-12'), nextWeekLockKey('english', '2026-01-12'))
})

test('P1 教练撤销只恢复指定 changeSet，不影响之后的无关手动修改', () => {
  const data = initialData()
  const a = createTask({ id: 'a', title: '任务 A', courseId: 'course-a' })
  const b = createTask({ id: 'b', title: '任务 B', courseId: 'course-b' })
  data.tasks = [a, b]
  const afterCoach = [{ ...a, date: addDays(a.date, 1) }, b]
  const coach = createTaskChangeSet(data.tasks, afterCoach, '移动任务 A', { source: 'coach' })
  const afterManual = [afterCoach[0], { ...b, title: '任务 B 已编辑' }]
  const manual = createTaskChangeSet(afterCoach, afterManual, '编辑任务 B', { source: 'manual' })
  const current = { ...data, tasks: afterManual, changeSets: [coach, manual] }
  const reverted = revertChangeSet(current, coach.id)
  assert.equal(reverted.tasks.find(task => task.id === 'a')?.date, a.date)
  assert.equal(reverted.tasks.find(task => task.id === 'b')?.title, '任务 B 已编辑')
  assert.equal(reverted.changeSets.find(item => item.id === manual.id)?.revertedAt, undefined)
})

test('P1 非客观自检保存真实作答和信心，但不产生客观正确率或达标结论', () => {
  const data = initialData()
  const course = createCourse({ id: 'design', name: '产品设计', stage: '大学' })
  data.courses = [course]
  const task = createTask({ id: 'design-task', courseId: course.id, knowledgePoint: '用户调研', title: '访谈提纲' })
  const check = { id: 'check', courseId: course.id, taskId: task.id, unitId: 'u1', knowledgePointId: '用户调研', questionType: 'application' as const, difficulty: '基础' as const, prompt: '写出访谈提纲', rubric: ['包含开放问题'], explanation: '需人工复核', fingerprint: 'f', generatedAt: new Date().toISOString(), attemptId: 'attempt' }
  const event = submitDailyCheck(data, check, '我写了五个开放问题并检查诱导措辞', '掌握')
  data.quizEvents.push(event)
  assert.equal(event.maxScore, 0)
  assert.equal(event.evidenceType, 'performance_task')
  assert.equal(deriveProgress(data, course.id).accuracy, null)
})

test('P0 休息日、旅行日和容量为 0 的日期不会生成正式任务', () => {
  const data = initialData()
  const course = createCourse({ id: 'math', name: '高等数学', stage: '大学' })
  data.courses = [course]
  const start = data.schedule.holidayStart
  data.schedule.restDays = [dayName(start)]
  data.schedule.dailyOverrides[addDays(start, 1)] = 0
  data.schedule.constraints.push({ id: 'travel', startAt: `${addDays(start, 2)}T00:00:00+08:00`, endAt: `${addDays(start, 2)}T23:59:59+08:00`, type: 'travel', capacityMinutes: 0, note: '旅行' })
  const tasks = scheduleTasks([createTask({ courseId: course.id, planId: 'p', date: start, stageStartDate: start, stageEndDate: addDays(start, 6), knowledgePoint: '极限', title: '极限基础', estimatedMinutes: 45 })], [course], data.schedule)
  assert.ok(tasks.every(task => ![start, addDays(start, 1), addDays(start, 2)].includes(task.date)))
})

test('P0 非完整七周假期按真实日期生成阶段，不越界也不硬凑七周', () => {
  const data = initialData()
  data.schedule.holidayEnd = addDays(data.schedule.holidayStart, 9)
  const course = applyNormalizationToCourse(createCourse({ id: 'python', name: 'Python', stage: '大学', curriculum: { ...createCourse().curriculum, stage: '大学', semester: '上学期', major: '计算机', source: 'user-input', syllabusUnits: [{ id: 'u1', title: '语法', order: 1, prerequisites: [] }, { id: 'u2', title: '调试', order: 2, prerequisites: ['u1'] }] } }))
  const intelligence = getCourseIntelligence(course, data.schedule)
  assert.equal(intelligence.learningStages.length, 2)
  assert.ok(intelligence.learningStages.every(stage => stage.courseId === course.id && stage.startDate >= data.schedule.holidayStart && stage.endDate <= data.schedule.holidayEnd))
})

test('P0 43 天假期均匀分阶段，不产生只有 1 天却承载整周任务的尾阶段', () => {
  const data = initialData()
  data.schedule.holidayEnd = addDays(data.schedule.holidayStart, 42)
  const course = applyNormalizationToCourse(createCourse({ id: 'design', name: 'Photoshop', stage: '大学' }))
  const stages = getCourseIntelligence(course, data.schedule).learningStages
  assert.equal(stages.length, 6)
  assert.ok(stages.every(stage => daysBetween(stage.startDate, stage.endDate) + 1 >= 7))
  assert.equal(stages[0].startDate, data.schedule.holidayStart)
  assert.equal(stages.at(-1)?.endDate, data.schedule.holidayEnd)
})
