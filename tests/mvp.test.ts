import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, courseTypesForStage, createCourse, createTask, initialData, mondayOfWeek, reconcileCourseStage, todayISO } from '../src/data.ts'
import { getCourseIntelligence } from '../src/courseIntelligence.ts'
import {
  applyNextWeekPlan,
  buildDiagnosis,
  buildHolidayPlan,
  canApplyNextWeekPlan,
  courseFieldErrors,
  createTaskFromResource,
  deriveProgress,
  matchingResources,
  nextWeekRevision,
  restorePreviousPlan,
  validateDiagnosis,
} from '../src/providers.ts'
import type { Course, EducationStage } from '../src/types.ts'

const makeCourse = (overrides: Partial<Course>): Course => createCourse({
  name: '示例课程',
  stage: '大学',
  courseType: '技能课程',
  assessmentMode: 'mastery',
  mastery: '基础薄弱',
  mainDifficulty: '无法独立完成典型任务',
  selfEvidence: '只能跟随示例完成，离开提示后会卡住',
  goalType: '技能提升',
  targetDate: addDays(todayISO(), 41),
  priority: true,
  desiredResult: '独立完成一个可检查的成果',
  ...overrides,
})

const courseCorpus = (data: ReturnType<typeof initialData>, course: Course) => {
  const intelligence = getCourseIntelligence(course, data.schedule)
  const diagnosis = validateDiagnosis(buildDiagnosis(data, course.id))
  const tasks = buildHolidayPlan(data, diagnosis)
  const resources = matchingResources(data, course.id)
  return {
    intelligence,
    diagnosis,
    tasks,
    resources,
    text: JSON.stringify({ intelligence, diagnosis, tasks, resources }),
  }
}

test('Photoshop 的目标、诊断、阶段、任务和资源均为设计软件内容', () => {
  const data = initialData()
  const photoshop = makeCourse({ name: 'Photoshop', stage: '职业技能', courseType: '软件技能', assessmentMode: 'project', projectCompleted: false, goalType: '完成作品' })
  data.courses = [photoshop]
  const result = courseCorpus(data, photoshop)
  assert.equal(result.intelligence.domainCategory, '设计软件类')
  assert.equal(result.intelligence.suggestedGoals.length, 3)
  assert.match(result.intelligence.suggestedGoals.join(' '), /海报|蒙版|图层|调色/)
  assert.match(result.intelligence.diagnosticQuiz.map(item => `${item.prompt}${item.point}`).join(' '), /图层|蒙版|选区|导出/)
  assert.match(result.intelligence.learningStages.map(item => `${item.focus}${item.deliverable}`).join(' '), /作品|图层|选区|蒙版|导出/)
  assert.ok(result.tasks.length >= 4)
  assert.ok(result.tasks.every(task => task.courseId === photoshop.id))
  assert.ok(result.resources.some(resource => /Photoshop/.test(resource.title)))
  assert.doesNotMatch(result.text, /函数|极限|导数|积分|先修代数/)
})

test('大学英语输出语言学习目标，并默认隐藏外语资源', () => {
  const data = initialData()
  const english = makeCourse({ name: '大学英语', courseType: '语言考试', goalType: '四六级' })
  data.courses = [english]
  const result = courseCorpus(data, english)
  assert.equal(result.intelligence.domainCategory, '语言类')
  assert.match(result.text, /词汇|阅读|听力|写作|语言/)
  assert.ok(result.resources.every(resource => resource.language.includes('中文') || resource.language.includes('双语')))
  assert.equal(result.resources.some(resource => resource.platform === 'British Council'), false)
  assert.doesNotMatch(result.text, /极限|导数|积分/)
})

