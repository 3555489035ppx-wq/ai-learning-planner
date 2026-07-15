import test from 'node:test'
import assert from 'node:assert/strict'
import { initialData, todayISO } from '../src/data.ts'
import { applyNextWeekPlan, buildDiagnosis, buildSixWeekPlan, validateCourse, validateDiagnosis } from '../src/providers.ts'

test('9/100 的大学高数先要求基础诊断，不直接承诺固定结果', () => {
  const data = initialData()
  data.courses = [{
    ...data.courses[0],
    name: '高等数学',
    stage: '大学',
    score: 9,
    maxScore: 100,
    passScore: 60,
    examType: '期末考试',
    targetScore: 60,
    targetDate: data.schedule.holidayEnd,
    mastery: '几乎不会',
  }]
  data.schedule.weekdayMinutes = 120
  const diagnosis = validateDiagnosis(buildDiagnosis(data))
  assert.equal(diagnosis.requiresBaselineQuiz, true)
  assert.equal(diagnosis.baselineQuizMinutes, 15)
  assert.ok(diagnosis.weakKnowledgePoints.includes('先修代数'))
  assert.ok(diagnosis.weakKnowledgePoints.includes('函数概念与图像'))
  assert.equal(diagnosis.sixWeekStages.length, 6)
  assert.match(diagnosis.disclaimer, /不构成成绩保证/)
})

test('课程缺少阶段、满分或考试类型时阻止继续', () => {
  const data = initialData()
  const course = { ...data.courses[0], stage: '' as const, maxScore: '' as const, examType: '' as const }
  const errors = validateCourse(course)
  assert.ok(errors.includes('教育阶段'))
  assert.ok(errors.includes('试卷满分'))
  assert.ok(errors.includes('考试类型'))
})

test('生成的六周任务包含商用计划所需执行字段', () => {
  const data = initialData()
  const diagnosis = buildDiagnosis(data)
  const tasks = buildSixWeekPlan(data, diagnosis)
  assert.equal(tasks.length, 12)
  for (const task of tasks) {
    assert.ok(task.knowledgePoint)
    assert.ok(task.materialLabel)
    assert.ok(task.watchMinutes >= 0)
    assert.ok(task.practiceCount >= 0)
    assert.ok(task.quizTask)
    assert.ok(task.completionCriteria)
    assert.ok(task.estimatedMinutes > 0)
  }
})

test('应用下周计划会修改未完成任务并保留已完成任务', () => {
  const data = initialData()
  const completed = { ...data.tasks[0], status: '已完成' as const, date: todayISO() }
  const pending = { ...data.tasks[1], status: '待完成' as const, date: todayISO() }
  const result = applyNextWeekPlan([completed, pending])
  assert.equal(result[0].date, completed.date)
  assert.notEqual(result[1].date, pending.date)
  assert.match(result[1].changeNote, /下周/)
})
