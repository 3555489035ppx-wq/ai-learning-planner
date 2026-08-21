import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyNormalizationToCourse } from '../src/courseCatalog.ts'
import { completeDiagnosisAttempt, activatePlanPreview, buildDiagnosis, planDiff, previewPlanForCourse, restorePlanVersion, validatePlanDraft } from '../src/providers.ts'
import { createCourse, createTask, initialData } from '../src/data.ts'
import { addDays } from '../src/dateUtils.ts'
import { scheduleTasks } from '../src/scheduler.ts'
import { defaultTimeSlots } from '../src/timetable.ts'
import type { AppData, Course } from '../src/types.ts'

const makeCourse = (name = '高等数学'): Course => applyNormalizationToCourse(createCourse({
  name,
  stage: '大学',
  courseType: name === 'Python' ? '专业基础课' : '公共基础课',
  assessmentMode: 'score',
  score: 58,
  maxScore: 100,
  passScore: 60,
  examType: '期末考试',
  mastery: '基础薄弱',
  mainDifficulty: '典型任务不能独立完成',
  selfEvidence: '最近练习仍需对照示例',
  goalType: '补弱',
  targetScore: 70,
  targetDate: addDays(initialData().schedule.holidayStart, 41),
  priority: true,
  desiredResult: '通过阶段复测验证提升',
  curriculum: {
    ...createCourse().curriculum,
    stage: '大学', school: '示例大学', major: '示例专业', semester: '上学期', textbookVersion: '用户大纲', syllabusTitle: '用户大纲', source: 'user-input',
    syllabusUnits: [
      { id: 'unit-1', title: name === 'Python' ? '基础实现' : '函数与极限', order: 1, prerequisites: [] },
      { id: 'unit-2', title: name === 'Python' ? '调试与测试' : '导数与应用', order: 2, prerequisites: ['unit-1'] },
    ],
  },
}))

const withCompletedDiagnosis = (course = makeCourse()) => {
  const data = initialData()
  data.courses = [course]
  const draft = buildDiagnosis(data, course.id)
  const answers = Object.fromEntries(draft.diagnosticQuiz.map(question => [question.id, question.options[0]]))
  const completed = completeDiagnosisAttempt(data, draft, answers)
  data.diagnoses[course.id] = completed.diagnosis
  data.diagnosisHistory.push(completed.diagnosis)
  data.quizEvents.push(...completed.events)
  return { data, course }
}

test('计划草案不覆盖当前任务，且摘要所需字段均可从结构化数据得到', () => {
  const { data, course } = withCompletedDiagnosis()
  const existing = createTask({ id: 'existing', courseId: course.id, title: '原计划任务' })
  data.tasks = [existing]
  const preview = previewPlanForCourse(data, course.id)
  assert.deepEqual(data.tasks, [existing])
  assert.equal(preview.plan.status, 'draft')
  assert.equal(preview.plan.diagnosisVersion, data.diagnoses[course.id].version)
  assert.ok(preview.tasks.every(task => task.completionCriteria && task.arrangementReason && task.stageStartDate && task.stageEndDate))
  assert.equal(validatePlanDraft(data, preview.plan, preview.tasks).valid, true)
})

test('规则校验阻止缺字段、越界或待确认草案直接启用', () => {
  const { data, course } = withCompletedDiagnosis()
  const preview = previewPlanForCourse(data, course.id)
  const invalid = preview.tasks.map((task, index) => index ? task : { ...task, completionCriteria: '', date: addDays(data.schedule.holidayEnd, 1) })
  const validation = validatePlanDraft(data, preview.plan, invalid)
  assert.equal(validation.valid, false)
  assert.match(validation.reasons.join(' '), /完成标准|假期日期|阶段日期/)
  assert.throws(() => activatePlanPreview(data, preview.plan, invalid), /未通过规则校验/)
  assert.equal(data.tasks.length, 0)
})

test('确认生成计划版本和任务快照，并能恢复旧版本而不删除已完成任务', () => {
  const { data, course } = withCompletedDiagnosis()
  const firstPreview = previewPlanForCourse(data, course.id)
  const first = activatePlanPreview(data, firstPreview.plan, firstPreview.tasks)
  assert.equal(first.plans.find(plan => plan.id === firstPreview.plan.id)?.status, 'active')
  assert.equal(first.planTaskArchive[firstPreview.plan.id].length, firstPreview.tasks.length)
  const completedId = first.tasks[0].id
  first.tasks[0] = { ...first.tasks[0], status: '已完成' }
  const secondPreview = previewPlanForCourse(first, course.id)
  const second = activatePlanPreview(first, secondPreview.plan, secondPreview.tasks)
  assert.equal(second.plans.find(plan => plan.id === firstPreview.plan.id)?.status, 'archived')
  const restored = restorePlanVersion(second, firstPreview.plan.id)
  assert.equal(restored.plans.find(plan => plan.id === firstPreview.plan.id)?.status, 'active')
  assert.equal(restored.tasks.find(task => task.id === completedId)?.status, '已完成')
})

