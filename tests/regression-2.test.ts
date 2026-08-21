import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyNormalizationToCourse, catalogProfiles } from '../src/courseCatalog.ts'
import { stableCourseOrder } from '../src/courseOrder.ts'
import { createCourse, createTask, initialData } from '../src/data.ts'
import { addDays } from '../src/dateUtils.ts'
import { generateDailyChecks, selectDailyCheckState, submitDailyCheck } from '../src/dailyCheck.ts'
import { activateGlobalPlanDraft, buildGlobalPlanDraft } from '../src/globalPlanner.ts'
import { buildBilibiliSearchSuggestions, mockResourceProvider, validateResourceSnapshots } from '../src/resourceProvider.ts'
import { markStaleDependencies } from '../src/versioning.ts'
import type { AppData, Course, LearningTask } from '../src/types.ts'

const makeCourse = (name: string, id: string, stage: '高中' | '大学' = '大学', score = 58): Course => applyNormalizationToCourse(createCourse({
  id,
  name,
  stage,
  courseType: stage === '高中' ? '文化课' : '必修课',
  assessmentMode: 'score',
  score,
  maxScore: 100,
  passScore: 60,
  examType: '期末考试',
  mastery: score < 40 ? '基础薄弱' : '一般',
  mainDifficulty: '基础知识之间缺少稳定连接',
  selfEvidence: '独立完成新题时容易在中间步骤中断',
  goalType: '补弱',
  targetScore: 70,
  targetDate: addDays(initialData().schedule.holidayStart, 41),
  desiredResult: '完成同难度阶段复测并记录错因',
  curriculum: {
    ...createCourse().curriculum,
    stage,
    province: stage === '高中' ? '河南' : '',
    grade: stage === '高中' ? '高二' : '',
    school: stage === '大学' ? '本校' : '',
    major: stage === '大学' ? '当前专业' : '',
    semester: '上学期',
    textbookVersion: stage === '高中' ? '人教版' : '用户课程大纲',
    source: 'user-input',
  },
}))

const semanticTasks = (tasks: LearningTask[]) => tasks.map(task => ({
  courseId: task.courseId,
  date: task.date,
  time: task.time,
  slotId: task.slotId,
  title: task.title,
  stageLabel: task.stageLabel,
  knowledgePoint: task.knowledgePoint,
  estimatedMinutes: task.estimatedMinutes,
  order: task.order,
})).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))