test('高等数学仍能生成数学诊断、阶段、任务和资源', () => {
  const data = initialData()
  const math = makeCourse({ name: '高等数学', courseType: '必修课', assessmentMode: 'score', score: 58, maxScore: 100, passScore: 60, examType: '期末考试', goalType: '补弱', targetScore: 75 })
  data.courses = [math]
  const result = courseCorpus(data, math)
  assert.equal(result.intelligence.domainCategory, '数学类')
  assert.match(result.text, /概念|典型题|错因|数学|微积分/)
  assert.ok(result.resources.some(resource => ['中国大学 MOOC', '学堂在线'].includes(resource.platform) && resource.humanVerified && resource.url.startsWith('https://higher.smartedu.cn/course/')))
})

test('未识别课程使用学科中立回退，不伪造专业题目', () => {
  const data = initialData()
  const unknown = makeCourse({ name: '星际航线整理术', stage: '大学', courseType: '专业选修课' })
  data.courses = [unknown]
  const baseline = courseCorpus(data, unknown)
  assert.equal(baseline.diagnosis.confidence, '低')
  assert.match(baseline.text, /星际航线整理术/)
  assert.doesNotMatch(baseline.text, /函数|极限|导数|蒙版|词汇语法|Python/)
  unknown.curriculum.syllabusUnits = [
    { id: 'route-basics', title: '航线整理基础', order: 1, prerequisites: [] },
    { id: 'route-check', title: '航线检查流程', order: 2, prerequisites: ['route-basics'] },
  ]
  const result = courseCorpus(data, unknown)
  assert.equal(result.intelligence.fallbackUsed, true)
  assert.equal(result.intelligence.domainCategory, '通用技能类')
  assert.match(result.text, /典型任务|完成标准|流程|复盘/)
  assert.doesNotMatch(result.text, /函数|极限|导数|蒙版|词汇语法|Python/)
  assert.equal(result.resources.length, 0)
})

test('教育阶段联动课程类型，并清除不兼容值', () => {
  const expectations: Record<EducationStage, string[]> = {
    高中: ['学科课程', '高考专项', '竞赛/拓展'],
    大学: ['公共基础课', '专业基础课', '专业核心课', '专业选修课', '语言/等级考试', '软件工具课', '项目/作品课'],
  }
  Object.entries(expectations).forEach(([stage, types]) => assert.deepEqual(courseTypesForStage(stage as EducationStage), types))
  const universityCourse = makeCourse({ courseType: '专业核心课' })
  const result = reconcileCourseStage(universityCourse, '高中')
  assert.equal(result.incompatible, true)
  assert.equal(result.course.courseType, '')
})

test('熟练度和项目作品模式不强制填写考试分数', () => {
  for (const assessmentMode of ['mastery', 'project'] as const) {
    const course = makeCourse({ assessmentMode, score: '', maxScore: '', passScore: '', examType: '' })
    const errors = courseFieldErrors(course)
    assert.equal(errors.score, undefined)
    assert.equal(errors.maxScore, undefined)
    assert.equal(errors.passScore, undefined)
    assert.equal(errors.examType, undefined)
  }
})

test('多课程诊断、计划、资源和进展按 courseId 隔离', () => {
  const data = initialData()
  const photoshop = makeCourse({ name: 'Photoshop', stage: '职业技能', courseType: '软件技能', priority: true })
  const english = makeCourse({ name: '大学英语', courseType: '语言考试', priority: false })
  data.courses = [photoshop, english]
  const psDiagnosis = buildDiagnosis(data, photoshop.id)
  const enDiagnosis = buildDiagnosis(data, english.id)
  assert.notEqual(psDiagnosis.domainCategory, enDiagnosis.domainCategory)
  const psTasks = buildHolidayPlan(data, psDiagnosis)
  const enTasks = buildHolidayPlan(data, enDiagnosis)
  assert.ok(psTasks.every(task => task.courseId === photoshop.id))
  assert.ok(enTasks.every(task => task.courseId === english.id))
  assert.ok(matchingResources(data, photoshop.id).every(resource => resource.courseNames.some(name => /photoshop|ps/i.test(name))))
  assert.ok(matchingResources(data, english.id).every(resource => resource.domainCategory === '语言类'))
  const monday = mondayOfWeek()
  data.tasks = [createTask({ courseId: photoshop.id, date: monday, status: '已完成' }), createTask({ courseId: english.id, date: monday, status: '待完成' })]
  const psProgress = deriveProgress(data, photoshop.id)
  assert.equal(psProgress.weeklyTasks.length, 1)
  assert.equal(psProgress.weeklyTasks[0].courseId, photoshop.id)
})

