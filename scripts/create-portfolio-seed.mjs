import { addDays, createCourse, initialData, todayISO } from '../src/data.ts'
import { createCoachingRequest, demoMentors } from '../src/coaching.ts'
import { buildDiagnosis, buildHolidayPlan, recordQuizEvent, recordTaskEvent } from '../src/providers.ts'
import { buildRecoveryProposal } from '../src/domain/recovery.ts'
import { reconcileScheduleDomain } from '../src/scheduleDomain.ts'

const scenario = process.argv[2] || 'high-school-recovery'
const today = todayISO()
const slotFor = (data, index) => data.schedule.timeSlots.filter(slot => slot.enabled)[index % data.schedule.timeSlots.filter(slot => slot.enabled).length]

const baseData = () => {
  const data = initialData()
  data.onboardingCompleted = true
  data.settings.displayName = '作品集演示'
  data.schedule.holidayStart = today
  data.schedule.holidayEnd = addDays(today, 41)
  data.schedule.weekdayMinutes = 120
  data.schedule.weekendMinutes = 120
  data.schedule.maxAutoTasksPerDay = 2
  data.schedule.bufferDaysPerWeek = 1
  data.schedule.strictDailyCapacity = false
  data.schedule.strictHolidayRange = false
  return data
}

const course = (input) => createCourse({
  ambiguityResolved: true,
  assessmentMode: 'score',
  score: 55,
  maxScore: 100,
  passScore: 60,
  examType: '期末考试',
  mastery: '基础薄弱',
  goalType: '补弱',
  targetScore: 70,
  targetDate: addDays(today, 42),
  desiredResult: '完成基础任务并记录可验证结果。',
  priority: false,
  ...input,
})

const assignVisibleTasks = (data, tasks) => tasks.map((task, index) => {
  const slot = slotFor(data, index)
  const date = addDays(today, index % 4)
  return { ...task, date, originalPlannedDate: date, time: slot.start, slotId: slot.id, scheduleStatus: 'scheduled', status: index === 0 ? '进行中' : '待完成' }
})

const buildCourseTasks = (data, item) => {
  const diagnosis = buildDiagnosis(data, item.id)
  data.diagnoses[item.id] = diagnosis
  data.diagnosisHistory.push(diagnosis)
  return buildHolidayPlan(data, diagnosis)
}

