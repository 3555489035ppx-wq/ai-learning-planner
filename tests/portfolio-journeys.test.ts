import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { addDays, mondayOfWeek } from '../src/dateUtils.ts'
import { returnMissedTasksToPool, scheduleBacklogForWeek } from '../src/domain/recovery.ts'
import type { AppData } from '../src/types.ts'

const node = process.execPath
const seed = (scenario: string) => JSON.parse(execFileSync(node, ['--experimental-strip-types', 'scripts/create-portfolio-seed.mjs', scenario], { encoding: 'utf8' })) as AppData

test('作品集高中数学场景：9/100 保持低置信度，并具备 backlog 与恢复方案', () => {
  const data = seed('high-school-recovery')
  const course = data.courses[0]
  const diagnosis = data.diagnoses[course.id]
  assert.equal(course.name, '高中数学')
  assert.equal(course.score, 9)
  assert.equal(course.maxScore, 100)
  assert.equal(diagnosis.confidence, '低')
  assert.match(diagnosis.nextAction, /15 分钟基础诊断/)
  assert.ok(data.taskPool.some(item => ['ready', 'deferred'].includes(item.status)))
  assert.ok(data.recoveryProposals.length > 0)
})

test('作品集高中六科场景：课程名称和分数有区分，不把所有课程判成同一状态', () => {
  const data = seed('high-school-six')
  assert.deepEqual(data.courses.map(course => course.name), ['高中数学', '高中英语', '高中语文', '高中地理', '高中政治', '高中历史'])
  assert.deepEqual(data.courses.map(course => course.score), [58, 76, 82, 64, 71, 49])
  assert.ok(new Set(data.courses.map(course => course.score)).size > 4)
  assert.ok(data.courses.some(course => course.score < 60))
  assert.ok(data.courses.some(course => course.score >= 80))
})

test('作品集高中数学场景：未完成任务回到任务池后保持同一 ID，并可进入下一自然周', () => {
  const data = seed('high-school-recovery')
  const overdue = data.tasks.find(task => task.date && task.date < new Date().toISOString().slice(0, 10) && task.status === '待完成')
  assert.ok(overdue)
  const returned = returnMissedTasksToPool(data, new Date().toISOString().slice(0, 10))
  assert.equal(returned.tasks.find(task => task.id === overdue?.id)?.date, '')
  assert.ok(returned.taskPool.some(item => item.id === overdue?.id && ['ready', 'deferred'].includes(item.status)))
  const next = scheduleBacklogForWeek(returned, addDays(mondayOfWeek(), 7))
  assert.ok(next.tasks.some(task => task.id === overdue?.id))
})

test('作品集产品设计场景：三门软件课程内容与资源不串入数学或编程', () => {
  const data = seed('product-design-isolation')
  assert.deepEqual(new Set(data.courses.map(course => course.name)), new Set(['Photoshop', 'Illustrator', 'Rhino']))
  for (const task of data.tasks) {
    const text = `${task.title} ${task.action} ${task.knowledgePoint}`
    assert.doesNotMatch(text, /函数|极限|导数|Python|数据结构/)
    assert.ok(data.courses.some(course => course.id === task.courseId))
  }
})

test('作品集计算机场景：Python、数据结构和高等数学按 courseId 保持上下文', () => {
  const data = seed('computer-science-isolation')
  const names = new Map(data.courses.map(course => [course.id, course.name]))
  assert.deepEqual(new Set(names.values()), new Set(['Python', '数据结构', '高等数学']))
  for (const task of data.tasks) {
    const name = names.get(task.courseId) ?? ''
    const text = `${task.title} ${task.action} ${task.knowledgePoint}`
    if (name === 'Python') assert.doesNotMatch(text, /Rhino|Photoshop|蒙版|极限|导数/)
    if (name === '数据结构') assert.doesNotMatch(text, /Rhino|Photoshop|蒙版|导数/)
    if (name === '高等数学') assert.doesNotMatch(text, /Rhino|Photoshop|蒙版|Python|代码调试/)
  }
})
