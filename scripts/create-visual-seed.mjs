import { addDays, createCourse, initialData, todayISO } from '../src/data.ts'
import { buildDiagnosis, buildHolidayPlan, recordQuizEvent, recordTaskEvent } from '../src/providers.ts'

const data = initialData()
const today = todayISO()
const course = createCourse({
  name: '高等数学',
  canonicalId: 'math.calculus',
  canonicalName: '高等数学',
  subjectDomain: '数学与统计',
  ambiguityResolved: true,
  stage: '大学',
  courseType: '必修课',
  assessmentMode: 'score',
  score: 58,
  maxScore: 100,
  passScore: 60,
  examType: '期末考试',
  mastery: '基础薄弱',
  mainDifficulty: '极限与导数题无法独立完成',
  selfEvidence: '期末卷导数题没有写出关键步骤',
  goalType: '补弱',
  targetScore: 75,
  targetDate: addDays(today, 42),
  priority: true,
  desiredResult: '能独立完成极限与导数基础题',
  curriculum: {
    ...createCourse().curriculum,
    stage: '大学',
    school: '示例大学',
    major: '产品设计',
    syllabusTitle: '高等数学（上）',
    syllabusUnits: [
      { id: 'u1', title: '函数与极限', order: 1, prerequisites: [] },
      { id: 'u2', title: '导数与微分', order: 2, prerequisites: ['u1'] },
    ],
    source: 'user-input',
  },
})

data.onboardingCompleted = true
data.settings.displayName = '林同学'
data.courses = [course]
data.schedule.holidayStart = today
data.schedule.holidayEnd = addDays(today, 42)

const diagnosis = buildDiagnosis(data, course.id)
diagnosis.status = 'completed'
diagnosis.completedAt = new Date().toISOString()
data.diagnoses[course.id] = diagnosis
data.diagnosisHistory = [diagnosis]

const tasks = buildHolidayPlan(data, diagnosis)
if (tasks[0]) {
  tasks[0].date = today
  tasks[0].originalPlannedDate = today
  tasks[0].status = '进行中'
}
if (tasks[1]) {
  tasks[1].date = today
  tasks[1].originalPlannedDate = today
  tasks[1].status = '待完成'
}
if (tasks[2]) {
  tasks[2].date = addDays(today, -1)
  tasks[2].originalPlannedDate = addDays(today, -1)
  tasks[2].status = '已完成'
  data.taskEvents.push(recordTaskEvent(tasks[2], 'completed', '完成基础练习并记录错因', 36))
  data.quizEvents.push(recordQuizEvent(course.id, 'visual-check', tasks[2].knowledgePoint, 1, tasks[2].id, { maxScore: 2, evidenceType: 'objective_quiz' }))
}
data.tasks = tasks
data.planChanges = ['根据当前诊断，先处理极限与导数的前置断点。', '计划保留空节，并遵守单次专注时长。']

process.stdout.write(JSON.stringify(data))