const highSchoolRecovery = () => {
  const data = baseData()
  const math = course({
    id: 'portfolio-high-math', name: '高中数学', canonicalId: 'high.math', canonicalName: '高中数学', subjectDomain: '数学与统计',
    stage: '高中', courseType: '学科课程', score: 9, maxScore: 100, passScore: 60, targetScore: 60, priority: true,
    mastery: '基础薄弱', mainDifficulty: '基础函数题无法独立完成', selfEvidence: '期末答题时无法写出函数与不等式的关键步骤。',
    desiredResult: '先建立基础函数与不等式的可执行学习节奏。',
    curriculum: { ...createCourse().curriculum, stage: '高中', province: '全国通用', textbookVersion: '人教版', syllabusTitle: '高中数学必修', syllabusUnits: [
      { id: 'high-u1', title: '函数与基本初等函数', order: 1, prerequisites: [] },
      { id: 'high-u2', title: '一元二次函数、方程和不等式', order: 2, prerequisites: ['high-u1'] },
    ], source: 'user-input' },
  })
  data.courses = [math]
  const diagnosis = buildDiagnosis(data, math.id)
  data.diagnoses[math.id] = diagnosis
  data.diagnosisHistory = [diagnosis]
  const tasks = buildHolidayPlan(data, diagnosis)
  const firstSlot = slotFor(data, 0)
  const secondSlot = slotFor(data, 1)
  const yesterday = addDays(today, -1)
  const earlier = addDays(today, -3)
  if (tasks[0]) Object.assign(tasks[0], { date: yesterday, originalPlannedDate: yesterday, time: firstSlot.start, slotId: firstSlot.id, scheduleStatus: 'scheduled', status: '已完成', action: '完成 6 道函数基础题并记录 1 个错因', completionCriteria: '完成 6 道基础题，并记录 1 个错误原因。' })
  if (tasks[1]) Object.assign(tasks[1], { date: today, originalPlannedDate: today, time: firstSlot.start, slotId: firstSlot.id, scheduleStatus: 'scheduled', status: '待完成', action: '完成基础练习并标记不会的步骤' })
  if (tasks[2]) Object.assign(tasks[2], { date: today, originalPlannedDate: today, time: secondSlot.start, slotId: secondSlot.id, scheduleStatus: 'scheduled', status: '待完成' })
  if (tasks[3]) Object.assign(tasks[3], { date: earlier, originalPlannedDate: earlier, time: firstSlot.start, slotId: firstSlot.id, scheduleStatus: 'scheduled', status: '待完成', changeNote: '旅行安排导致未完成，等待恢复方案。' })
  if (tasks[4]) Object.assign(tasks[4], { date: '', originalPlannedDate: '', time: '', slotId: '', scheduleStatus: 'needs-confirmation', status: '待确认', scheduleIssue: '本周暂未安排，系统将在下一周继续安排。' })
  data.tasks = tasks
  if (tasks[0]) {
    data.taskEvents.push(recordTaskEvent(tasks[0], 'completed', '完成函数基础练习并记录错因', 42))
    data.quizEvents.push(recordQuizEvent(math.id, 'portfolio-check', tasks[0].knowledgePoint, 1, tasks[0].id, { maxScore: 2, evidenceType: 'objective_quiz' }))
  }
  if (tasks[3]) {
    data.taskEvents.push(recordTaskEvent(tasks[3], 'skipped', '旅行当天没有可用学习时间'))
    data.taskEvents.push({ ...recordTaskEvent(tasks[3], 'skipped', '连续旅行导致未完成'), id: `${tasks[3].id}-repeat-skip`, occurredAt: new Date().toISOString() })
  }
  const normalized = reconcileScheduleDomain(data)
  const proposal = buildRecoveryProposal(normalized)
  const mentor = demoMentors()[0]
  const mentorSlot = mentor.availability[0]
  const coaching = createCoachingRequest(normalized, { courseId: math.id, taskId: tasks[1]?.id, knowledgePoint: tasks[1]?.knowledgePoint || '函数与不等式', problem: '能跟随示例，但独立开始时不知道先检查定义域还是整理条件。', goal: '能独立完成 3 道基础题，并说出每道题的第一步检查。', urgency: '本周需要', preferredDate: mentorSlot.date, preferredSlotId: mentorSlot.id, mentorId: mentor.id, source: 'diagnosis' })
  coaching.status = 'confirmed'
  return { ...normalized, recoveryProposals: proposal ? [proposal] : [], activeRecoveryProposalId: proposal?.id ?? '', coachingRequests: [coaching], coachingMessages: [{ id: 'portfolio-coaching-message', requestId: coaching.id, role: 'mentor', text: '已确认本次目标和时段。请带一道你无法独立开始的题进入会话。', createdAt: new Date().toISOString() }], planChanges: ['成绩只用于确定起点；建议先完成约 15 分钟基础诊断。', '本周保留空 Slot，未排入的任务将在下一周继续安排。'] }
}

const highSchoolSix = () => {
  const data = baseData()
  const courses = [
    course({ id: 'portfolio-high-math', name: '高中数学', canonicalId: 'high.math', canonicalName: '高中数学', subjectDomain: '数学与统计', stage: '高中', courseType: '学科课程', score: 58, targetScore: 78, priority: true, mainDifficulty: '函数与不等式的基础步骤不稳定' }),
    course({ id: 'portfolio-high-english', name: '高中英语', canonicalId: 'high.english', canonicalName: '高中英语', subjectDomain: '大学英语与语言考试', stage: '高中', courseType: '学科课程', score: 76, targetScore: 84, mainDifficulty: '阅读定位和写作结构需要稳定练习' }),
    course({ id: 'portfolio-high-chinese', name: '高中语文', canonicalId: 'high.chinese', canonicalName: '高中语文', subjectDomain: '新闻传播与汉语言文学', stage: '高中', courseType: '学科课程', score: 82, targetScore: 88, mainDifficulty: '现代文阅读的证据组织和作文表达' }),
    course({ id: 'portfolio-high-geography', name: '高中地理', canonicalId: 'high.geography', canonicalName: '高中地理', subjectDomain: '通用技能', stage: '高中', courseType: '学科课程', score: 64, targetScore: 78, mainDifficulty: '图表信息提取和区域过程分析' }),
    course({ id: 'portfolio-high-politics', name: '高中政治', canonicalId: 'high.politics', canonicalName: '高中思想政治', subjectDomain: '经济金融会计与管理', stage: '高中', courseType: '学科课程', score: 71, targetScore: 82, mainDifficulty: '材料分析中的概念调用和规范表达' }),
    course({ id: 'portfolio-high-history', name: '高中历史', canonicalId: 'high.history', canonicalName: '高中历史', subjectDomain: '新闻传播与汉语言文学', stage: '高中', courseType: '学科课程', score: 49, targetScore: 70, priority: true, mainDifficulty: '史料分析缺少时空线索和因果连接' }),
  ]
  data.courses = courses
  data.tasks = assignVisibleTasks(data, courses.flatMap(item => buildCourseTasks(data, item))).slice(0, 18)
  return reconcileScheduleDomain(data)
}

