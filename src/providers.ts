import { addDays, createTask, todayISO } from './data.ts'
import type { AppData, Course, DiagnosisResult, LearningTask, PlanAdjustment, ProviderResult } from './types.ts'

const requiredCourseFields: Array<keyof Course> = ['name', 'stage', 'courseType', 'score', 'maxScore', 'passScore', 'examType', 'mastery']

export const courseCompleteness = (course: Course) => {
  const completed = requiredCourseFields.filter(field => course[field] !== '').length
  return Math.round((completed / requiredCourseFields.length) * 100)
}

export const validateCourse = (course: Course) => {
  const errors: string[] = []
  if (!course.name.trim()) errors.push('课程名称')
  if (!course.stage) errors.push('教育阶段')
  if (!course.courseType) errors.push('课程类型')
  if (course.score === '') errors.push('本次得分')
  if (course.maxScore === '' || Number(course.maxScore) <= 0) errors.push('试卷满分')
  if (course.passScore === '') errors.push('及格线')
  if (!course.examType) errors.push('考试类型')
  if (!course.mastery) errors.push('自评掌握程度')
  if (course.score !== '' && course.maxScore !== '' && Number(course.score) > Number(course.maxScore)) errors.push('得分不能高于满分')
  if (course.passScore !== '' && course.maxScore !== '' && Number(course.passScore) > Number(course.maxScore)) errors.push('及格线不能高于满分')
  return errors
}

export const validateGoal = (course: Course) => {
  const errors: string[] = []
  if (!course.goalType) errors.push('当前目标')
  if (course.targetScore === '') errors.push('目标分数')
  if (!course.targetDate) errors.push('目标日期')
  if (!course.desiredResult.trim()) errors.push('希望达到的学习结果')
  if (course.targetScore !== '' && course.maxScore !== '' && Number(course.targetScore) > Number(course.maxScore)) errors.push('目标分数不能高于试卷满分')
  return errors
}

const scoreRatio = (course: Course) => course.score === '' || course.maxScore === '' ? 0 : Number(course.score) / Number(course.maxScore)

export const buildDiagnosis = (data: AppData): DiagnosisResult => {
  const course = [...data.courses].sort((a, b) => Number(b.priority) - Number(a.priority) || scoreRatio(a) - scoreRatio(b))[0]
  if (!course) throw new Error('请先添加至少一门课程。')
  const completeness = courseCompleteness(course)
  const ratio = scoreRatio(course)
  const scoreEvaluation = ratio < .2
    ? `${course.name}本次得分为 ${course.score}/${course.maxScore}，明显低于及格线。单次成绩不足以定位原因，需要先做基础诊断。`
    : ratio < .6
      ? `${course.name}当前得分低于及格线，建议先修复基础断点，再逐步提高综合题完成度。`
      : `${course.name}已具备部分基础，可以通过针对性测验确认薄弱知识点。`
  const weakKnowledgePoints = ratio < .35
    ? ['先修代数', '函数概念与图像', '极限基础', '导数定义']
    : ratio < .6
      ? ['函数与极限衔接', '极限计算', '导数规则', '典型题建模']
      : ['综合题步骤完整性', '易错公式', '限时作答']
  const weakReasons = [
    course.incomplete ? '试卷未完成或存在缺考情况，成绩不能完整反映知识掌握。' : '可能存在知识点断层，需要通过题目级诊断确认。',
    course.mastery === '几乎不会' || course.mastery === '基础薄弱' ? '自评掌握较弱，先修概念可能尚未形成稳定联系。' : '自评与得分之间需要通过小测校准。',
    data.schedule.maxFocusMinutes < 40 ? '单次专注时间较短，长任务需要拆分为更小步骤。' : '可用时间足够，但需要避免一次安排过多新知识。',
  ]
  const target = course.targetScore === '' ? Number(course.passScore || 60) : Number(course.targetScore)
  return {
    generatedAt: new Date().toISOString(),
    courseId: course.id,
    scoreEvaluation,
    completeness,
    confidence: completeness >= 90 ? '高' : completeness >= 70 ? '中' : '低',
    weakReasons,
    requiresBaselineQuiz: ratio < .7,
    baselineQuizMinutes: 15,
    weakKnowledgePoints,
    realisticGoal: `先用 1 周完成基础定位；若诊断结果稳定，再以 ${course.targetDate || '目标日期'} 前达到 ${target}/${course.maxScore || 100} 为阶段目标。`,
    sixWeekStages: [
      { week: '第 1 周', title: '诊断与先修回补', focus: '完成 15 分钟诊断，区分代数、函数、极限与导数问题。' },
      { week: '第 2 周', title: '函数与极限基础', focus: '恢复定义、图像理解与基础运算。' },
      { week: '第 3 周', title: '导数规则', focus: '从定义过渡到求导规则，并练习标准题。' },
      { week: '第 4 周', title: '典型题连接', focus: '把函数、极限和导数用于单一知识点题型。' },
      { week: '第 5 周', title: '综合与限时', focus: '完成分层综合题，记录重复错误。' },
      { week: '第 6 周', title: '模拟与回补', focus: '模拟测试后只回补仍不稳定的知识点。' },
    ],
    recommendedResourceIds: ['resource-baseline-calculus', 'resource-khan-differential', 'resource-mit-calculus'],
    rationale: [
      `以 ${course.score}/${course.maxScore}、及格线 ${course.passScore} 和目标 ${target} 为成绩边界。`,
      `工作日 ${data.schedule.weekdayMinutes} 分钟、周末 ${data.schedule.weekendMinutes} 分钟，单次专注不超过 ${data.schedule.maxFocusMinutes} 分钟。`,
      data.schedule.travelDates ? `旅行安排为“${data.schedule.travelDates}”，计划需保留移动缓冲。` : '当前未填写旅行日期，计划暂按常规可用时间生成。',
      '薄弱知识点只是待验证假设，完成基础诊断后才会进一步收窄。',
    ],
    disclaimer: '这是基于你所填信息生成的学习建议，不构成成绩保证；实际结果取决于执行、反馈与后续测验。',
  }
}

