import highSchoolDemo from '../demo-data/high-school-demo.json' with { type: 'json' }
import { applyNormalizationToCourse } from './courseCatalog.ts'
import { createCourse, createTask, initialData } from './data.ts'
import { addDays, localDateISO, localTimestamp } from './dateUtils.ts'
import { reconcileScheduleDomain } from './scheduleDomain.ts'
import type { AppData, Course, DiagnosisResult, LearningStage, LearningTask } from './types.ts'

type DemoScore = (typeof highSchoolDemo.scores)[number]

type DemoCourseDetail = {
  currentLevel: string
  priorityProblem: string
  nextAction: string
  weakReasons: string[]
  weakKnowledgePoints: string[]
  realisticGoal: string
  taskTemplates: Array<{ topic: string; action: string; practice: string; criteria: string }>
}

const details: Record<string, DemoCourseDetail> = {
  'high.chinese': {
    currentLevel: '阅读与表达基础稳定，可继续提高证据组织。',
    priorityProblem: '现代文阅读的答案依据和作文段落表达还不够稳定。',
    nextAction: '每周保留 2 次阅读证据定位与 1 次段落改写。',
    weakReasons: ['主观题能说出大意，但答案缺少文本证据。', '作文观点明确后，论据与段落衔接仍可加强。'],
    weakKnowledgePoints: ['现代文阅读证据定位', '古诗文翻译', '议论文段落表达'],
    realisticGoal: '30 天内建立阅读“定位—概括—表达”步骤，并完成 4 次作文段落修订。',
    taskTemplates: [
      { topic: '现代文阅读证据定位', action: '圈出题干关键词，回到原文标注 3 处证据。', practice: '完成 1 篇现代文阅读的 3 道主观题。', criteria: '每题答案都标注对应原文依据。' },
      { topic: '古诗文实词与翻译', action: '整理 6 个易混实词和 2 个句式。', practice: '翻译 3 个短句并核对关键词。', criteria: '翻译中关键词和句式都能解释。' },
      { topic: '议论文段落表达', action: '用“观点—材料—分析—回扣”改写一个段落。', practice: '完成 1 段 180 字左右的论证段。', criteria: '段落包含明确观点、材料和分析连接。' }
    ],
  },
  'high.math': {
    currentLevel: '基础知识存在漏洞，需要先稳定函数与几何的解题步骤。',
    priorityProblem: '函数基础、几何条件转化和错题复盘不足，导致基础题失分。',
    nextAction: '优先完成函数基础训练，并把错题按“概念、条件、计算”分类。',
    weakReasons: ['函数题中定义域、单调性等基础条件容易遗漏。', '几何题能跟随示例，但独立建模步骤不稳定。'],
    weakKnowledgePoints: ['函数定义域与性质', '一元二次函数与不等式', '平面向量基础'],
    realisticGoal: '30 天内稳定基础题步骤，完成 3 次错题分类复盘和 2 次限时基础训练。',
    taskTemplates: [
      { topic: '函数定义域与性质', action: '整理函数定义域、单调性和奇偶性的检查顺序。', practice: '完成 12 道函数基础题。', criteria: '每题先写出定义域，再给出关键判断依据。' },
      { topic: '一元二次函数与不等式', action: '用数形结合整理开口、对称轴和区间关系。', practice: '完成 10 道一元二次不等式基础题。', criteria: '每题保留数轴或抛物线草图。' },
      { topic: '错题分类复盘', action: '从本次练习中选出 3 道错题，标记错因。', practice: '重做 3 道同类题。', criteria: '每道错题都有错因标签和一次独立重做。' }
    ],
  },
  'high.english': {
    currentLevel: '英语基础较好，重点从重复基础练习转向阅读效率和写作提升。',
    priorityProblem: '阅读定位速度与作文表达的准确性仍有提升空间。',
    nextAction: '保持词汇复习频率，把更多时间投入阅读定位和作文修订。',
    weakReasons: ['词汇基础较好，但长难句会拖慢阅读定位。', '作文内容完整，连接词和句式变化较少。'],
    weakKnowledgePoints: ['长难句定位', '阅读细节判断', '应用文写作'],
    realisticGoal: '30 天内完成 6 篇限时阅读与 4 次应用文改写，保持优势课程的输出质量。',
    taskTemplates: [
      { topic: '长难句定位', action: '拆分 5 个长难句的主干和修饰成分。', practice: '完成 1 篇阅读中的句子定位练习。', criteria: '能写出每句主干并说明定位关键词。' },
      { topic: '阅读细节判断', action: '记录题干关键词与原文同义替换。', practice: '限时完成 1 篇阅读理解。', criteria: '每道题保留原文定位句和判断理由。' },
      { topic: '应用文写作', action: '根据题目先列出写作目的、对象和 3 个要点。', practice: '完成 1 篇 100 词左右的应用文。', criteria: '完成后检查时态、称谓和连接表达。' }
    ],
  },
  'high.politics': {
    currentLevel: '基础分数可用，知识框架和材料题表达需要系统整理。',
    priorityProblem: '知识点分散，材料题中概念调用与规范表达不稳定。',
    nextAction: '先建立模块框架，再用材料关键词练习“概念—材料—结论”。',
    weakReasons: ['记住概念后，遇到材料题仍不容易选出对应知识点。', '答案有观点但缺少结合材料的表达。'],
    weakKnowledgePoints: ['必修模块框架', '材料关键词提取', '主观题规范表达'],
    realisticGoal: '30 天内形成 3 张模块框架图，并完成 6 道材料题的规范表达训练。',
    taskTemplates: [
      { topic: '必修模块框架', action: '把一个单元整理成“核心概念—关系—常见材料”框架。', practice: '口头复述 3 个概念之间的关系。', criteria: '框架图能覆盖本单元至少 6 个核心概念。' },
      { topic: '材料关键词提取', action: '从材料中圈出政策、主体、问题和结果关键词。', practice: '完成 2 则材料的关键词归类。', criteria: '每组关键词都对应一个可调用概念。' },
      { topic: '主观题规范表达', action: '按“理论依据—材料对应—结论”写出答案骨架。', practice: '完成 1 道主观题。', criteria: '答案每个要点都包含理论词和材料词。' }
    ],
  },
  'high.physics': {
    currentLevel: '概念理解不足，基础模型训练应优先于综合题。',
    priorityProblem: '受力分析与牛顿定律模型还未形成稳定的解题起点。',
    nextAction: '增加基础模型训练，先画图、再列条件、最后选择定律。',
    weakReasons: ['题目变化后容易直接套公式，缺少物理图景。', '受力分析遗漏条件会影响后续方程。'],
    weakKnowledgePoints: ['运动学图像', '受力分析', '牛顿运动定律'],
    realisticGoal: '30 天内完成 8 次基础模型练习，并让受力图和条件清单成为每题固定步骤。',
    taskTemplates: [
      { topic: '运动学图像', action: '比较位移—时间和速度—时间图像的斜率、面积含义。', practice: '完成 8 道图像判断题。', criteria: '每题写出图像特征与物理量对应关系。' },
      { topic: '受力分析', action: '按对象、接触、方向三步画出受力图。', practice: '完成 5 个物体的受力图练习。', criteria: '每个受力都标出施力物体和方向。' },
      { topic: '牛顿运动定律', action: '从受力图写出研究对象与坐标轴选择。', practice: '完成 4 道基础模型例题。', criteria: '每题先列已知条件，再写出方程依据。' }
    ],
  },
  'high.chemistry': {
    currentLevel: '基础较稳，重点提升反应原理连接和实验分析准确性。',
    priorityProblem: '离子反应、氧化还原和实验现象之间的解释还不够连贯。',
    nextAction: '保持基础复习，将练习集中在“现象—原理—方程式”的转换。',
    weakReasons: ['方程式能够配平，但离子反应条件容易遗漏。', '实验题能描述现象，但原理解释不够完整。'],
    weakKnowledgePoints: ['离子反应', '氧化还原反应', '实验现象分析'],
    realisticGoal: '30 天内完成 4 次反应原理整理和 4 组实验现象解释练习。',
    taskTemplates: [
      { topic: '离子反应', action: '整理强弱电解质和离子方程式书写步骤。', practice: '完成 8 个离子方程式书写题。', criteria: '每题检查拆写、守恒和反应条件。' },
      { topic: '氧化还原反应', action: '标出元素化合价变化并判断氧化剂、还原剂。', practice: '完成 6 道氧化还原判断题。', criteria: '每题写明电子转移方向。' },
      { topic: '实验现象分析', action: '用“操作—现象—原因”三栏整理实验。', practice: '完成 2 组实验现象解释。', criteria: '每组都包含可观察现象与原理对应。' }
    ],
  },
}