const productDesignIsolation = () => {
  const data = baseData()
  const courses = [
    course({ id: 'portfolio-photoshop', name: 'Photoshop', canonicalId: 'design.photoshop', canonicalName: 'Adobe Photoshop', subjectDomain: '平面与图像设计', stage: '大学', courseType: '软件工具课', assessmentMode: 'project', mastery: '入门', mainDifficulty: '蒙版边缘处理不稳定', selfEvidence: '完成过一张练习海报，但图层命名混乱。', goalType: '技能提升', targetScore: '', desiredResult: '完成一张具有清晰图层结构的海报练习。', priority: true }),
    course({ id: 'portfolio-illustrator', name: 'Illustrator', canonicalId: 'design.illustrator', canonicalName: 'Adobe Illustrator', subjectDomain: '矢量设计', stage: '大学', courseType: '软件工具课', assessmentMode: 'project', mastery: '一般', mainDifficulty: '钢笔路径无法稳定闭合', selfEvidence: '可以使用形状工具，但缺少路径练习。', goalType: '技能提升', targetScore: '', desiredResult: '完成一组可编辑的矢量图标。' }),
    course({ id: 'portfolio-rhino', name: 'Rhino', canonicalId: 'cad.rhino', canonicalName: 'Rhino', subjectDomain: '三维建模与CAD', stage: '大学', courseType: '软件工具课', assessmentMode: 'project', mastery: '基础薄弱', mainDifficulty: '曲线与曲面关系不清楚', selfEvidence: '可以打开软件，但没有独立完成模型。', goalType: '技能提升', targetScore: '', desiredResult: '完成一个可检查并导出的基础模型。' }),
  ]
  data.courses = courses
  data.tasks = assignVisibleTasks(data, courses.flatMap(item => buildCourseTasks(data, item))).slice(0, 9)
  return reconcileScheduleDomain(data)
}

const computerScienceIsolation = () => {
  const data = baseData()
  const courses = [
    course({ id: 'portfolio-python', name: 'Python', canonicalId: 'programming.python', canonicalName: 'Python 程序设计', subjectDomain: '编程语言与Web开发', stage: '大学', courseType: '专业基础课', score: 62, targetScore: 75, mainDifficulty: '函数调用和调试步骤不稳定', desiredResult: '独立完成一个含函数与测试的练习。', priority: true }),
    course({ id: 'portfolio-data-structures', name: '数据结构', canonicalId: 'cs.data-structures', canonicalName: '数据结构', subjectDomain: '计算机系统、网络与数据库', stage: '大学', courseType: '专业基础课', score: 48, targetScore: 65, mainDifficulty: '线性表与时间复杂度题无法独立分析', desiredResult: '完成线性表和复杂度基础练习。' }),
    course({ id: 'portfolio-calculus', name: '高等数学', canonicalId: 'math.calculus', canonicalName: '高等数学', subjectDomain: '数学与统计', stage: '大学', courseType: '公共基础课', score: 52, targetScore: 60, mainDifficulty: '函数极限题无法独立完成', desiredResult: '完成函数与极限基础练习。' }),
  ]
  data.courses = courses
  data.tasks = assignVisibleTasks(data, courses.flatMap(item => buildCourseTasks(data, item))).slice(0, 9)
  return reconcileScheduleDomain(data)
}

const scenarios = { 'high-school-recovery': highSchoolRecovery, 'high-school-six': highSchoolSix, 'product-design-isolation': productDesignIsolation, 'computer-science-isolation': computerScienceIsolation }
if (!scenarios[scenario]) throw new Error(`未知作品集场景：${scenario}`)
process.stdout.write(JSON.stringify(scenarios[scenario]()))
