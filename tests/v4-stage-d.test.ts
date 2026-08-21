import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCourse, createTask, initialData } from '../src/data.ts'
import { addDays } from '../src/dateUtils.ts'
import { comparableAssessmentChange, deriveProgressTrend, recordAssessment } from '../src/providers.ts'

const weekStart = '2026-01-12'

test('进展趋势严格区分无数据、一个时间点和多个真实时间点', () => {
  const data = initialData()
  const course = createCourse({ id: 'course-math', name: '高等数学', stage: '大学' })
  data.courses = [course]
  assert.equal(deriveProgressTrend(data, course.id, weekStart).state, 'empty')

  data.tasks = [createTask({ id: 'current-task', courseId: course.id, date: weekStart, originalPlannedDate: weekStart, status: '已完成' })]
  const current = deriveProgressTrend(data, course.id, weekStart)
  assert.equal(current.state, 'current')
  assert.equal(current.points.length, 1)

  data.tasks.push(createTask({ id: 'previous-task', courseId: course.id, date: addDays(weekStart, -7), originalPlannedDate: addDays(weekStart, -7), status: '已完成' }))
  const trend = deriveProgressTrend(data, course.id, weekStart)
  assert.equal(trend.state, 'trend')
  assert.deepEqual(trend.points.map(point => point.weekStart), [addDays(weekStart, -7), weekStart])
})

test('学习效果变化只比较同课程、同知识点、同难度和同量表', () => {
  const data = initialData()
  const course = createCourse({ id: 'course-design', name: 'Photoshop', stage: '大学', assessmentMode: 'project' })
  data.courses = [course]
  data.assessmentEvents = [
    recordAssessment(course.id, { type: '作品检查', value: 12, maxValue: 20, knowledgePoint: '图层蒙版', difficulty: '基础', note: '', occurredAt: '2026-01-05T10:00:00.000Z' }),
    recordAssessment(course.id, { type: '作品检查', value: 15, maxValue: 20, knowledgePoint: '图层蒙版', difficulty: '基础', note: '', occurredAt: '2026-01-12T10:00:00.000Z' }),
    recordAssessment(course.id, { type: '作品检查', value: 95, maxValue: 100, knowledgePoint: '色彩校正', difficulty: '进阶', note: '', occurredAt: '2026-01-13T10:00:00.000Z' }),
  ]
  const comparison = comparableAssessmentChange(data, course.id, weekStart)
  assert.ok(comparison)
  assert.equal(comparison.knowledgePoint, '图层蒙版')
  assert.equal(comparison.maxValue, 20)
  assert.equal(comparison.beforeRate, 60)
  assert.equal(comparison.afterRate, 75)
  assert.equal(comparison.change, 15)
})

test('进展与周复盘文案、差异字段和紧凑布局满足阶段 D 门槛', () => {
  const progressSource = readFileSync(new URL('../src/pages/ProgressV4.tsx', import.meta.url), 'utf8')
  const reviewSource = readFileSync(new URL('../src/pages/WeeklyReview.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/v4.css', import.meta.url), 'utf8')
  assert.doesNotMatch(progressSource, /成绩提升/)
  assert.match(progressSource, /data-trend-state/)
  assert.match(progressSource, /不足以判断/)
  assert.match(progressSource, /成果量表得分/)
  for (const label of ['任务', '日期', '节次', '调整原因', '资源影响']) assert.match(reviewSource, new RegExp(label))
  assert.match(reviewSource, /已完成任务不会移动或删除/)
  assert.match(reviewSource, /ChangeSet/)
  assert.doesNotMatch(css, /\.settings-panel\s*\{\s*min-height:\s*600px/)
  assert.match(css, /\.weekly-review-page > \.empty-state \{ min-height: 0/)
})