test('重新生成草案使用语义任务键显示真实差异而非把全部任务当作新增', () => {
  const { data, course } = withCompletedDiagnosis()
  const before = previewPlanForCourse(data, course.id).tasks
  const after = before.map(task => ({ ...task, id: crypto.randomUUID() }))
  const unchanged = planDiff(before, after)
  assert.equal(unchanged.added.length, 0)
  assert.equal(unchanged.removed.length, 0)
  const moved = after.map((task, index) => index ? task : { ...task, date: addDays(task.date, 1) })
  assert.equal(planDiff(before, moved).moved.length, 1)
})

test('4＋4＋2 节次结构固定，任务按认知负荷选择上午、下午或晚上', () => {
  assert.deepEqual(defaultTimeSlots.map(slot => slot.period), ['morning', 'morning', 'morning', 'morning', 'afternoon', 'afternoon', 'afternoon', 'afternoon', 'evening', 'evening'])
  const data = initialData()
  data.schedule.weekdayMinutes = 180
  data.schedule.weekendMinutes = 180
  const math = makeCourse('高等数学')
  const python = makeCourse('Python')
  data.courses = [math, python]
  const start = data.schedule.holidayStart
  const candidates = [
    createTask({ courseId: math.id, planId: 'energy', date: start, title: '高难推导', knowledgePoint: '导数', difficulty: '进阶', stageStartDate: start, stageEndDate: addDays(start, 6), estimatedMinutes: 45 }),
    createTask({ courseId: python.id, planId: 'energy', date: start, title: '编码实现', knowledgePoint: '函数', difficulty: '中等', stageStartDate: start, stageEndDate: addDays(start, 6), estimatedMinutes: 45, order: 2 }),
    createTask({ courseId: math.id, planId: 'energy', date: start, title: '错题复习与总结', knowledgePoint: '错题', difficulty: '基础', stageStartDate: start, stageEndDate: addDays(start, 6), estimatedMinutes: 45, order: 3 }),
  ]
  const scheduled = scheduleTasks(candidates, data.courses, data.schedule)
  const slots = new Map(data.schedule.timeSlots.map(slot => [slot.id, slot.period]))
  assert.equal(slots.get(scheduled.find(task => task.title === '高难推导')?.slotId ?? ''), 'morning')
  assert.equal(slots.get(scheduled.find(task => task.title === '编码实现')?.slotId ?? ''), 'afternoon')
  assert.equal(slots.get(scheduled.find(task => task.title === '错题复习与总结')?.slotId ?? ''), 'evening')
})

test('同一知识点复习至少间隔一天，冲突任务进入待确认而不越界', () => {
  const data = initialData()
  const course = makeCourse()
  const start = data.schedule.holidayStart
  const candidates = [0, 1, 2].map(index => createTask({ courseId: course.id, planId: 'spacing', date: start, title: `极限复习 ${index + 1}`, knowledgePoint: '极限', stageStartDate: start, stageEndDate: addDays(start, 6), estimatedMinutes: 45, order: index }))
  const scheduled = scheduleTasks(candidates, [course], data.schedule).filter(task => task.date)
  assert.ok(scheduled.every((task, index) => index === 0 || task.date > scheduled[index - 1].date))
})

test('三个页面复用 WeekNavigator，左右图标独立且不再依靠 CSS 旋转', () => {
  const components = readFileSync(new URL('../src/components.tsx', import.meta.url), 'utf8')
  const plan = readFileSync(new URL('../src/pages/PlanV4.tsx', import.meta.url), 'utf8')
  const progress = readFileSync(new URL('../src/pages/ProgressV4.tsx', import.meta.url), 'utf8')
  const review = readFileSync(new URL('../src/pages/WeeklyReview.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  assert.match(components, /chevron-left/)
  assert.match(components, /chevron-right/)
  ;[plan, progress, review].forEach(source => assert.match(source, /<WeekNavigator/))
  assert.doesNotMatch(css, /week-switcher \.next svg[^}]*rotate/)
})
