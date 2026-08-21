import { getCourseIntelligence } from './courseIntelligence.ts'
import { localTimestamp } from './dateUtils.ts'
import type { AppData, DailyCheck, LearningTask, QuizEvent, SubjectDomain } from './types.ts'

export const selectDailyCheckState = (checks: DailyCheck[], events: QuizEvent[], options: { enabled?: boolean; dismissedCheckId?: string } = {}) => {
  const pendingCheck = options.enabled === false ? undefined : [...checks].reverse().find(check => check.id !== options.dismissedCheckId && !events.some(event => event.attemptId === check.attemptId))
  const latestSubmittedCheck = [...checks].reverse().find(check => events.some(event => event.attemptId === check.attemptId))
  const latestSubmittedEvent = latestSubmittedCheck ? events.find(event => event.attemptId === latestSubmittedCheck.attemptId) : undefined
  return { pendingCheck, latestSubmittedCheck, latestSubmittedEvent }
}

const hashText = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(36)
}

const dayDistance = (left: string, right: string) => Math.floor(Math.abs(new Date(left).getTime() - new Date(right).getTime()) / 86_400_000)

const questionTypes: DailyCheck['questionType'][] = ['recall', 'objective', 'application', 'performance']

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')

const answerStructure = (content: ReturnType<typeof promptFor>) => content.options?.length
  ? `options:${content.options.map(normalized).join('|')};correct:${normalized(content.correctOption ?? '')}`
  : `rubric:${(content.rubric ?? []).map(normalized).join('|')}`

const promptFor = (domain: SubjectDomain, point: string, type: DailyCheck['questionType'], variant: number) => {
  const context = variant % 4
  if (domain === '数学与统计') {
    if (type === 'objective') return { prompt: `关于“${point}”，哪一步最应该先检查？`, options: ['定义与适用条件', '直接抄写答案', '只看最终数值'], correctOption: '定义与适用条件', explanation: '先确认定义、条件和已知量，能避免把公式用在不适用的题型上。' }
    if (type === 'application') return { prompt: `请用今天不同于例题的一组数值，完成一次“${point}”并写出关键步骤。`, rubric: ['写出已知与目标', '说明使用条件', '核对结果'], explanation: '更换数值后仍能完成，才说明方法开始可迁移。' }
    return { prompt: context % 2 ? `不看笔记，说出“${point}”最容易出错的一个条件。` : `用一句话解释“${point}”解决的是什么问题。`, rubric: ['概念准确', '指出条件或边界'], explanation: '主动回忆比重新阅读更能暴露尚未掌握的环节。' }
  }
  if (domain === '大学英语与语言考试') {
    if (type === 'objective') return { prompt: `复习“${point}”时，哪种做法更能验证掌握？`, options: ['在新语境中使用', '只认得中文意思', '重复浏览列表'], correctOption: '在新语境中使用', explanation: '能在新语境中提取和使用，证据比熟悉感更可靠。' }
    return { prompt: context % 2 ? `围绕“${point}”写一个与今天材料不同的新句子。` : `不看材料，复述“${point}”的关键信息。`, rubric: ['信息完整', '表达可理解', '能独立完成'], explanation: '输出任务用于验证能否从识别过渡到主动使用。' }
  }
  if (domain === '编程语言与Web开发' || domain === '计算机系统网络与数据库' || domain === '人工智能与数据科学') {
    if (type === 'objective') return { prompt: `遇到“${point}”相关错误时，第一步更合理的是？`, options: ['缩小可复现范围并读取错误信息', '同时改动多处代码', '跳过测试'], correctOption: '缩小可复现范围并读取错误信息', explanation: '先建立最小可复现条件，才能把猜测变成可验证的调试。' }
    return { prompt: context % 2 ? `在不复制示例的情况下，为“${point}”写一个最小实现或伪代码。` : `解释“${point}”的输入、输出和一个失败边界。`, rubric: ['输入输出明确', '包含失败边界', '可独立解释'], explanation: '代码课程需要实现与调试证据，不能只凭“看懂了”。' }
  }
  if (['平面与图像设计', '矢量设计', '三维建模与CAD', '视频剪辑与动效', 'UIUX与交互设计', '产品设计理论与项目'].includes(domain)) {
    return { prompt: context % 2 ? `关闭教程，独立完成一个“${point}”最小案例，并说明检查结果。` : `针对“${point}”，列出开始操作前的两项质量检查。`, rubric: ['能独立完成', '过程可回退', '结果符合质量标准'], explanation: '软件与设计学习以可检查的操作和成果物为证据。' }
  }
  return { prompt: context % 2 ? `不看笔记，用自己的话解释“${point}”，并举一个反例或边界。` : `把“${point}”应用到一个今天未出现的新案例。`, rubric: ['概念准确', '案例相关', '能指出边界'], explanation: '未知或理论课程先使用中立能力证据，不生成未经依据的专业结论。' }
}

