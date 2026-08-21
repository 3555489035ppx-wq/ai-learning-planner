import assert from 'node:assert/strict'
import test from 'node:test'
import { createHighSchoolDemoData, highSchoolDemoTutorRecommendations, isHighSchoolDemo } from '../src/demoData.ts'
import { daysBetween } from '../src/dateUtils.ts'

test('高中生作品集 Demo 提供六科差异成绩、可解释诊断与连续 30 天任务', () => {
  const data = createHighSchoolDemoData()
  assert.equal(isHighSchoolDemo(data), true)
  assert.deepEqual(data.courses.map(course => course.canonicalId), ['high.chinese', 'high.math', 'high.english', 'high.politics', 'high.physics', 'high.chemistry'])
  assert.deepEqual(data.courses.map(course => course.score), [108, 82, 118, 72, 63, 78])
  assert.equal(daysBetween(data.schedule.holidayStart, data.schedule.holidayEnd) + 1, 30)
  assert.equal(data.tasks.length, 180)
  assert.equal(new Set(data.tasks.map(task => task.date)).size, 30)
  assert.ok(data.tasks.every(task => task.scheduleStatus === 'scheduled' && task.estimatedMinutes === 45))
  const firstDay = data.tasks.filter(task => task.date === data.schedule.holidayStart).sort((left, right) => left.time.localeCompare(right.time))
  assert.deepEqual(firstDay.map(task => task.slotId), ['morning-1', 'morning-2', 'morning-3', 'afternoon-1', 'afternoon-2', 'afternoon-3'])
  const courseIds = data.courses.map(course => course.id).sort()
  for (const date of new Set(data.tasks.map(task => task.date))) {
    const dayTasks = data.tasks.filter(task => task.date === date)
    assert.equal(dayTasks.length, 6)
    assert.deepEqual(dayTasks.map(task => task.courseId).sort(), courseIds)
  }
  const math = data.courses.find(course => course.canonicalId === 'high.math')!
  const english = data.courses.find(course => course.canonicalId === 'high.english')!
  const physics = data.courses.find(course => course.canonicalId === 'high.physics')!
  assert.match(data.diagnoses[math.id].priorityProblem, /函数|错题/)
  assert.match(data.diagnoses[english.id].nextAction, /阅读|写作/)
  assert.match(data.diagnoses[physics.id].priorityProblem, /受力|模型/)
  assert.equal(data.tasks.filter(task => task.courseId === math.id).length, data.tasks.filter(task => task.courseId === english.id).length)
})

test('高中生 Demo 的一对一辅导建议只指向数学和物理的明确薄弱点', () => {
  assert.deepEqual(highSchoolDemoTutorRecommendations.map(item => item.courseCanonicalId), ['high.math', 'high.physics'])
  assert.ok(highSchoolDemoTutorRecommendations.every(item => item.reason && item.suitable && item.goal))
})
