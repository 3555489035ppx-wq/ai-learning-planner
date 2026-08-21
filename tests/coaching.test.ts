import test from 'node:test'
import assert from 'node:assert/strict'
import { createCourse, initialData } from '../src/data.ts'
import { buildCoachingAgenda, createCoachingRequest, demoMentors, mentorsForCourse } from '../src/coaching.ts'
import { buildCandidateTasks, buildDiagnosis } from '../src/providers.ts'
import { addDays, localDateISO } from '../src/dateUtils.ts'

test('学习计划会根据学科和学习目标生成多种真实学习动作', () => {
  const data = initialData()
  const course = createCourse({ id: 'design-course', name: '产品设计方法', canonicalId: 'product.design-methods', canonicalName: '产品设计方法', subjectDomain: '产品设计理论与项目', stage: '大学', courseType: '项目/作品课', assessmentMode: 'project', mastery: '一般', mainDifficulty: '调研结论无法转化为设计机会点', selfEvidence: '最近一次作业只有访谈记录', goalType: '完成作品', targetDate: addDays(localDateISO(), 35), desiredResult: '完成一套有研究证据的产品设计方案', curriculum: { ...createCourse().curriculum, stage: '大学', syllabusTitle: '产品设计程序与方法', syllabusUnits: [{ id: 'design-u1', title: '用户研究', order: 1, prerequisites: [] }, { id: 'design-u2', title: '概念生成', order: 2, prerequisites: ['design-u1'] }] } })
  data.courses = [course]
  const diagnosis = buildDiagnosis(data, course.id)
  const tasks = buildCandidateTasks(data, diagnosis)
  assert.ok(tasks.length >= 2)
  assert.ok(new Set(tasks.map(task => task.taskType)).size >= 2)
  assert.ok(tasks.some(task => task.title.includes('案例拆解')))
  assert.ok(tasks.some(task => task.title.includes('最小交付') || task.title.includes('迁移')))
  assert.ok(tasks.every(task => task.completionCriteriaItems.length >= 2 && task.rationale.limitations.length >= 1))
})

test('1 对 1 辅导申请包含会前议程和可用导师时段', () => {
  const data = initialData()
  const course = createCourse({ id: 'math-course', name: '高等数学', subjectDomain: '数学与统计', stage: '大学', courseType: '公共基础课' })
  data.courses = [course]
  const mentor = demoMentors()[0]
  const slot = mentor.availability[0]
  const request = createCoachingRequest(data, { courseId: course.id, knowledgePoint: '导数与微分', problem: '第二步不知道检查什么', goal: '能独立完成三道同类题', urgency: '本周需要', preferredDate: slot.date, preferredSlotId: slot.id, mentorId: mentor.id, source: 'user' })
  assert.equal(request.status, 'requested')
  assert.equal(request.agenda.length, 5)
  assert.equal(request.mentorNote, '')
  assert.ok(buildCoachingAgenda(course.name, request.knowledgePoint, request.problem, request.goal).some(item => item.includes('导数与微分')))
})

test('导师目录只展示与当前课程匹配的导师', () => {
  const math = createCourse({ name: '高中数学', canonicalName: '高中数学', subjectDomain: '数学与统计', stage: '高中' })
  const design = createCourse({ name: 'Photoshop', canonicalName: 'Adobe Photoshop', subjectDomain: '平面与图像设计', stage: '大学' })
  assert.deepEqual(mentorsForCourse(math).map(mentor => mentor.id), ['mentor-chen-math'])
  assert.deepEqual(mentorsForCourse(design).map(mentor => mentor.id), ['mentor-lin-design'])
})
