import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogProfiles, normalizeCourseName } from '../src/courseCatalog.ts'
import { getCourseIntelligence } from '../src/courseIntelligence.ts'
import { curriculumUnitsForCourse } from '../src/curriculum.ts'
import { createCourse, createTask, initialData } from '../src/data.ts'
import { addDays, localTimestamp, mondayOfWeek } from '../src/dateUtils.ts'
import { generateDailyChecks } from '../src/dailyCheck.ts'
import { migrateCourseEducationStage, migrateV3ToV4, validateV4Data } from '../src/migration.ts'
import { buildDiagnosis, buildHolidayPlan, courseFieldErrors } from '../src/providers.ts'
import { scheduleTasks, validateScheduleChange } from '../src/scheduler.ts'
import type { AppData, Course } from '../src/types.ts'

const universityCourse = (name: string, syllabus = ['基础模块', '应用模块']): Course => createCourse({
  name,
  stage: '大学',
  courseType: '专业核心课',
  assessmentMode: 'score',
  score: 58,
  maxScore: 100,
  passScore: 60,
  examType: '期末考试',
  mastery: '基础薄弱',
  mainDifficulty: '不能独立完成典型任务',
  selfEvidence: '最近一次练习需要对照例题才能完成',
  goalType: '补弱',
  targetScore: 70,
  targetDate: addDays(initialData().schedule.holidayStart, 41),
  desiredResult: '完成可比较的阶段复测',
  curriculum: {
    ...createCourse().curriculum,
    stage: '大学',
    school: '示例大学',
    major: '示例专业',
    semester: '上学期',
    textbookVersion: '用户课程大纲',
    syllabusTitle: '用户课程大纲',
    source: 'user-input',
    syllabusUnits: syllabus.map((title, index) => ({ id: `unit-${index + 1}`, title, order: index + 1, prerequisites: index ? [`unit-${index}`] : [] })),
  },
})

test('高中课程读取省份、教材和真实目录上下文', () => {
  const course = createCourse({
    name: '高中数学', stage: '高中', courseType: '学科课程', assessmentMode: 'score', score: 72, maxScore: 100,
    passScore: 60, examType: '期末考试', mastery: '一般', mainDifficulty: '函数综合题不稳定', selfEvidence: '最近三次练习错在定义域',
    curriculum: { ...createCourse().curriculum, stage: '高中', province: '广东', grade: '高二', textbookVersion: '人教版', source: 'preset' },
  })
  assert.deepEqual(courseFieldErrors(course), {})
  const units = curriculumUnitsForCourse(course)
  assert.ok(units.some(unit => /函数/.test(unit.title)))
  assert.equal(normalizeCourseName(course.name).canonicalId, 'high.math')
})

test('高中 9 科和大学 80–100 门稳定课程均具备完整策略字段', () => {
  const high = catalogProfiles.filter(item => item.stage === '高中')
  const university = catalogProfiles.filter(item => item.stage === '大学')
  assert.equal(high.length, 9)
  assert.ok(university.length >= 80 && university.length <= 100, `大学课程数为 ${university.length}`)
  assert.equal(new Set(catalogProfiles.map(item => item.canonicalId)).size, catalogProfiles.length)
  catalogProfiles.forEach(item => {
    assert.ok(item.canonicalId && item.name && item.stage && item.domain && item.category && item.disciplineGroup)
    assert.ok(Array.isArray(item.aliases) && Array.isArray(item.prerequisites) && Array.isArray(item.units))
    assert.ok(item.assessments.length && item.diagnosticTemplates.length && item.outcomes.length && item.resourceKeywords.length)
    assert.ok(item.planStrategy && item.catalogNote)
  })
})

test('关键别名稳定归一化，AI 保持消歧', () => {
  const expected: Record<string, string> = { 数学: 'high.math', 高数: 'math.calculus', PS: 'design.photoshop', 犀牛: 'cad.rhino', 数据结构: 'cs.data-structures' }
  Object.entries(expected).forEach(([name, id]) => assert.equal(normalizeCourseName(name).canonicalId, id))
  assert.ok(normalizeCourseName('AI').ambiguityOptions?.length)
})

test('学习阶段描述知识进度，任务可跨自然周延续', () => {
  const data = initialData()
  const course = universityCourse('高等数学', ['函数与极限', '导数与微分', '积分基础'])
  data.courses = [course]
  const intelligence = getCourseIntelligence(course, data.schedule)
  assert.ok(intelligence.learningStages.every(stage => stage.title && stage.focus))
  const plan = buildHolidayPlan(data, buildDiagnosis(data, course.id))
  assert.ok(plan.length > 0)
  const task = plan.find(item => item.date)!
  const nextWeek = addDays(mondayOfWeek(task.date), 7)
  const moved = validateScheduleChange(task, { date: nextWeek, slotId: task.slotId }, plan, data.schedule)
  assert.equal(moved.valid, true)
})

test('编程任务包含实现、调试或测试证据，设计软件不串入数学内容', () => {
  for (const name of ['Python', '数据结构']) {
    const data = initialData(); const course = universityCourse(name, ['基础实现', '调试与边界测试']); data.courses = [course]
    assert.match(JSON.stringify({ diagnosis: buildDiagnosis(data, course.id), tasks: buildHolidayPlan(data, buildDiagnosis(data, course.id)) }), /代码|实现|调试|测试|边界/)
  }
  for (const name of ['Photoshop', 'Rhino']) {
    const data = initialData(); const course = universityCourse(name, ['工具基础', '作品检查']); course.assessmentMode = 'project'; data.courses = [course]
    assert.doesNotMatch(JSON.stringify(buildDiagnosis(data, course.id)), /函数极限|导数|积分|数学推导/)
  }
})