const demoCourseIds = highSchoolDemo.scores.map(item => item.id)

/**
 * 为 Demo 生成可复现的“随机”轮换：刷新页面不会改变历史结果，
 * 但每天六门课进入节次的顺序都会变化。
 */
const shuffledCourseOrder = (dayIndex: number) => {
  const result = [...demoCourseIds]
  let seed = (0x9e3779b9 + dayIndex * 0x45d9f3b) >>> 0
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const swapIndex = seed % (index + 1)
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

const slots = [
  { id: 'morning-1', time: '08:00' },
  { id: 'morning-2', time: '09:00' },
  { id: 'morning-3', time: '10:00' },
  { id: 'afternoon-1', time: '14:00' },
  { id: 'afternoon-2', time: '15:00' },
  { id: 'afternoon-3', time: '16:00' },
]

const stagesFor = (courseId: string, start: string): LearningStage[] => [
  { courseId, week: '阶段 1', startDate: start, endDate: addDays(start, 9), title: '基础定位', focus: '用基础题和错因记录确认最需要修补的知识点。', practice: '短练习 + 错因分类', deliverable: '基础问题清单', difficulty: '基础' },
  { courseId, week: '阶段 2', startDate: addDays(start, 10), endDate: addDays(start, 20), title: '专项强化', focus: '围绕高频失分点建立可重复的解题或表达步骤。', practice: '专题训练 + 限时检查', deliverable: '专项练习记录', difficulty: '中等' },
  { courseId, week: '阶段 3', startDate: addDays(start, 21), endDate: addDays(start, 29), title: '整合复盘', focus: '回看错因并用综合任务检查方法是否可以独立使用。', practice: '综合练习 + 复盘', deliverable: '复盘与下一步清单', difficulty: '中等' },
]

const createDiagnosis = (course: Course, item: DemoScore, start: string): DiagnosisResult => {
  const detail = details[item.id]
  return {
    id: `demo-diagnosis-${item.id}`,
    version: 1,
    courseRevision: course.revision,
    status: 'completed',
    source: 'local-rules',
    evidenceType: 'exam_score',
    attemptId: `demo-attempt-${item.id}`,
    questionVersion: 1,
    generatedAt: localTimestamp(),
    completedAt: localTimestamp(),
    courseId: course.id,
    normalizedName: course.canonicalName,
    canonicalId: course.canonicalId,
    subjectDomain: course.subjectDomain || '通用技能',
    domainCategory: course.subjectDomain === '数学与统计' ? '数学类' : course.subjectDomain === '大学英语与语言考试' ? '语言类' : '理论学科类',
    assessmentSummary: `${item.name}当前 ${item.score}/${item.maxScore} 分。${detail.currentLevel}`,
    currentLevel: detail.currentLevel,
    priorityProblem: detail.priorityProblem,
    nextAction: detail.nextAction,
    completeness: 82,
    confidence: '中',
    confidenceBasis: '已使用本次成绩、学习目标与 Demo 设定的学习卡点；尚未接入真实错题或诊断测验证据。',
    weakReasons: detail.weakReasons,
    diagnosticQuiz: [],
    weakKnowledgePoints: detail.weakKnowledgePoints,
    realisticGoal: detail.realisticGoal,
    feasibilityWarning: '这是本地模拟的学习建议，不保证分数或考试结果。',
    learningStages: stagesFor(course.id, start),
    resourceKeywords: [item.name, ...detail.weakKnowledgePoints],
    rationale: [`当前分数为 ${item.score}/${item.maxScore}，决定该课程在计划中的训练密度。`, detail.priorityProblem, '任务会在 30 天内重复出现，并保留每周复盘调整入口。'],
    disclaimer: highSchoolDemo.note,
  }
}

export const isHighSchoolDemo = (data: AppData) => data.settings.displayName === highSchoolDemo.student.displayName

export const createHighSchoolDemoData = (): AppData => {
  const data = initialData()
  const start = localDateISO()
  const courseByCanonicalId = new Map<string, Course>()
  data.onboardingCompleted = true
  data.onboardingStep = 3
  data.settings = { ...data.settings, displayName: highSchoolDemo.student.displayName }
  data.schedule = { ...data.schedule, holidayStart: start, holidayEnd: addDays(start, highSchoolDemo.holiday.days - 1), weekdayMinutes: highSchoolDemo.holiday.dailyMinutes, weekendMinutes: highSchoolDemo.holiday.dailyMinutes, maxAutoTasksPerDay: 6, strictDailyCapacity: false, strictHolidayRange: true, preferredTimes: ['上午', '下午'] }
  data.courses = highSchoolDemo.scores.map(item => {
    const detail = details[item.id]
    const course = applyNormalizationToCourse(createCourse({
      id: `demo-${item.id}`,
      name: item.name,
      stage: '高中',
      courseType: '学科课程',
      assessmentMode: 'score',
      score: item.score,
      maxScore: item.maxScore,
      passScore: Math.round(item.maxScore * .6),
      examType: '期末考试',
      mastery: item.score / item.maxScore < .7 ? '基础薄弱' : '一般',
      mainDifficulty: detail.priorityProblem,
      selfEvidence: '作品集 Demo 预置案例：未录入真实错题和测验结果。',
      goalType: highSchoolDemo.student.goal === '巩固基础' ? '巩固' : '拔高',
      targetScore: item.targetScore,
      targetDate: addDays(start, highSchoolDemo.holiday.days - 1),
      priority: item.id === 'high.math' || item.id === 'high.physics',
      priorityWeight: item.id === 'high.math' ? 3 : item.id === 'high.physics' ? 2 : 1,
      desiredResult: detail.realisticGoal,
      desiredResultEdited: false,
      curriculum: { ...createCourse().curriculum, stage: '高中', grade: highSchoolDemo.student.grade, province: '全国通用', examRegion: '全国通用', semester: '上学期', textbookVersion: '通用学习模块', syllabusTitle: `${item.name}假期学习模块`, syllabusUnits: detail.weakKnowledgePoints.map((title, index) => ({ id: `${item.id}-unit-${index + 1}`, title, order: index + 1, prerequisites: index ? [`${item.id}-unit-${index}`] : [] })), source: 'user-input' },
    }), item.id)
    courseByCanonicalId.set(item.id, course)
    return course
  })
  data.diagnoses = Object.fromEntries(highSchoolDemo.scores.map(item => {
    const course = courseByCanonicalId.get(item.id)!
    return [course.id, createDiagnosis(course, item, start)]
  }))
  data.diagnosisHistory = Object.values(data.diagnoses)
  data.tasks = Array.from({ length: highSchoolDemo.holiday.days }, (_, dayIndex) => shuffledCourseOrder(dayIndex).map((canonicalId, slotIndex) => {
    const course = courseByCanonicalId.get(canonicalId)!
    const detail = details[canonicalId]
    const template = detail.taskTemplates[(dayIndex + slotIndex) % detail.taskTemplates.length]
    const date = addDays(start, dayIndex)
    const stageIndex = dayIndex < 10 ? 1 : dayIndex < 21 ? 2 : 3
    return createTask({
      id: `demo-task-${dayIndex + 1}-${slotIndex + 1}`,
      planId: 'demo-high-school-30-day',
      date,
      originalPlannedDate: date,
      time: slots[slotIndex].time,
      slotId: slots[slotIndex].id,
      title: `${course.canonicalName} · ${template.topic}`,
      action: template.action,
      courseId: course.id,
      stageLabel: `第 ${stageIndex} 阶段 · ${stageIndex === 1 ? '基础定位' : stageIndex === 2 ? '专项强化' : '整合复盘'}`,
      stageStartDate: start,
      stageEndDate: addDays(start, highSchoolDemo.holiday.days - 1),
      knowledgePoint: template.topic,
      unitId: `${canonicalId}-${template.topic}`,
      estimatedMinutes: 45,
      practiceMinutes: 30,
      quizMinutes: 5,
      practiceCount: Number((template.practice.match(/\d+/)?.[0] ?? '1')),
      quizTask: template.practice,
      completionCriteria: template.criteria,
      arrangementReason: `${course.canonicalName}当前 ${course.score}/${course.maxScore} 分；${detail.priorityProblem}`,
      difficulty: dayIndex < 10 ? '基础' : dayIndex < 21 ? '中等' : '进阶',
      status: dayIndex === 0 && slotIndex === 0 ? '进行中' : '待完成',
      scheduleStatus: 'scheduled',
      source: 'system',
      phaseId: `${course.id}:demo-stage-${stageIndex}`,
      weeklyGoalId: `${course.id}:demo-week-${Math.floor(dayIndex / 7) + 1}`,
      taskType: slotIndex >= 3 ? 'practice' : 'learn',
      knowledgePointIds: [`${canonicalId}-${template.topic}`],
      rationale: { summary: `根据 ${course.canonicalName} 的当前成绩和学习目标安排。`, reasonCodes: ['score_gap', 'diagnosis', ...(course.priority ? ['user_priority' as const] : [])], evidenceIds: [data.diagnoses[course.id].id], dependencyTaskIds: [], factors: [{ key: 'score-gap', weight: 1 - Number(course.score) / Number(course.maxScore), explanation: `当前成绩 ${course.score}/${course.maxScore}。` }], confidence: .7, limitations: ['未接入真实错题、课堂表现或长期学习记录。'] },
    })
  })).flat()
  data.planChanges = ['已加载“高二学生”作品集 Demo：六门课程、差异化诊断与 30 天任务。', '本地模拟结果仅用于演示产品流程，不保证学习结果。']
  return reconcileScheduleDomain(data)
}

export const highSchoolDemoTutorRecommendations = [
  { courseCanonicalId: 'high.math', title: '数学专项辅导', suitable: '数学 80–100 分、基础题步骤不稳定的学生', reason: '当前 Demo 数学 82/150 分，函数基础与错题复盘需要先建立固定方法。', goal: '提升基础题正确率，并能独立完成函数与不等式的检查步骤。' },
  { courseCanonicalId: 'high.physics', title: '物理专项辅导', suitable: '物理 60–70 分、概念与模型理解不足的学生', reason: '当前 Demo 物理 63/100 分，受力分析和基础模型是优先卡点。', goal: '建立“画图—列条件—选定律”的基础模型训练方法。' },
]