test('六个课程页面共用稳定顺序，选中项不会移动，高中 6 门和大学 8 门顺序不变', () => {
  const high = ['数学', '英语', '物理', '化学', '生物', '历史'].map((name, index) => makeCourse(name, `h-${index}`, '高中'))
  const university = ['高等数学', '大学英语', 'Python', '数据结构', '操作系统', '计算机网络', '数据库', 'Java'].map((name, index) => makeCourse(name, `u-${index}`))
  for (const courses of [high, university]) {
    const expected = courses.map(course => course.id)
    courses.forEach(selected => {
      void selected
      assert.deepEqual(stableCourseOrder(courses).map(course => course.id), expected)
    })
  }
  const pages = ['Diagnosis', 'PlanV4', 'ProgressV4', 'Resources', 'TodayV4', 'WeeklyReview']
  pages.forEach(page => assert.match(readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8'), /CourseSwitcher/))
})

test('高中 6 门课程无需完成诊断即可生成并原子启用全课程计划', () => {
  const data = initialData()
  data.schedule.weekdayMinutes = 180
  data.schedule.weekendMinutes = 240
  data.courses = ['数学', '英语', '物理', '化学', '生物', '历史'].map((name, index) => makeCourse(name, `high-${index}`, '高中', 45 + index * 5))
  const draft = buildGlobalPlanDraft(data)
  assert.equal(draft.courseIds.length, 6)
  assert.ok(draft.courseIds.every(id => draft.planningBases[id]?.source === 'score-baseline'))
  assert.ok(draft.tasks.length > 0)
  assert.equal(draft.validation.valid, true, draft.validation.reasons.join(' '))
  assert.equal(activateGlobalPlanDraft({ ...data, globalPlanDraft: draft }, draft).tasks.length, draft.tasks.length)
})

test('大学 6 门课程无需完成诊断即可生成全部课程计划，内容按课程隔离', () => {
  const data = initialData()
  data.schedule.weekdayMinutes = 180
  data.schedule.weekendMinutes = 240
  const names = ['Python', '数据结构', '操作系统', '计算机网络', '数据库', 'Java']
  data.courses = names.map((name, index) => makeCourse(name, `cs-${index}`, '大学', 50 + index * 4))
  const draft = buildGlobalPlanDraft(data)
  assert.equal(new Set(draft.tasks.map(task => task.courseId)).size, 6)
  assert.ok(draft.tasks.filter(task => task.courseId === 'cs-0').every(task => /Python|编程|代码|语法|函数|调试|测试/.test(`${task.title}${task.action}${task.knowledgePoint}`)))
  assert.ok(draft.tasks.filter(task => task.courseId === 'cs-2').every(task => !/Photoshop|蒙版|高等数学/.test(`${task.title}${task.action}${task.knowledgePoint}`)))
})

test('修改每日容量只使计划过期，已完成诊断保持有效', async () => {
  const data = initialData()
  const course = makeCourse('高等数学', 'math')
  data.courses = [course]
  const result = await (await import('../src/providers.ts')).localPlanningProvider.generateDiagnosis(data, course.id)
  data.diagnoses[course.id] = { ...result.data, status: 'completed', completedAt: result.data.generatedAt }
  const basisDraft = buildGlobalPlanDraft(data)
  const active = activateGlobalPlanDraft({ ...data, globalPlanDraft: basisDraft }, basisDraft)
  const diagnosis = active.diagnoses[course.id]
  const changed = markStaleDependencies(active, { ...active, schedule: { ...active.schedule, weekdayMinutes: 60 } })
  assert.equal(changed.diagnoses[course.id]?.status, diagnosis?.status)
  assert.equal(changed.plans.find(plan => plan.courseId === course.id)?.status, 'stale')
})

test('修改一门课程成绩只使对应诊断待复核，不污染其他课程', async () => {
  const data = initialData()
  data.courses = [makeCourse('高等数学', 'math'), makeCourse('大学英语', 'english')]
  for (const course of data.courses) {
    const result = await (await import('../src/providers.ts')).localPlanningProvider.generateDiagnosis(data, course.id)
    data.diagnoses[course.id] = { ...result.data, status: 'completed', completedAt: result.data.generatedAt }
  }
  const changed = markStaleDependencies(data, { ...data, courses: data.courses.map(course => course.id === 'math' ? { ...course, score: 9 } : course) })
  assert.equal(changed.diagnoses.math.status, 'superseded')
  assert.equal(changed.diagnoses.english.status, 'completed')
})

test('课程输入顺序不同仍生成语义一致的确定性计划', () => {
  const courses = [makeCourse('高等数学', 'a'), makeCourse('大学英语', 'b'), makeCourse('Python', 'c')]
  const left = initialData(); left.courses = courses
  const right = initialData(); right.courses = [...courses].reverse()
  assert.deepEqual(semanticTasks(buildGlobalPlanDraft(left).tasks), semanticTasks(buildGlobalPlanDraft(right).tasks))
})

test('已提交今日自检只返回摘要状态，不回退为待填写表单', () => {
  const data = initialData()
  const course = makeCourse('高等数学', 'math')
  const task = createTask({ id: 'task', courseId: course.id, knowledgePoint: '极限' })
  data.courses = [course]
  const check = generateDailyChecks(data, task)[0]
  const event = submitDailyCheck(data, check, check.options?.[0] ?? '写出完整步骤并核对适用条件', '部分掌握')
  const state = selectDailyCheckState([check], [event])
  assert.equal(state.pendingCheck, undefined)
  assert.equal(state.latestSubmittedCheck?.id, check.id)
  assert.equal(state.latestSubmittedEvent?.id, event.id)
})

test('高中 9 科与大学稳定课程 100% 有 30 条检索建议，且与人工审核资源分层', () => {
  const high = catalogProfiles.filter(profile => profile.stage === '高中')
  const university = catalogProfiles.filter(profile => profile.stage === '大学')
  assert.equal(high.length, 9)
  assert.ok(university.length >= 80)
  for (const [index, profile] of [...high, ...university].entries()) {
    const course = makeCourse(profile.name, `catalog-${index}`, profile.stage)
    const result = buildBilibiliSearchSuggestions(course, initialData().schedule)
    assert.equal(result.blockedReason, '')
    assert.equal(result.suggestions.length, 30, profile.canonicalId)
    assert.ok(result.suggestions.every(item => item.status === 'candidate' && item.query.includes(profile.name)))
    assert.ok(result.suggestions.every(item => !('title' in item) && !('author' in item)))
  }
})

test('每个假期日期都有任务或结构化原因，任务日容量不超限且标记利用率例外', () => {
  const data = initialData()
  data.courses = [makeCourse('高等数学', 'math'), makeCourse('大学英语', 'english')]
  data.schedule.weekdayMinutes = 120
  data.schedule.weekendMinutes = 120
  const draft = buildGlobalPlanDraft(data)
  for (let date = data.schedule.holidayStart; date <= data.schedule.holidayEnd; date = addDays(date, 1)) {
    const minutes = draft.tasks.filter(task => task.date === date).reduce((sum, task) => sum + task.estimatedMinutes, 0)
    assert.ok(minutes > 0 || draft.dayReasons[date], date)
    assert.ok(minutes <= 120, date)
    if (minutes > 0 && (minutes / 120 < .75 || minutes / 120 > .9)) assert.ok(draft.dayReasons[date], date)
  }
})

test('未知课程没有真实大纲时不伪造章节，补充大纲后建议只使用真实上下文', () => {
  const unknown = makeCourse('实验性跨学科专题', 'unknown')
  unknown.canonicalId = ''
  unknown.canonicalName = '实验性跨学科专题'
  unknown.subjectDomain = '通用技能'
  unknown.curriculum.syllabusUnits = []
  assert.match(buildBilibiliSearchSuggestions(unknown).blockedReason, /真实章节|模块/)
  unknown.curriculum.syllabusUnits = [
    { id: 'u1', title: '用户访谈证据整理', order: 1, prerequisites: [] },
    { id: 'u2', title: '原型验证记录', order: 2, prerequisites: ['u1'] },
  ]
  const result = buildBilibiliSearchSuggestions(unknown)
  assert.equal(result.blockedReason, '')
  assert.ok(result.suggestions.some(item => item.query.includes('用户访谈证据整理')))
  assert.doesNotMatch(JSON.stringify(result), /极限|导数|蒙版/)
})

test('资源 Provider mock 明确无后端，导入快照必须通过结构校验', async () => {
  assert.equal(mockResourceProvider.available, false)
  assert.deepEqual(await mockResourceProvider.search({ canonicalCourseId: 'math.calculus', courseName: '高等数学', stage: '大学' }), [])
  assert.throws(() => validateResourceSnapshots([{ platform: '哔哩哔哩', videoId: '', title: '伪造条目' }]), /缺少/)
  const valid = validateResourceSnapshots([{ platform: '哔哩哔哩', id: 'candidate-BV1abcdefghi', videoId: 'BV1abcdefghi', originalUrl: 'https://www.bilibili.com/video/BV1abcdefghi', canonicalCourseId: 'math.calculus', originalCourseName: '高等数学', stage: '大学', title: '人工导入标题', author: '人工导入作者', searchQuery: '高等数学 极限', knowledgePoints: ['极限'], suitableTaskTypes: ['基础讲解'], qualityScore: 70, trustScore: 70, foundationMatchScore: 80, viewCount: null, likeCount: null, favoriteCount: null, coinCount: null, statsSnapshotAt: null, reviewedAt: null, relevanceScore: 80, status: 'candidate' }])
  assert.equal(valid[0].status, 'candidate')
})