test('未知课程没有大纲时生成低置信度基础计划，有真实大纲时只使用用户章节', () => {
  const data = initialData()
  const missing = universityCourse('星际航线整理术', [])
  missing.curriculum.textbookVersion = ''
  data.courses = [missing]
  assert.equal(courseFieldErrors(missing).syllabus, undefined)
  const baseline = buildDiagnosis(data, missing.id)
  assert.equal(baseline.confidence, '低')
  assert.ok(buildHolidayPlan(data, baseline).length > 0)
  assert.match(JSON.stringify(baseline), /星际航线整理术/)
  assert.doesNotMatch(JSON.stringify(baseline), /函数极限|导数积分|蒙版选区/)
  const supplied = universityCourse('星际航线整理术', ['航线资料归档', '航线一致性检查'])
  data.courses = [supplied]
  const intelligence = getCourseIntelligence(supplied, data.schedule)
  assert.deepEqual(intelligence.learningStages.map(stage => stage.title), ['航线资料归档', '航线一致性检查'])
})

test('排程遵守旅行、晚间关闭和每日容量', () => {
  const data = initialData()
  const course = universityCourse('高等数学')
  data.courses = [course]
  const travelDate = addDays(data.schedule.holidayStart, 1)
  data.schedule.weekdayMinutes = 45
  data.schedule.weekendMinutes = 45
  data.schedule.timeSlots = data.schedule.timeSlots.map(slot => ({ ...slot, enabled: slot.period !== 'evening' }))
  data.schedule.constraints = [{ id: 'travel', type: 'travel', startAt: `${travelDate}T00:00:00+08:00`, endAt: `${travelDate}T23:59:59+08:00`, capacityMinutes: 0, note: '旅行' }]
  const candidate = createTask({ courseId: course.id, planId: 'test-plan', date: data.schedule.holidayStart, stageLabel: '第 1 周', stageStartDate: data.schedule.holidayStart, stageEndDate: addDays(data.schedule.holidayStart, 6), estimatedMinutes: 45 })
  const scheduled = scheduleTasks([candidate, { ...candidate, id: crypto.randomUUID(), order: 2 }], [course], data.schedule)
  assert.ok(scheduled.filter(task => task.scheduleStatus === 'scheduled').every(task => task.date !== travelDate && !task.slotId.startsWith('evening')))
  const byDate = new Map<string, number>()
  scheduled.filter(task => task.date).forEach(task => byDate.set(task.date, (byDate.get(task.date) ?? 0) + task.estimatedMinutes))
  assert.ok([...byDate.values()].every(minutes => minutes <= 45))
})

test('今日自检使用 30 天真实指纹去重，题库耗尽时明确报错', () => {
  const data = initialData()
  const course = universityCourse('高等数学')
  data.courses = [course]
  const task = createTask({ courseId: course.id, title: '极限基础', knowledgePoint: '极限', unitId: 'limit', difficulty: '基础' })
  const now = localTimestamp()
  const fingerprints = new Set<string>()
  for (;;) {
    try {
      const next = generateDailyChecks(data, task, 3, now)
      next.forEach(check => { assert.equal(fingerprints.has(check.fingerprint), false); fingerprints.add(check.fingerprint) })
      data.dailyChecks.push(...next)
    } catch (error) {
      assert.match(error instanceof Error ? error.message : String(error), /题库不足.*30 天/)
      break
    }
  }
  assert.ok(fingerprints.size >= 4)
})

test('旧教育阶段迁移为待确认且不改写历史 ID，软件课程可安全归入大学', () => {
  assert.deepEqual(migrateCourseEducationStage({ stage: '初中', courseType: '文化课', name: '数学' }), { stage: '', stageStatus: 'needs-reconfirmation', legacyStage: '初中', legacyCourseType: '文化课' })
  assert.equal(migrateCourseEducationStage({ stage: '职业技能', courseType: '软件技能', name: 'Photoshop' }).stage, '大学')
  const base = initialData()
  const course = { ...universityCourse('高等数学'), id: 'course-history', stage: '其他', courseType: '其他' }
  const migrated = migrateV3ToV4({ ...base, version: 3, courses: [course], taskEvents: [{ id: 'event-history' }], changeSets: [{ id: 'change-history' }] } as never)
  assert.equal(migrated.courses[0].id, 'course-history')
  assert.equal(migrated.courses[0].stageStatus, 'needs-reconfirmation')
  assert.equal(migrated.taskEvents[0].id, 'event-history')
  assert.equal(migrated.changeSets[0].id, 'change-history')
})

test('导入校验深查重复 ID、引用、日期和链接，失败时不修改源对象', () => {
  const valid = initialData()
  const course = universityCourse('高等数学')
  valid.courses = [course]
  const accepted = validateV4Data(valid)
  assert.notEqual(accepted, valid)
  const duplicate = structuredClone(valid)
  duplicate.courses.push({ ...course })
  assert.throws(() => validateV4Data(duplicate), /重复 ID/)
  const badUrl = structuredClone(valid)
  badUrl.resources[0].url = 'javascript:alert(1)'
  assert.throws(() => validateV4Data(badUrl), /http 或 https/)
  assert.equal(valid.resources[0].url.startsWith('https://'), true)
})