export const validateDiagnosis = (value: DiagnosisResult) => {
  if (!value.courseId || !value.scoreEvaluation || !Array.isArray(value.weakKnowledgePoints) || value.sixWeekStages.length !== 6 || !value.disclaimer) {
    throw new Error('诊断数据字段不完整，请重新生成。')
  }
  return value
}

export const buildSixWeekPlan = (data: AppData, diagnosis: DiagnosisResult): LearningTask[] => {
  const course = data.courses.find(item => item.id === diagnosis.courseId) ?? data.courses[0]
  if (!course) return []
  const start = data.schedule.holidayStart || todayISO()
  const resourceIds = diagnosis.recommendedResourceIds
  return diagnosis.sixWeekStages.flatMap((stage, index) => {
    const knowledgePoint = diagnosis.weakKnowledgePoints[Math.min(index, diagnosis.weakKnowledgePoints.length - 1)]
    const resourceId = resourceIds[Math.min(index, resourceIds.length - 1)]
    const resource = data.resources.find(item => item.id === resourceId)
    return [
      createTask({
        id: `generated-${index}-learn-${Date.now()}`,
        date: addDays(start, index * 7),
        time: data.schedule.preferredTimes.includes('晚上') ? '19:30' : '09:00',
        title: `${stage.title} · 概念学习`,
        courseId: course.id,
        knowledgePoint,
        resourceId,
        materialLabel: resource?.title || '待选择学习材料',
        watchMinutes: 25,
        practiceCount: 6,
        quizTask: `完成 ${knowledgePoint} 快速小测`,
        completionCriteria: '小测正确率达到 70%，并记录至少 1 条错因',
        estimatedMinutes: Math.min(data.schedule.maxFocusMinutes, 45),
        changeNote: `${stage.week}阶段任务`,
        order: index * 2,
      }),
      createTask({
        id: `generated-${index}-practice-${Date.now()}`,
        date: addDays(start, index * 7 + 2),
        time: '19:30',
        title: `${stage.title} · 练习与复盘`,
        courseId: course.id,
        knowledgePoint,
        resourceId,
        materialLabel: resource?.title || '待选择学习材料',
        watchMinutes: 10,
        practiceCount: 10,
        quizTask: `完成 ${knowledgePoint} 10 题小测`,
        completionCriteria: '至少答对 7 题，重复错误写入错题记录',
        estimatedMinutes: Math.min(data.schedule.maxFocusMinutes, 45),
        changeNote: `${stage.week}巩固任务`,
        order: index * 2 + 1,
      }),
    ]
  })
}

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