export const generateDailyChecks = (data: AppData, task: LearningTask, count = 1, now = localTimestamp()): DailyCheck[] => {
  const course = data.courses.find(item => item.id === task.courseId)
  if (!course) throw new Error('任务没有关联有效课程，无法生成自检。')
  const intelligence = getCourseIntelligence(course, data.schedule)
  const recent = new Set(data.dailyChecks.filter(item => item.courseId === course.id && dayDistance(item.generatedAt, now) < 30).map(item => item.fingerprint))
  const checks: DailyCheck[] = []
  for (let variant = 0; variant < questionTypes.length * 2 && checks.length < Math.max(1, Math.min(3, count)); variant += 1) {
    const questionType = questionTypes[variant % questionTypes.length]
    const content = promptFor(intelligence.subjectDomain, task.knowledgePoint || task.title, questionType, variant)
    const difficulty = task.difficulty || '基础'
    const fingerprint = hashText([
      normalized(content.prompt),
      normalized(task.knowledgePoint || task.title),
      difficulty,
      answerStructure(content),
    ].join('|'))
    if (recent.has(fingerprint)) continue
    checks.push({
      id: crypto.randomUUID(),
      courseId: course.id,
      taskId: task.id,
      unitId: task.unitId || task.stageLabel,
      knowledgePointId: hashText(task.knowledgePoint || task.title),
      questionType,
      difficulty,
      prompt: content.prompt,
      rubric: content.rubric,
      options: content.options,
      correctOption: content.correctOption,
      explanation: content.explanation,
      fingerprint,
      generatedAt: now,
      attemptId: crypto.randomUUID(),
    })
    recent.add(fingerprint)
  }
  if (!checks.length) throw new Error('题库不足：最近 30 天内没有新的有效题目，请更换知识点或稍后再试。')
  return checks
}

export const scoreDailyCheck = (check: DailyCheck, answer: string) => check.options
  ? Number(answer === check.correctOption) * 2
  : null

export const submitDailyCheck = (data: AppData, check: DailyCheck, answer: string, confidence?: QuizEvent['confidence']): QuizEvent => {
  if (data.quizEvents.some(event => event.attemptId === check.attemptId)) throw new Error('这次自检已经提交，不能重复记录。')
  if (!answer.trim()) throw new Error('请先填写或选择真实作答。')
  if (check.options && !check.options.includes(answer)) throw new Error('请选择题目提供的有效答案。')
  if (!check.options && answer.trim().length < 6) throw new Error('请至少填写 6 个字，说明步骤、结果或产出。')
  const objectiveScore = scoreDailyCheck(check, answer)
  return {
    id: crypto.randomUUID(),
    attemptId: check.attemptId,
    questionVersion: 1,
    source: 'today',
    evidenceType: check.options ? 'objective_quiz' : check.questionType === 'performance' || check.questionType === 'application' ? 'performance_task' : 'self_assessment',
    courseId: check.courseId,
    taskId: check.taskId,
    questionId: check.id,
    point: check.knowledgePointId,
    score: objectiveScore ?? 0,
    maxScore: objectiveScore === null ? 0 : 2,
    answer,
    confidence,
    occurredAt: localTimestamp(),
  }
}