test('资源加入计划绑定用户选择的课程，不使用数组第一项', () => {
  const data = initialData()
  const english = makeCourse({ name: '大学英语', courseType: '语言考试', priority: true })
  const photoshop = makeCourse({ name: 'Photoshop', stage: '职业技能', courseType: '软件技能', priority: false })
  data.courses = [english, photoshop]
  const resource = data.resources.find(item => item.id === 'resource-adobe-photoshop')!
  const task = createTaskFromResource(resource, photoshop, addDays(todayISO(), 3), '第 2 周', 45, 8)
  assert.equal(task.courseId, photoshop.id)
  assert.notEqual(task.courseId, data.courses[0].id)
  assert.equal(task.resourceId, resource.id)
  assert.equal(task.stageLabel, '第 2 周')
})

test('本周完成率只统计周一到周日内的任务', () => {
  const data = initialData()
  const course = makeCourse({ name: 'Python 编程' })
  data.courses = [course]
  const monday = mondayOfWeek()
  data.tasks = [
    createTask({ courseId: course.id, date: monday, status: '已完成' }),
    createTask({ courseId: course.id, date: addDays(monday, 2), status: '待完成' }),
    createTask({ courseId: course.id, date: addDays(monday, 8), status: '已完成' }),
  ]
  const progress = deriveProgress(data)
  assert.equal(progress.weeklyTasks.length, 2)
  assert.equal(progress.completionRate, 50)
})

test('下周计划不能重复应用，撤销能恢复原任务', () => {
  const data = initialData()
  const course = makeCourse({ name: 'Python 编程' })
  data.courses = [course]
  data.tasks = [createTask({ courseId: course.id, date: todayISO(), title: '原任务', estimatedMinutes: 80, status: '待完成' })]
  const original = data.tasks.map(task => ({ ...task }))
  data.progress.previousPlan = original
  data.tasks = applyNextWeekPlan(data.tasks)
  data.progress.appliedRevision = nextWeekRevision()
  assert.equal(canApplyNextWeekPlan(data), false)
  assert.notEqual(data.tasks[0].date, original[0].date)
  assert.deepEqual(restorePreviousPlan(data), original)
})

test('首次进入使用空白用户数据，不混入演示课程或进展', () => {
  const data = initialData()
  assert.equal(data.onboardingCompleted, false)
  assert.deepEqual(data.courses, [])
  assert.deepEqual(data.tasks, [])
  assert.deepEqual(data.diagnoses, {})
  assert.deepEqual(data.taskEvents, [])
  assert.deepEqual(data.quizEvents, [])
})

test('9/100 高数先给基础诊断，不承诺固定成绩结果', () => {
  const data = initialData()
  const math = makeCourse({ name: '高等数学', courseType: '必修课', assessmentMode: 'score', score: 9, maxScore: 100, passScore: 60, examType: '期末考试', goalType: '补弱', targetScore: 60 })
  data.courses = [math]
  const diagnosis = validateDiagnosis(buildDiagnosis(data, math.id))
  assert.equal(diagnosis.diagnosticQuiz.length, 4)
  assert.match(diagnosis.nextAction, /基础诊断/)
  assert.match(diagnosis.disclaimer, /不构成成绩.*保证/)
  assert.ok(diagnosis.learningStages.length >= 2 && diagnosis.learningStages.length <= 8)
})