export interface PlanningProvider {
  generateDiagnosis(data: AppData): Promise<ProviderResult<DiagnosisResult>>
  adjustPlan(prompt: string, data: AppData): Promise<ProviderResult<PlanAdjustment>>
}

export const mockPlanningProvider: PlanningProvider = {
  async generateDiagnosis(data) {
    await wait(520)
    const diagnosis = validateDiagnosis(buildDiagnosis(data))
    return { data: diagnosis, provider: 'mock', generatedAt: new Date().toISOString() }
  },
  async adjustPlan(prompt, data) {
    if (!prompt.trim()) throw new Error('请先描述需要调整的安排。')
    await wait(560)
    if (prompt.includes('超时')) throw new Error('本地模拟服务响应超时，请稍后重试。')
    let tasks = data.tasks.map(task => ({ ...task }))
    const changed = new Set<string>()
    let note = '根据你的说明重新平衡了后续任务。'
    const hourMatch = prompt.match(/(?:最多|每天)?\s*(\d+(?:\.\d+)?)\s*小时/)
    if (hourMatch) {
      const dailyLimit = Math.round(Number(hourMatch[1]) * 60)
      const usedByDate = new Map<string, number>()
      tasks = tasks.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order).map(task => {
        if (task.status === '已完成' || task.status === '已跳过') return task
        const used = usedByDate.get(task.date) ?? 0
        if (used + task.estimatedMinutes <= dailyLimit) {
          usedByDate.set(task.date, used + task.estimatedMinutes)
          return task
        }
        const moved = { ...task, date: addDays(task.date, 1), status: '已延期' as const, changeNote: `每日上限调整为 ${dailyLimit} 分钟` }
        changed.add(task.id)
        usedByDate.set(moved.date, (usedByDate.get(moved.date) ?? 0) + moved.estimatedMinutes)
        return moved
      })
      note = `已按每天最多 ${dailyLimit} 分钟重排超出的任务。`
    }
    const travelMatch = prompt.match(/(\d+)\s*天.*旅行|旅行.*(\d+)\s*天/)
    if (travelMatch || prompt.includes('旅行')) {
      const days = Number(travelMatch?.[1] || travelMatch?.[2] || 3)
      const start = todayISO()
      tasks = tasks.map(task => {
        if (task.status !== '待完成' || task.date < start || task.date > addDays(start, days - 1)) return task
        changed.add(task.id)
        return { ...task, date: addDays(task.date, days), status: '已延期', changeNote: `为 ${days} 天旅行让出时间` }
      })
      note = `已为 ${days} 天旅行让出学习时间，并把受影响任务顺延。`
    }
    if (prompt.includes('今天') && (prompt.includes('延后') || prompt.includes('没时间'))) {
      tasks = tasks.map(task => {
        if (task.date !== todayISO() || task.status !== '待完成') return task
        changed.add(task.id)
        return { ...task, date: addDays(task.date, 1), status: '已延期', changeNote: '今日时间变化，顺延 1 天' }
      })
      note = '已将今天未完成的任务顺延 1 天，并保留原完成标准。'
    }
    if (!changed.size && tasks.length) {
      const target = tasks.find(task => task.status === '待完成')
      if (target) {
        changed.add(target.id)
        tasks = tasks.map(task => task.id === target.id ? { ...task, estimatedMinutes: Math.max(20, task.estimatedMinutes - 10), changeNote: '按学习教练建议缩短单次任务' } : task)
        note = '没有识别到明确日期，我先缩短了最近一项任务；你可以补充日期或每日上限。'
      }
    }
    const adjustment: PlanAdjustment = { message: note, changedTaskIds: [...changed], tasks, changeNote: note }
    return { data: adjustment, provider: 'mock', generatedAt: new Date().toISOString() }
  },
}

export const applyNextWeekPlan = (tasks: LearningTask[]) => {
  const nextWeekStart = addDays(todayISO(), 7)
  return tasks.map((task, index) => {
    if (task.status === '已完成' || task.status === '已跳过') return task
    return {
      ...task,
      date: addDays(nextWeekStart, index % 6),
      estimatedMinutes: Math.max(25, Math.min(task.estimatedMinutes, 45)),
      status: '待完成' as const,
      changeNote: '根据本周正确率与重复错误重排到下周',
    }
  })
}
