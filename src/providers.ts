import { createTaskChangeSet } from './changeSets.ts'
import { curriculumErrors, profileSummary } from './curriculum.ts'
import { broadCategoryFor, isStableCatalogCourse, normalizeCourseName } from './courseCatalog.ts'
import { getCourseIntelligence } from './courseIntelligence.ts'
import { addDays, inDateRange, localDateISO, localTimestamp, mondayOfWeek, weekIdFor } from './dateUtils.ts'
import { createTask } from './data.ts'
import { buildRecoveryProposal, detectRecoverySignals } from './domain/recovery.ts'
import { capacityForDate, scheduleTasks, tasksFromResource, validateScheduleChange } from './scheduler.ts'
import { reconcileScheduleDomain } from './scheduleDomain.ts'
import { slotDuration } from './timetable.ts'
import { inputSnapshotHash } from './versioning.ts'
import { resourceSnapshotScore } from './resourceProvider.ts'
import type {
  AppData, AssessmentEvent, ChangeSet, Course, DiagnosisResult, DiagnosticEvidenceType, LearningResource, LearningTask,
  PlanAdjustment, PlanningBasis, PlanSnapshot, ProviderResult, QuizEvent, ResourceDifficulty, TaskEvent,
} from './types.ts'

export type FieldErrors = Record<string, string>

export const courseFieldErrors = (course: Course): FieldErrors => {
  const errors: FieldErrors = {}
  if (!course.name.trim()) errors.name = '请输入课程名称。'
  if (!course.stage) errors.stage = '请选择教育阶段。'
  if (!course.courseType) errors.courseType = '请选择与教育阶段匹配的课程类型。'
  Object.assign(errors, curriculumErrors(course))
  const normalized = normalizeCourseName(course.name, course.ambiguityResolved ? course.canonicalId : '')
  if (!isStableCatalogCourse(normalized.canonicalId)) delete errors.syllabus
  if (normalized.ambiguityOptions?.length && !course.ambiguityResolved) errors.ambiguity = '这个简称存在歧义，请先确认具体课程。'
  // 自定义课程允许先依据课程名称、目标和用户证据生成低置信度基线计划。
  // 真实目录会提高章节精度，但不能成为开始计划的门槛。
  if (!course.assessmentMode) errors.assessmentMode = '请选择评估方式。'
  if (course.assessmentMode === 'score') {
    if (course.score === '') errors.score = '请输入本次得分。'
    if (course.maxScore === '' || Number(course.maxScore) <= 0) errors.maxScore = '请输入有效的试卷满分。'
    if (course.passScore === '') errors.passScore = '请输入及格线。'
    if (!course.examType) errors.examType = '请选择考试类型。'
    if (!course.mastery) errors.mastery = '请选择当前掌握程度。'
    if (course.score !== '' && course.maxScore !== '' && Number(course.score) > Number(course.maxScore)) errors.score = '得分不能高于试卷满分。'
    if (course.passScore !== '' && course.maxScore !== '' && Number(course.passScore) > Number(course.maxScore)) errors.passScore = '及格线不能高于试卷满分。'
  } else {
    if (!course.mastery) errors.mastery = '请选择当前熟练度。'
    if (!course.selfEvidence.trim() && !course.mainDifficulty.trim() && course.projectChecklist.length === 0) errors.selfEvidence = '请填写一项自评、作品或学习困难证据。'
  }
  return errors
}

export const validateCourse = (course: Course) => Object.values(courseFieldErrors(course)).map(message => message.replace(/[。.]$/, ''))

export const goalFieldErrors = (course: Course): FieldErrors => {
  const errors: FieldErrors = {}
  if (!course.goalType) errors.goalType = '请选择当前目标。'
  if (course.assessmentMode === 'score' && course.targetScore === '') errors.targetScore = '请输入目标分数。'
  if (!course.targetDate) errors.targetDate = '请选择目标日期。'
  if (!course.desiredResult.trim()) errors.desiredResult = '请选择建议或填写希望达到的学习结果。'
  if (course.targetScore !== '' && course.maxScore !== '' && Number(course.targetScore) > Number(course.maxScore)) errors.targetScore = '目标分数不能高于试卷满分。'
  return errors
}

export const validateGoal = (course: Course) => Object.values(goalFieldErrors(course)).map(message => message.replace(/[。.]$/, ''))

export const courseCompleteness = (course: Course) => {
  const relevant = course.assessmentMode === 'score'
    ? ['name', 'stage', 'courseType', 'assessmentMode', 'score', 'maxScore', 'passScore', 'examType', 'mastery'] as const
    : ['name', 'stage', 'courseType', 'assessmentMode', 'mastery', 'selfEvidence'] as const
  const complete = relevant.filter(key => course[key] !== '' && course[key] !== undefined).length
  const curriculum = curriculumErrors(course)
  const curriculumTotal = course.stage === '高中' ? 2 : 1
  return Math.round(((complete + Math.max(0, curriculumTotal - Object.keys(curriculum).length)) / (relevant.length + curriculumTotal)) * 100)
}

const ratioFor = (course: Course) => course.score === '' || course.maxScore === '' || Number(course.maxScore) <= 0 ? null : Number(course.score) / Number(course.maxScore)

const bandFor = (course: Course) => {
  const ratio = ratioFor(course)
  if (ratio === null) return 'standard' as const
  return ratio < .3 ? 'foundation' as const : ratio < .7 ? 'recovery' as const : 'advanced' as const
}

const assessmentSummary = (course: Course) => {
  if (course.assessmentMode === 'score') {
    const passGap = course.passScore === '' ? null : Number(course.passScore) - Number(course.score)
    const targetGap = course.targetScore === '' ? null : Number(course.targetScore) - Number(course.score)
    return `${course.name}本次为 ${course.score}/${course.maxScore}，及格线 ${course.passScore}。${passGap !== null && passGap > 0 ? `距离及格还差 ${passGap} 分。` : '当前已达到填写的及格线。'}${targetGap !== null && targetGap > 0 ? `距离目标还差 ${targetGap} 分。` : ''}这项成绩只能确定学习起点，不能直接证明某个知识点已经掌握或薄弱。`
  }
  if (course.assessmentMode === 'project') return `${course.name}使用作品与操作记录作为起点；当前${course.projectCompleted ? '已有作品可复盘' : '尚无完整作品'}，主要困难是“${course.mainDifficulty}”。`
  return `${course.name}当前自评为“${course.mastery}”，依据是“${course.selfEvidence}”。自评只用于了解学习状态，不作为客观正确率。`
}

const levelFor = (course: Course) => {
  const band = bandFor(course)
  if (band === 'foundation') return '需要先重建前置基础，并使用短任务获得密集反馈'
  if (band === 'recovery') return '仍有明显基础差距，应围绕高频错因巩固典型任务'
  if (band === 'advanced') return '基础较稳定，可以进入综合应用、迁移和限时训练'
  if (course.mastery === '较熟练' || course.mastery === '熟练') return '可以独立完成部分任务，需要提升稳定性与质量'
  if (course.mastery === '一般') return '能跟随完成，需要加强独立执行和检查'
  return '处于入门或基础建立阶段'
}

export const feasibilityFor = (course: Course, data: AppData) => {
  if (course.assessmentMode !== 'score' || course.score === '' || course.targetScore === '' || course.maxScore === '') return ''
  const gap = Number(course.targetScore) - Number(course.score)
  const remainingDays = Math.max(1, Math.round((new Date(`${course.targetDate}T12:00:00`).getTime() - new Date(`${localDateISO()}T12:00:00`).getTime()) / 86_400_000))
  const averageMinutes = (data.schedule.weekdayMinutes * 5 + data.schedule.weekendMinutes * 2) / 7
  if (gap >= Number(course.maxScore) * .45 && (remainingDays < 42 || averageMinutes < 120)) return `目标差距为 ${gap} 分，剩余 ${remainingDays} 天且日均约 ${Math.round(averageMinutes)} 分钟。建议先以阶段性提升和基础复测为目标，不保证达到目标分数。`
  if (gap > 0) return `目标差距为 ${gap} 分；计划会根据剩余 ${remainingDays} 天和每日容量分阶段验证。`
  return '当前分数已达到填写目标，计划将侧重稳定性和迁移验证。'
}

const evidenceFor = (course: Course): DiagnosticEvidenceType => course.assessmentMode === 'score' ? 'exam_score' : course.assessmentMode === 'project' ? 'performance_task' : 'self_assessment'

export const buildDiagnosis = (data: AppData, courseId?: string): DiagnosisResult => {
  const course = courseId ? data.courses.find(item => item.id === courseId) : data.courses.find(item => item.priority) ?? data.courses[0]
  if (!course) throw new Error('请先添加至少一门课程。')
  const intelligence = getCourseIntelligence(course, data.schedule)
  if (intelligence.normalizedCourse.ambiguityOptions?.length && !course.ambiguityResolved) throw new Error(`“${course.name}”存在歧义，请先确认具体课程。`)
  const version = Math.max(0, ...data.diagnosisHistory.filter(item => item.courseId === course.id).map(item => item.version), data.diagnoses[course.id]?.version ?? 0) + 1
  const weakPoints = bandFor(course) === 'foundation' ? ['前置基础', ...intelligence.competencyDimensions].slice(0, 3) : intelligence.competencyDimensions.slice(0, 3)
  const hasObjectiveDiagnosis = data.quizEvents.some(event => event.courseId === course.id && event.source === 'diagnosis' && event.evidenceType === 'objective_quiz')
  // A score establishes a starting point, not a verified knowledge-point map.
  // Keep the baseline deliberately low until this course has objective diagnostic evidence.
  const confidence: DiagnosisResult['confidence'] = intelligence.fallbackUsed || intelligence.needsMoreContext || !hasObjectiveDiagnosis ? '低' : '中'
  return {
    id: crypto.randomUUID(), version, courseRevision: course.revision, status: 'draft', source: 'local-rules', evidenceType: evidenceFor(course), attemptId: crypto.randomUUID(), questionVersion: 1,
    generatedAt: localTimestamp(), completedAt: '', courseId: course.id, normalizedName: intelligence.normalizedName, canonicalId: intelligence.normalizedCourse.canonicalId,
    subjectDomain: intelligence.subjectDomain, domainCategory: intelligence.domainCategory, assessmentSummary: assessmentSummary(course), currentLevel: levelFor(course),
    priorityProblem: intelligence.needsClarification || intelligence.needsMoreContext ? '课程或教材范围仍需补充，暂不生成专业结论' : course.mainDifficulty.trim() || weakPoints[0],
    nextAction: intelligence.needsClarification || intelligence.needsMoreContext
      ? '当前成绩或自评已足以生成基础计划；补充课程方向、教材版本或章节目录后，可进一步提高知识点定位精度。'
      : `当前成绩或自评已足以生成基础计划；可选完成约 15 分钟基础诊断（${intelligence.diagnosticQuiz.length} 题），提高知识点定位精度。`,
    completeness: courseCompleteness(course), confidence,
    confidenceBasis: intelligence.fallbackUsed || intelligence.needsMoreContext
      ? `课程或目录信息不足（${profileSummary(course)}），只能使用学科中立问题，置信度保持低。`
      : !hasObjectiveDiagnosis
        ? '当前成绩或自评只能说明学习起点，尚未结合本课程的客观基础诊断，因此知识点定位保持低置信度。'
        : '课程与目录信息已完成，并已结合既有客观诊断证据；仍需真实执行记录持续验证。',
    weakReasons: [course.incomplete ? '本次试卷未完成，单次成绩不能代表全部能力。' : '当前结论主要来自录入信息，仍需诊断任务验证。', course.mainDifficulty ? `用户明确提到“${course.mainDifficulty}”。` : `需要在${intelligence.competencyDimensions.join('、')}中进一步定位。`],
    diagnosticQuiz: intelligence.diagnosticQuiz, weakKnowledgePoints: weakPoints, realisticGoal: course.desiredResult || intelligence.suggestedGoals[0], feasibilityWarning: feasibilityFor(course, data),
    learningStages: intelligence.learningStages, resourceKeywords: intelligence.resourceKeywords,
    rationale: [`课程识别为${intelligence.normalizedName}，学习范围属于${intelligence.subjectDomain}。`, `课程范围：${profileSummary(course)}；当前有 ${intelligence.curriculumUnits.length} 个可用单元。`, '当前结论综合课程信息、成绩或作品起点与本批诊断作答；自评不会计入客观正确率。', `工作日 ${data.schedule.weekdayMinutes} 分钟、周末 ${data.schedule.weekendMinutes} 分钟，最终排程由本地规划引擎完成。`],
    disclaimer: '这是由本地课程规则生成的候选建议，不构成成绩、考试或作品结果保证。',
  }
}

export const validateDiagnosis = (value: DiagnosisResult) => {
  if (!value.id || !value.courseId || !value.canonicalId || !value.normalizedName || !Array.isArray(value.diagnosticQuiz) || value.diagnosticQuiz.length < 2 || !Array.isArray(value.learningStages) || value.learningStages.length < 2 || value.learningStages.length > 8 || !value.disclaimer) throw new Error('诊断数据字段不完整，请重新生成。')
  return value
}

export const completeDiagnosisAttempt = (data: AppData, diagnosis: DiagnosisResult, answers: Record<string, string>) => {
  if (data.quizEvents.some(event => event.attemptId === diagnosis.attemptId)) throw new Error('这一批诊断已经提交，不能重复写入。')
  if (diagnosis.diagnosticQuiz.some(item => !answers[item.id])) throw new Error('请完成全部诊断题。')
  const scored = diagnosis.diagnosticQuiz.map(item => ({ item, answer: answers[item.id], score: item.scores[answers[item.id]] ?? 0 }))
  const average = scored.reduce((sum, item) => sum + item.score, 0) / Math.max(1, scored.length)
  const weakest = [...scored].sort((a, b) => a.score - b.score).map(item => item.item.point)
  const completed: DiagnosisResult = {
    ...diagnosis,
    status: 'completed',
    completedAt: localTimestamp(),
    confidence: diagnosis.diagnosticQuiz.some(item => item.evidenceType === 'objective_quiz') ? '中' : '低',
    confidenceBasis: diagnosis.diagnosticQuiz.some(item => item.evidenceType === 'objective_quiz')
      ? '已结合课程信息和一批客观基础诊断证据；仍需真实任务或后续可比测验才能提高置信度。'
      : '本次没有客观基础诊断证据；自评或表现任务只能补充定位信息，不能提高到高置信度。',
    currentLevel: average < .7 ? '基础步骤仍需拆分和示范' : average < 1.5 ? '可以完成部分任务，但独立性和稳定性不足' : '基础表现较稳定，可进入应用与迁移验证',
    priorityProblem: weakest[0] || diagnosis.priorityProblem,
    weakKnowledgePoints: [...new Set([...weakest.slice(0, 3), ...diagnosis.weakKnowledgePoints])].slice(0, 4),
    nextAction: '诊断已完成。下一步先预览计划差异，确认后再激活任务。',
  }
  const events: QuizEvent[] = scored.map(({ item, answer, score }) => ({
    id: crypto.randomUUID(), attemptId: diagnosis.attemptId, questionVersion: item.version, source: 'diagnosis', evidenceType: item.evidenceType,
    courseId: diagnosis.courseId, questionId: item.id, point: item.point, score, maxScore: 2, answer, occurredAt: localTimestamp(),
  }))
  return { diagnosis: completed, events }
}

const difficultyRank: Record<ResourceDifficulty, number> = { 入门: 0, 基础: 1, 进阶: 2, 综合: 3 }

export const resourceMatchScore = (resource: LearningResource, course: Course, knowledgePoint = '') => {
  const normalized = normalizeCourseName(course.name, course.ambiguityResolved ? course.canonicalId : '')
  if (!normalized.canonicalId || normalized.ambiguityOptions?.length) return { score: 0, reasons: ['课程尚未完成标准化或消歧。'] }
  const canonical = resource.canonicalCourseIds.includes(normalized.canonicalId)
  const domain = resource.subjectDomains.includes(normalized.subjectDomain)
  const genericDomain = resource.canonicalCourseIds.length === 0 && domain
  if (!canonical && !genericDomain) return { score: 0, reasons: ['资源的稳定课程 ID 与当前课程不一致。'] }
  const point = knowledgePoint ? resource.knowledgePoints.includes(knowledgePoint) : false
  const stage = !resource.educationStages.length || !course.stage || resource.educationStages.includes(course.stage)
  let score = canonical ? 60 : 35
  if (point) score += 20
  if (stage) score += 8
  if (resource.humanVerified) score += 8
  return { score, reasons: [canonical ? `课程 ID 匹配：${normalized.canonicalName}` : `领域匹配：${normalized.subjectDomain}`, point ? `知识点匹配：${knowledgePoint}` : '未指定知识点，按课程匹配', stage ? `适合教育阶段：${course.stage || '未指定'}` : '教育阶段不完全匹配'] }
}

export const resourceMatchesCourse = (resource: LearningResource, course: Course, knowledgePoint = '') => resourceMatchScore(resource, course, knowledgePoint).score > 0

export const bilibiliRecommendationScore = (resource: LearningResource, course: Course, knowledgePoint = '') => {
  const metadata = resource.bilibili
  if (!metadata || !resource.canonicalCourseIds.includes(course.canonicalId)) return { score: 0, breakdown: { knowledge: 0, quality: 0, trust: 0, foundation: 0, popularity: null } }
  const exactPoint = Boolean(knowledgePoint && resource.knowledgePoints.includes(knowledgePoint))
  const partialPoint = Boolean(knowledgePoint && resource.knowledgePoints.some(point => point.includes(knowledgePoint) || knowledgePoint.includes(point)))
  const knowledge = exactPoint ? 100 : partialPoint ? 80 : 60
  const popularity = metadata.popularityScore
  const score = resourceSnapshotScore({ knowledge, quality: metadata.qualityScore, trust: metadata.trustScore, foundation: metadata.foundationMatchScore, popularity })
  return { score, breakdown: { knowledge, quality: metadata.qualityScore, trust: metadata.trustScore, foundation: metadata.foundationMatchScore, popularity } }
}

export const bilibiliAlternatives = (data: AppData, resource: LearningResource) => data.resources
  .filter(item => item.id !== resource.id && item.platform === '哔哩哔哩' && item.healthStatus === 'active' && item.canonicalCourseIds.some(id => resource.canonicalCourseIds.includes(id)))
  .sort((left, right) => {
    const overlap = (item: LearningResource) => item.knowledgePoints.filter(point => resource.knowledgePoints.includes(point)).length
    return overlap(right) - overlap(left) || (right.bilibili?.qualityScore ?? 0) - (left.bilibili?.qualityScore ?? 0)
  })

export const matchingResourcesDetailed = (data: AppData, courseId: string, knowledgePoint = '') => {
  const course = data.courses.find(item => item.id === courseId)
  if (!course) return []
  return data.resources.flatMap(resource => {
    if (resource.status === '不感兴趣') return []
    if (!data.settings.resourcePlatforms.includes(resource.platform)) return []
    if (!data.settings.resourceContentTypes.includes(resource.contentType)) return []
    if (!data.settings.resourceLanguages.some(language => resource.language.includes(language))) return []
    if (difficultyRank[resource.difficulty] > difficultyRank[data.settings.resourceDifficulty]) return []
    if (data.settings.onlyHumanVerified && !resource.humanVerified) return []
    if (!data.settings.acceptShortVideo && (resource.platform === '抖音' || resource.contentType === '视频' && resource.durationMin <= 10)) return []
    if (resource.durationMin > data.settings.maxResourceMinutes) return []
    const match = resourceMatchScore(resource, course, knowledgePoint)
    const preferenceScore = (data.settings.resourcePlatforms.includes(resource.platform) ? 3 : 0)
      + (data.settings.resourceContentTypes.includes(resource.contentType) ? 3 : 0)
      + (resource.durationMin <= Math.round(data.settings.maxResourceMinutes * .75) ? 3 : 0)
      + (resource.difficulty === data.settings.resourceDifficulty || data.settings.resourceDifficulty === '综合' ? 2 : 0)
    return match.score > 0 ? [{ resource, ...match, score: match.score + preferenceScore, reasons: [...match.reasons, `偏好加权：平台、形式、时长与难度 +${preferenceScore}`] }] : []
  }).sort((a, b) => b.score - a.score)
}

export const matchingResources = (data: AppData, courseId: string, knowledgePoint = '') => matchingResourcesDetailed(data, courseId, knowledgePoint).map(item => item.resource)

const planShape = (course: Course) => {
  const band = bandFor(course)
  if (band === 'foundation') return { perStage: 3, duration: 25, practice: 3, quiz: 5, difficulty: '基础' as const, feedback: '每项任务后立即自检' }
  if (band === 'advanced') return { perStage: 1, duration: 45, practice: 10, quiz: 10, difficulty: '进阶' as const, feedback: '使用限时或迁移任务验证' }
  return { perStage: 2, duration: 35, practice: 6, quiz: 8, difficulty: '中等' as const, feedback: '按高频错因复盘' }
}

type TaskBlueprint = {
  title: string
  action: (context: string) => string
  criteria: string[]
  check: string
  taskType: LearningTask['taskType']
  practiceCount: number
  duration: number
  practiceMinutes: number
  quizMinutes: number
  useResource?: boolean
  reason: string
}

/**
 * A plan is useful only when adjacent sessions ask the learner to do
 * different kinds of work. These blueprints keep the local planner explainable
 * while making the route vary by discipline and assessment mode.
 */
const taskBlueprintsFor = (course: Course): TaskBlueprint[] => {
  const isCode = ['编程语言与Web开发', '计算机系统网络与数据库', '人工智能与数据科学'].includes(course.subjectDomain)
  const isDesign = ['平面与图像设计', '矢量设计', '三维建模与CAD', '视频剪辑与动效', 'UIUX与交互设计', '产品设计理论与项目'].includes(course.subjectDomain)
  const isLanguage = course.subjectDomain === '大学英语与语言考试'
  if (course.assessmentMode === 'project' || isDesign) return [
    { title: '案例拆解与标准提取', action: context => `选择一个可公开查看的参考案例，围绕“${context}”标出结构、步骤和质量标准，写下 3 条可复用原则。`, criteria: ['留下参考案例链接或名称', '写出 3 条可复用原则', '把质量标准转成自己的检查清单'], check: '用 2 分钟口述：这个案例的关键决策是什么？', taskType: 'learn', practiceCount: 1, duration: 30, practiceMinutes: 15, quizMinutes: 5, useResource: true, reason: '先建立判断标准，再开始动手。' },
    { title: '最小交付练习', action: context => `关闭教程，独立完成一个只包含“${context}”的最小练习，保留可编辑源文件和过程记录。`, criteria: ['完成一个可打开的最小成果', '保留可编辑源文件或操作记录', '记录至少一个卡点'], check: '检查自己是否能不看教程重复完成关键步骤。', taskType: 'project', practiceCount: 1, duration: 45, practiceMinutes: 35, quizMinutes: 5, reason: '把理解转成独立操作，而不是继续观看。' },
    { title: '质量检查与迭代', action: context => `用检查清单复查“${context}”练习，至少做一轮有依据的修改，并记录修改前后的差异。`, criteria: ['完成一轮有依据的修改', '指出一个结构问题和一个表现问题', '保存修改前后对照'], check: '能否说明这次修改改善了什么，而不是只说“更好看”？', taskType: 'review', practiceCount: 1, duration: 35, practiceMinutes: 25, quizMinutes: 5, reason: '训练作品质量判断和迭代能力。' },
    { title: '迁移到个人主题', action: context => `把“${context}”应用到一个新的个人主题或需求，限制自己不照抄参考案例。`, criteria: ['完成一个新的主题版本', '说明至少一次方法调整', '列出下一轮可改善的 2 个点'], check: '用 3 分钟解释：新主题为什么需要不同处理？', taskType: 'project', practiceCount: 1, duration: 45, practiceMinutes: 35, quizMinutes: 5, reason: '用迁移结果验证是否真的掌握。' },
  ]
  if (isCode) return [
    { title: '概念建模与最小运行', action: context => `不看完整示例，先写出“${context}”的输入、输出和最小调用，再运行一个最小版本。`, criteria: ['写出输入与输出', '最小版本可以运行或明确报错位置', '记录一个仍不理解的概念'], check: '不用打开教程，解释这个概念什么时候不适用。', taskType: 'learn', practiceCount: 1, duration: 30, practiceMinutes: 15, quizMinutes: 5, useResource: true, reason: '先建立可验证的心智模型。' },
    { title: '独立编码任务', action: context => `完成一个不复制示例的“${context}”小任务，先写伪代码，再实现并保存可复现步骤。`, criteria: ['伪代码与实现对应', '输入、输出可以复核', '至少完成一次独立调试'], check: '把代码交给未来的自己，写出最短复现步骤。', taskType: 'practice', practiceCount: 1, duration: 45, practiceMinutes: 35, quizMinutes: 5, reason: '从跟随实现过渡到独立解决。' },
    { title: '边界测试与调试记录', action: context => `为“${context}”设计 3 个边界输入，运行后按现象、假设、修改记录一次调试过程。`, criteria: ['覆盖正常、空值或异常输入', '记录现象与假设', '说明修改后结果'], check: '指出一个当前实现仍然可能失败的边界。', taskType: 'review', practiceCount: 3, duration: 35, practiceMinutes: 25, quizMinutes: 5, reason: '把“能运行”升级为“可复核、可维护”。' },
    { title: '迁移实现与讲解', action: context => `把“${context}”放进一个不同的小场景，完成实现后用 5 句话解释关键取舍。`, criteria: ['完成新场景实现', '写出关键取舍', '保留一次失败尝试或修正说明'], check: '不看代码，讲清输入如何变成输出。', taskType: 'project', practiceCount: 1, duration: 45, practiceMinutes: 35, quizMinutes: 5, reason: '通过迁移验证是否脱离示例也能工作。' },
  ]
  if (isLanguage) return [
    { title: '输入与词汇提取', action: context => `围绕“${context}”完成一段可理解输入，提取 8–12 个真正影响理解的词组或表达，并写出语境。`, criteria: ['完成一段听读输入', '提取 8–12 个语境词组', '合上材料复述大意'], check: '合上原文，用自己的话复述主要信息。', taskType: 'learn', practiceCount: 10, duration: 30, practiceMinutes: 15, quizMinutes: 5, useResource: true, reason: '用语境建立输入，而不是孤立背词。' },
    { title: '间隔提取练习', action: context => `不看答案回忆“${context}”中的重点表达，完成 2 轮提取，第二轮只复习第一轮漏掉的内容。`, criteria: ['完成两轮提取', '记录第一次漏掉的内容', '第二轮正确提取率有记录'], check: '随机抽 5 个表达，说明含义和使用场景。', taskType: 'practice', practiceCount: 2, duration: 25, practiceMinutes: 15, quizMinutes: 5, reason: '用提取而不是重复阅读建立记忆。' },
    { title: '输出与纠错', action: context => `用“${context}”写一段 80–120 字短文或完成 2 分钟口述，随后按语法、用词和表达结构做一次自我纠错。`, criteria: ['完成一次不看范文的输出', '标出至少 3 个可改进点', '写出一条下一次输出规则'], check: '重新输出同一观点，比较前后表达是否更准确。', taskType: 'practice', practiceCount: 1, duration: 35, practiceMinutes: 25, quizMinutes: 5, reason: '把输入转成可观察的输出证据。' },
    { title: '限时模拟与复盘', action: context => `完成一组“${context}”限时练习，结束后按时间分配、错误类型和不确定答案复盘。`, criteria: ['保留限时结果', '错误按类型归类', '确定下一次只改一个策略'], check: '说明这次错误是知识、策略还是时间问题。', taskType: 'quiz', practiceCount: 1, duration: 45, practiceMinutes: 30, quizMinutes: 10, reason: '用限时场景检验稳定性，而非只看熟悉度。' },
  ]
  return [
    { title: '概念复述与前置检查', action: context => `不看完整答案，写出“${context}”的定义、适用条件和一个最小例子，再对照材料修正遗漏。`, criteria: ['写出定义或核心关系', '写出适用条件', '记录一次对照修正'], check: '用自己的话解释：什么时候不能直接套这个方法？', taskType: 'learn', practiceCount: 1, duration: 30, practiceMinutes: 15, quizMinutes: 5, useResource: true, reason: '先确认前置概念，减少后续重复返工。' },
    { title: '分层练习与步骤标注', action: context => `完成 5–8 道或一个同等规模的“${context}”基础练习，给每一步标注依据，不照抄示例。`, criteria: ['完成 5–8 道练习', '标出每道题的关键步骤', '正确率或未达原因有记录'], check: '随机挑一道，遮住答案重新写出关键步骤。', taskType: 'practice', practiceCount: 6, duration: 35, practiceMinutes: 25, quizMinutes: 5, reason: '把“看懂”转成可重复的解题步骤。' },
    { title: '错因归档与同类修正', action: context => `复查最近一次“${context}”未达项，按概念、步骤、检查或表达分类，再完成一个同类新任务。`, criteria: ['明确一个错因分类', '完成一个同类新任务', '写出避免复发的检查动作'], check: '解释这次错误以后如何在 30 秒内被发现。', taskType: 'review', practiceCount: 1, duration: 30, practiceMinutes: 20, quizMinutes: 5, reason: '让错误进入下一次行动，而不是停留在总结。' },
    { title: '限时迁移小测', action: context => `在限定时间内完成一个条件不同的新题或新案例，结束后按完成标准逐项检查“${context}”。`, criteria: ['完成一项限时迁移任务', '记录用时和不确定点', '按标准完成自检'], check: '说明新任务与练习题相比，条件发生了什么变化。', taskType: 'quiz', practiceCount: 1, duration: 40, practiceMinutes: 25, quizMinutes: 10, reason: '检验是否能把方法带到新情境。' },
  ]
}

export const buildCandidateTasks = (data: AppData, input: DiagnosisResult | PlanningBasis, planId = crypto.randomUUID()): LearningTask[] => {
  const course = data.courses.find(item => item.id === input.courseId)
  if (!course) return []
  const shape = planShape(course)
  const intelligence = getCourseIntelligence(course, data.schedule)
  const completedDiagnosis = 'learningStages' in input ? input : input.source === 'completed-diagnosis' ? data.diagnoses[course.id] : undefined
  const stages = completedDiagnosis?.status === 'completed' ? completedDiagnosis.learningStages : intelligence.learningStages
  const priorityProblems = 'weakKnowledgePoints' in input ? input.weakKnowledgePoints : input.priorityProblems
  return stages.flatMap((stage, stageIndex) => Array.from({ length: shape.perStage }, (_, partIndex) => {
    const point = priorityProblems[(stageIndex + partIndex) % Math.max(1, priorityProblems.length)] || stage.focus
    const resource = matchingResources(data, course.id, point)[0] ?? matchingResources(data, course.id)[0]
    const blueprint = taskBlueprintsFor(course)[(stageIndex + partIndex) % taskBlueprintsFor(course).length]
    const useResource = Boolean(blueprint.useResource && resource)
    const watch = useResource ? Math.min(resource?.durationMin ?? 0, Math.max(0, data.schedule.maxFocusMinutes - blueprint.practiceMinutes - blueprint.quizMinutes)) : 0
    const estimated = Math.max(15, Math.min(data.schedule.maxFocusMinutes, Math.max(shape.duration, blueprint.duration, watch + blueprint.practiceMinutes + blueprint.quizMinutes)))
    const context = point || stage.focus
    const materialPrefix = useResource && resource ? `先学习“${resource.title}”（约 ${resource.durationMin} 分钟），` : ''
    const action = `${materialPrefix}${blueprint.action(context)}`
    const criteria = blueprint.criteria
    return createTask({
      planId, date: '', originalPlannedDate: '', time: '', title: `${course.name} · ${stage.title} · ${blueprint.title}`,
      action,
      courseId: course.id, stageLabel: stage.week, stageStartDate: stage.startDate, stageEndDate: stage.endDate, knowledgePoint: point, unitId: intelligence.curriculumUnits[stageIndex % Math.max(1, intelligence.curriculumUnits.length)]?.id ?? stage.week, resourceId: useResource ? resource?.id ?? '' : '', materialLabel: useResource ? resource?.title ?? '' : '',
      resourceIds: useResource && resource ? [resource.id] : [],
      watchMinutes: watch, practiceMinutes: Math.max(5, estimated - watch - blueprint.quizMinutes), quizMinutes: blueprint.quizMinutes, practiceCount: blueprint.practiceCount,
      quizTask: blueprint.check, completionCriteria: criteria.join('；'), arrangementReason: `${course.priority ? '当前优先课程' : '按课程目标差距分配'}；${stage.focus}；${blueprint.reason}`, estimatedMinutes: estimated, difficulty: stage.difficulty || shape.difficulty,
      completionCriteriaItems: criteria, reviewAt: addDays(stage.endDate, 1), source: 'system', taskType: blueprint.taskType,
      status: '待确认', scheduleStatus: 'needs-confirmation', scheduleIssue: '等待全局排程', changeNote: `${stage.week}候选任务 · ${blueprint.title} · 本地规则`, order: stageIndex * 10 + partIndex,
    })
  }))
}

export const buildHolidayPlan = (data: AppData, diagnosis: DiagnosisResult): LearningTask[] => {
  const planId = crypto.randomUUID()
  return scheduleTasks(buildCandidateTasks(data, diagnosis, planId), data.courses, data.schedule, data.tasks).filter(task => task.planId === planId)
}
export const buildSixWeekPlan = buildHolidayPlan

export const previewPlanForCourse = (data: AppData, courseId: string) => {
  const diagnosis = data.diagnoses[courseId]
  const course = data.courses.find(item => item.id === courseId)
  if (!diagnosis || diagnosis.status !== 'completed') throw new Error('请先完成当前课程的基础诊断。')
  if (!course) throw new Error('课程不存在。')
  const planId = crypto.randomUUID()
  const protectedTasks = data.tasks.filter(task => task.status === '已完成' || task.status === '进行中' || task.courseId !== courseId)
  const scheduled = scheduleTasks(buildCandidateTasks(data, diagnosis, planId), data.courses, data.schedule, protectedTasks).filter(task => task.planId === planId)
  const version = Math.max(0, ...data.plans.filter(plan => plan.courseId === courseId && plan.status !== 'draft').map(plan => plan.version)) + 1
  const plan: PlanSnapshot = {
    id: planId, version, courseId, diagnosisId: diagnosis.id, diagnosisVersion: diagnosis.version, inputSnapshotHash: inputSnapshotHash(course, data.schedule),
    generatedAt: localTimestamp(), activatedAt: '', status: 'draft', taskIds: scheduled.map(task => task.id), pendingTaskIds: scheduled.filter(task => task.scheduleStatus === 'needs-confirmation').map(task => task.id), staleReasons: [],
  }
  return { plan, tasks: scheduled }
}

export const planDiff = (before: LearningTask[], after: LearningTask[]) => {
  const semanticKey = (task: LearningTask) => `${task.courseId}|${task.stageLabel}|${task.order}|${task.knowledgePoint}`
  const beforeById = new Map(before.map(task => [task.id, task]))
  const beforeBySemantic = new Map(before.map(task => [semanticKey(task), task]))
  const matchedBefore = new Set<string>()
  const pairs = after.map(task => {
    const previous = beforeById.get(task.id) ?? beforeBySemantic.get(semanticKey(task))
    if (previous) matchedBefore.add(previous.id)
    return { task, previous }
  })
  return {
    added: pairs.filter(item => !item.previous).map(item => item.task),
    removed: before.filter(task => !matchedBefore.has(task.id) && task.status !== '已完成'),
    moved: pairs.filter(item => item.previous && item.previous.date !== item.task.date).map(item => item.task),
    shortened: pairs.filter(item => item.previous && item.previous.estimatedMinutes > item.task.estimatedMinutes).map(item => item.task),
    extended: pairs.filter(item => item.previous && item.previous.estimatedMinutes < item.task.estimatedMinutes).map(item => item.task),
    resourceChanged: pairs.filter(item => item.previous && item.previous.resourceId !== item.task.resourceId).map(item => item.task),
  }
}

export const validatePlanDraftLegacy = (data: AppData, plan: PlanSnapshot, draftTasks: LearningTask[]) => {
  const reasons: string[] = []
  const course = data.courses.find(item => item.id === plan.courseId)
  const diagnosis = data.diagnoses[plan.courseId]
  if (!course || !diagnosis || diagnosis.id !== plan.diagnosisId || diagnosis.version !== plan.diagnosisVersion) reasons.push('草案引用的课程或诊断版本已失效。')
  if (!draftTasks.length) reasons.push('计划草案没有任务。')
  const protectedTasks = data.tasks.filter(task => task.courseId !== plan.courseId || task.status === '已完成' || task.status === '进行中')
  const combined = [...protectedTasks, ...draftTasks]
  const dayMinutes = new Map<string, number>()
  const occupied = new Set<string>()
  const knowledgeDates = new Map<string, string[]>()
  draftTasks.forEach(task => {
    if (!task.title.trim() || !task.knowledgePoint.trim() || !task.completionCriteria.trim() || !task.arrangementReason.trim()) reasons.push(`任务“${task.title || task.id}”缺少知识点、完成标准或安排原因。`)
    if (task.scheduleStatus !== 'scheduled' || !task.date || !task.slotId) reasons.push(`任务“${task.title || task.id}”尚未找到可用节次。`)
    if (task.date && !inDateRange(task.date, data.schedule.holidayStart, data.schedule.holidayEnd)) reasons.push(`任务“${task.title}”超出假期日期。`)
    if (task.date && task.stageStartDate && task.stageEndDate && !inDateRange(task.date, task.stageStartDate, task.stageEndDate)) reasons.push(`任务“${task.title}”超出所属阶段日期。`)
    if (task.date && capacityForDate(task.date, data.schedule) <= 0) reasons.push(`任务“${task.title}”安排在休息、旅行或不可用日期。`)
    const slot = data.schedule.timeSlots.find(item => item.id === task.slotId)
    if (!slot?.enabled) reasons.push(`任务“${task.title}”使用了禁用节次。`)
    if (slot && task.estimatedMinutes > Math.min(slotDuration(slot), data.schedule.maxFocusMinutes)) reasons.push(`任务“${task.title}”超过单节或专注时长。`)
    if (task.date && task.slotId) {
      const key = `${task.date}|${task.slotId}`
      if (occupied.has(key) || protectedTasks.some(item => item.date === task.date && item.slotId === task.slotId && item.status !== '已跳过')) reasons.push(`任务“${task.title}”与已有任务重叠。`)
      occupied.add(key)
      dayMinutes.set(task.date, (dayMinutes.get(task.date) ?? 0) + task.estimatedMinutes)
      const pointKey = `${task.courseId}|${task.knowledgePoint}`
      knowledgeDates.set(pointKey, [...(knowledgeDates.get(pointKey) ?? []), task.date])
    }
    if (task.resourceId) {
      const resource = data.resources.find(item => item.id === task.resourceId)
      if (!resource || !course || !resourceMatchesCourse(resource, course, task.knowledgePoint)) reasons.push(`任务“${task.title}”的资源与课程或知识点不匹配。`)
    }
  })
  dayMinutes.forEach((minutes, date) => {
    const protectedMinutes = protectedTasks.filter(task => task.date === date && task.status !== '已跳过').reduce((sum, task) => sum + task.estimatedMinutes, 0)
    if (minutes + protectedMinutes > capacityForDate(date, data.schedule)) reasons.push(`${date} 的任务总时长超过每日可用容量。`)
  })
  knowledgeDates.forEach((dates, key) => {
    const sorted = [...dates].sort()
    if (sorted.some((date, index) => index > 0 && date <= sorted[index - 1])) reasons.push(`知识点“${key.split('|')[1]}”的复习间隔不足。`)
  })
  if (diagnosis && diagnosis.learningStages.some((stage, index, stages) => index > 0 && stage.startDate < stages[index - 1].startDate)) reasons.push('后置学习阶段早于前置阶段。')
  combined.forEach(task => {
    if (task.date && task.scheduleStatus === 'scheduled' && !data.schedule.timeSlots.some(slot => slot.id === task.slotId && slot.enabled)) reasons.push(`任务“${task.title}”没有有效节次。`)
  })
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] }
}

export const validatePlanDraft = (data: AppData, plan: PlanSnapshot, draftTasks: LearningTask[]) => {
  const reasons: string[] = []
  const course = data.courses.find(item => item.id === plan.courseId)
  const diagnosis = data.diagnoses[plan.courseId]
  if (!course || !diagnosis || diagnosis.id !== plan.diagnosisId || diagnosis.version !== plan.diagnosisVersion) reasons.push('计划引用的课程或诊断版本已失效。')
  if (!draftTasks.length) reasons.push('计划草案没有任务。')
  const occupied = new Set(data.tasks
    .filter(task => (task.courseId !== plan.courseId || task.status === '已完成' || task.status === '进行中') && task.scheduleStatus === 'scheduled' && task.status !== '已跳过')
    .map(task => `${task.date}|${task.slotId}`))
  const dayMinutes = new Map<string, number>()
  draftTasks.forEach(task => {
    if (!task.title.trim() || !task.knowledgePoint.trim() || !task.completionCriteria.trim() || !task.arrangementReason.trim()) reasons.push('任务缺少知识点、完成标准或安排原因。')
    const placed = task.scheduleStatus === 'scheduled' && Boolean(task.date && task.slotId)
    if (!placed) return
    const slot = data.schedule.timeSlots.find(item => item.id === task.slotId && item.enabled)
    if (!slot) reasons.push('已安排任务使用了不可用节次。')
    if (slot && task.estimatedMinutes > Math.min(slotDuration(slot), data.schedule.maxFocusMinutes)) reasons.push('任务超过单节或专注时长。')
    if (task.date && capacityForDate(task.date, data.schedule) <= 0) reasons.push('任务安排在休息、旅行或不可用日期。')
    const key = `${task.date}|${task.slotId}`
    if (occupied.has(key)) reasons.push('同一节次已有任务。')
    occupied.add(key)
    if (task.date) dayMinutes.set(task.date, (dayMinutes.get(task.date) ?? 0) + task.estimatedMinutes)
    if (task.resourceId) {
      const resource = data.resources.find(item => item.id === task.resourceId)
      if (!resource || !course || !resourceMatchesCourse(resource, course, task.knowledgePoint)) reasons.push('任务资源与课程或知识点不匹配。')
    }
  })
  if (data.schedule.strictDailyCapacity) dayMinutes.forEach((minutes, date) => {
    if (minutes > capacityForDate(date, data.schedule)) reasons.push('某一天超过了严格学习时长上限。')
  })
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] }
}

export const activatePlanPreview = (data: AppData, plan: PlanSnapshot, draftTasks: LearningTask[]) => {
  const validation = validatePlanDraft(data, plan, draftTasks)
  if (!validation.valid) throw new Error(`计划草案未通过规则校验：${validation.reasons.join(' ')}`)
  const completed = data.tasks.filter(task => task.courseId === plan.courseId && task.status === '已完成')
  const otherCourse = data.tasks.filter(task => task.courseId !== plan.courseId)
  const nextTasks = [...otherCourse, ...completed, ...draftTasks.map(task => ({ ...task, status: task.scheduleStatus === 'scheduled' ? '待完成' as const : '待确认' as const }))]
  const changeSet = createTaskChangeSet(data.tasks, nextTasks, '确认并激活学习计划', { scope: 'plan', courseId: plan.courseId })
  const currentPlan = [...data.plans].reverse().find(item => item.courseId === plan.courseId && (item.status === 'active' || item.status === 'stale'))
  const currentSnapshot = currentPlan ? data.tasks.filter(task => task.courseId === plan.courseId).map(task => ({ ...task })) : []
  return reconcileScheduleDomain({
    ...data,
    tasks: nextTasks,
    planDrafts: { ...data.planDrafts, [plan.courseId]: [] },
    planTaskArchive: { ...data.planTaskArchive, ...(currentPlan ? { [currentPlan.id]: currentSnapshot } : {}), [plan.id]: draftTasks.map(task => ({ ...task, status: task.scheduleStatus === 'scheduled' ? '待完成' as const : '待确认' as const })) },
    plans: [...data.plans.filter(item => item.id !== plan.id).map(item => item.courseId === plan.courseId && (item.status === 'active' || item.status === 'stale' || item.status === 'draft') ? { ...item, status: 'archived' as const } : item), { ...plan, status: 'active' as const, activatedAt: localTimestamp() }],
    changeSets: [...data.changeSets, changeSet],
    taskEvents: [...data.taskEvents, ...draftTasks.map(task => recordTaskEvent(task, 'created', '用户确认并激活计划'))],
    planChanges: [`已确认并激活 ${data.courses.find(course => course.id === plan.courseId)?.name ?? '课程'} 的第 ${plan.version} 版计划。`, ...data.planChanges],
  })
}

export const restorePlanVersion = (data: AppData, planId: string) => {
  const target = data.plans.find(plan => plan.id === planId)
  const snapshot = data.planTaskArchive[planId]
  if (!target || !snapshot?.length) throw new Error('这个计划版本没有可恢复的任务快照。')
  const currentPlan = [...data.plans].reverse().find(plan => plan.courseId === target.courseId && (plan.status === 'active' || plan.status === 'stale'))
  const currentCourseTasks = data.tasks.filter(task => task.courseId === target.courseId)
  const protectedCompleted = currentCourseTasks.filter(task => task.status === '已完成')
  const restored = snapshot.filter(task => !protectedCompleted.some(item => item.id === task.id)).map(task => ({ ...task }))
  const nextTasks = [...data.tasks.filter(task => task.courseId !== target.courseId), ...protectedCompleted, ...restored]
  const changeSet = createTaskChangeSet(data.tasks, nextTasks, `恢复 ${data.courses.find(course => course.id === target.courseId)?.name ?? '课程'} 第 ${target.version} 版计划`, { scope: 'plan', courseId: target.courseId })
  return reconcileScheduleDomain({
    ...data,
    tasks: nextTasks,
    planTaskArchive: { ...data.planTaskArchive, ...(currentPlan ? { [currentPlan.id]: currentCourseTasks.map(task => ({ ...task })) } : {}) },
    plans: data.plans.map(plan => plan.courseId !== target.courseId ? plan : plan.id === target.id ? { ...plan, status: 'active' as const, activatedAt: localTimestamp() } : (plan.status === 'active' || plan.status === 'stale') ? { ...plan, status: 'archived' as const } : plan),
    changeSets: [...data.changeSets, changeSet],
    planChanges: [`已恢复第 ${target.version} 版计划；已完成任务保持不变。`, ...data.planChanges],
  })
}

export const createTaskFromResource = (resource: LearningResource, course: Course, date: string, stageLabel: string, maxFocusMinutes: number, order: number) => createTask({
  date, originalPlannedDate: date, time: '19:30', slotId: 'evening-1', title: `${course.name} · 资源学习`, courseId: course.id, stageLabel,
  knowledgePoint: resource.knowledgePoints[0] || '自定义知识点', unitId: stageLabel, resourceId: resource.id, materialLabel: resource.title,
  watchMinutes: Math.min(resource.durationMin, Math.max(0, maxFocusMinutes - 15)), practiceMinutes: 10, quizMinutes: 5,
  practiceCount: resource.contentType === '项目任务' ? 1 : 4, quizTask: `完成“${resource.knowledgePoints[0] || course.name}”自检`,
  completionCriteria: '完成材料，并记录一个可复述的要点或成果。', arrangementReason: '用户从资源页选择并指定了课程与节次。', estimatedMinutes: Math.min(resource.durationMin + 15, maxFocusMinutes), changeNote: '从学习资源页加入计划', order,
})

export const createTasksFromResource = (
  data: AppData,
  resource: LearningResource,
  course: Course,
  date: string,
  stageLabel: string,
  options: { slotId?: string; knowledgePoint?: string; practiceTask?: string } = {},
) => {
  const requestedSlot = data.schedule.timeSlots.find(slot => slot.id === options.slotId)
  const base = createTaskFromResource(resource, course, date, stageLabel, Math.max(data.schedule.maxFocusMinutes, resource.durationMin + 15), data.tasks.length)
  const configured = {
    ...base,
    slotId: requestedSlot?.id ?? base.slotId,
    time: requestedSlot?.start ?? base.time,
    knowledgePoint: options.knowledgePoint?.trim() || base.knowledgePoint,
    quizTask: options.practiceTask?.trim() || base.quizTask,
    completionCriteria: options.practiceTask?.trim()
      ? `完成资源学习，并完成：${options.practiceTask.trim()}`
      : base.completionCriteria,
  }
  const parts = tasksFromResource(resource, course, configured, data.schedule)
  const temporary = parts.map((task, index) => ({ ...task, date: index === 0 ? date : '', originalPlannedDate: index === 0 ? date : '', time: index === 0 ? task.time : '' }))
  const scheduled = scheduleTasks(temporary, data.courses, data.schedule, data.tasks, undefined, { preserveRequestedDates: true }).filter(task => temporary.some(item => item.id === task.id))
  return scheduled
}

const wait = (ms: number) => new Promise(resolve => globalThis.setTimeout(resolve, ms))
export interface PlanningProvider {
  generateDiagnosis(data: AppData, courseId?: string): Promise<ProviderResult<DiagnosisResult>>
  adjustPlan(prompt: string, data: AppData): Promise<ProviderResult<PlanAdjustment>>
}

const futurePending = (tasks: LearningTask[]) => tasks.filter(task => (task.status === '待完成' || task.status === '已延期') && (!task.date || task.date >= localDateISO()))

export const localPlanningProvider: PlanningProvider = {
  async generateDiagnosis(data, courseId) {
    await wait(180)
    return { data: validateDiagnosis(buildDiagnosis(data, courseId)), provider: 'local-rules', generatedAt: localTimestamp() }
  },
  async adjustPlan(prompt, data) {
    if (!prompt.trim()) throw new Error('请先描述需要调整的安排。')
    await wait(180)
    const text = prompt.trim()
    // Recovery always starts with observable evidence and an explicit option. This
    // prevents the legacy keyword path from silently dropping every third task.
    if (/连续未完成|减少学习量|少学|恢复计划|计划被打断/.test(text)) {
      const signals = detectRecoverySignals(data)
      const proposal = buildRecoveryProposal(data, signals)
      if (!proposal) return { data: { message: '当前还没有达到触发恢复调整的执行证据。请先记录实际完成、跳过原因或连续三天的执行情况。', changedTaskIds: [], tasks: data.tasks, changeNote: '', reasons: [] }, provider: 'local-rules', generatedAt: localTimestamp() }
      const chosen = proposal.options.find(option => option.type === 'reduce_daily_load')!
      const preview = chosen.changeSetPreview
      return { data: { message: `恢复建议：${chosen.title}`, changedTaskIds: preview?.changes.map(change => change.entityId) ?? [], tasks: preview ? preview.changes.reduce((next, change) => {
        if (change.entityId.startsWith('__')) return next
        const after = change.after as unknown as LearningTask
        return after && after.id ? [...next.filter(task => task.id !== after.id), after] : next.filter(task => task.id !== change.entityId)
      }, data.tasks) : data.tasks, changeNote: chosen.explanation, reasons: signals.map(item => item.explanation), changeSet: preview }, provider: 'local-rules', generatedAt: localTimestamp() }
    }
    let schedulePatch: PlanAdjustment['schedulePatch']
    let constraintDraft: PlanAdjustment['constraintDraft']
    let coursePatches: PlanAdjustment['coursePatches']
    let schedulingCourses = data.courses
    let candidates = data.tasks.map(task => ({ ...task }))
    const reasons: string[] = []
    let message: string
    if (/旅行/.test(text)) {
      const days = Number(text.match(/(\d+)\s*天/)?.[1] ?? 3)
      if (!/下周|\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日/.test(text)) return { data: { message: '需要确认旅行日期。', changedTaskIds: [], tasks: data.tasks, changeNote: '', reasons: [], needsClarification: true, clarificationQuestion: '这次旅行从哪一天开始？' }, provider: 'local-rules', generatedAt: localTimestamp() }
      const chineseDate = text.match(/(\d{1,2})月(\d{1,2})日/)
      const start = text.includes('下周') ? mondayOfWeek(addDays(localDateISO(), 7)) : text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? (chineseDate ? `${localDateISO().slice(0, 4)}-${String(chineseDate[1]).padStart(2, '0')}-${String(chineseDate[2]).padStart(2, '0')}` : mondayOfWeek(addDays(localDateISO(), 7)))
      const end = addDays(start, days - 1)
      constraintDraft = { id: crypto.randomUUID(), startAt: `${start}T00:00:00+08:00`, endAt: `${end}T23:59:59+08:00`, type: 'travel', capacityMinutes: 0, note: `${days} 天旅行` }
      schedulePatch = { constraints: [...data.schedule.constraints, constraintDraft] }
      message = `为 ${start} 至 ${end} 的旅行重新安排冲突任务。`
      reasons.push(`旅行日期已结构化为 ${start} 至 ${end}，期间容量为 0。`)
    } else if (/每天.*(?:最多|上限)|时间变少/.test(text)) {
      const minutes = text.match(/(\d+)\s*小时/) ? Number(text.match(/(\d+)\s*小时/)![1]) * 60 : Number(text.match(/(\d+)\s*分钟/)?.[1] ?? Math.max(30, Math.round(data.schedule.weekdayMinutes * .75)))
      schedulePatch = { weekdayMinutes: minutes, weekendMinutes: Math.min(data.schedule.weekendMinutes, minutes) }
      message = `把未来每日容量调整为不超过 ${minutes} 分钟并重新排程。`
      reasons.push('容量变化会作用于全部未来未完成任务，不只缩短第一项。')
    } else if (/任务太难|太难|不会/.test(text)) {
      const target = futurePending(candidates)[0]
      if (!target) return { data: { message: '没有可拆分的未来任务。', changedTaskIds: [], tasks: data.tasks, changeNote: '', reasons: [] }, provider: 'local-rules', generatedAt: localTimestamp() }
      const prerequisite = createTask({ ...target, id: crypto.randomUUID(), title: `${target.title} · 前置步骤`, resourceId: '', materialLabel: '', estimatedMinutes: Math.max(15, Math.round(target.estimatedMinutes * .45)), practiceCount: Math.max(1, Math.ceil(target.practiceCount / 3)), order: target.order - .5, changeNote: '任务太难：增加前置步骤' })
      candidates = candidates.map(task => task.id === target.id ? { ...task, estimatedMinutes: Math.max(20, Math.round(task.estimatedMinutes * .65)), practiceCount: Math.max(1, Math.ceil(task.practiceCount / 2)), changeNote: '任务太难：降低单次负担' } : task).concat(prerequisite)
      message = `已为“${target.title}”增加前置任务并降低单次练习量。`
      reasons.push('原任务被拆分，前置任务将先安排。')
    } else if (/连续未完成/.test(text)) {
      const affectedIds = new Set(data.taskEvents.filter(event => event.type === 'skipped' || event.type === 'delayed').slice(-5).map(event => event.taskId))
      if (!affectedIds.size) return { data: { message: '暂时没有连续未完成记录。', changedTaskIds: [], tasks: data.tasks, changeNote: '', reasons: [], needsClarification: true, clarificationQuestion: '主要是时间不足、任务太难，还是资源不合适？' }, provider: 'local-rules', generatedAt: localTimestamp() }
      candidates = candidates.map(task => affectedIds.has(task.id) ? { ...task, estimatedMinutes: Math.max(20, Math.round(task.estimatedMinutes * .7)), practiceCount: Math.max(1, Math.ceil(task.practiceCount / 2)), changeNote: '根据连续未完成记录拆短' } : task)
      message = '根据最近延期和跳过记录拆短了相关任务。'
      reasons.push('只处理有未完成事件的任务。')
    } else if (/减少学习量|少学/.test(text)) {
      const pending = futurePending(candidates)
      const removeIds = new Set(pending.filter((_, index) => index % 3 === 2).map(task => task.id))
      candidates = candidates.filter(task => !removeIds.has(task.id)).map(task => pending.some(item => item.id === task.id) ? { ...task, estimatedMinutes: Math.max(20, Math.round(task.estimatedMinutes * .85)), changeNote: '降低未来总学习量' } : task)
      message = '降低了未来总任务量和单次时长。'
      reasons.push(`移除 ${removeIds.size} 项低优先任务，其余未来任务缩短约 15%。`)
    } else if (/增加学习量|多学/.test(text)) {
      const target = data.courses.find(course => course.priority) ?? data.courses[0]
      const source = futurePending(candidates).find(task => task.courseId === target?.id)
      if (!source || !target) return { data: { message: '没有可扩展的课程任务。', changedTaskIds: [], tasks: data.tasks, changeNote: '', reasons: [] }, provider: 'local-rules', generatedAt: localTimestamp() }
      candidates.push(createTask({ ...source, id: crypto.randomUUID(), title: `${source.title} · 迁移练习`, resourceId: '', materialLabel: '', estimatedMinutes: Math.min(data.schedule.maxFocusMinutes, 25), practiceCount: Math.max(1, Math.ceil(source.practiceCount / 2)), changeNote: '增加学习量：新增迁移练习', order: source.order + .5 }))
      message = `为优先课程“${target.name}”增加一项迁移练习。`
      reasons.push('新增任务仍受每日容量和专注上限约束。')
    } else if (/调整课程优先级|优先/.test(text)) {
      const selected = data.courses.find(course => text.toLocaleLowerCase('zh-CN').includes(course.name.toLocaleLowerCase('zh-CN')) || course.canonicalName && text.toLocaleLowerCase('zh-CN').includes(course.canonicalName.toLocaleLowerCase('zh-CN')))
      const direction = /调高|提高|优先处理|更优先/.test(text) ? 'up' : /调低|降低|不优先/.test(text) ? 'down' : ''
      if (!selected || !direction) return { data: { message: '需要选择课程和新优先级。', changedTaskIds: [], tasks: data.tasks, changeNote: '', reasons: [], needsClarification: true, clarificationQuestion: `请选择课程：${data.courses.map(course => course.name).join('、')}，并说明要调高还是调低。` }, provider: 'local-rules', generatedAt: localTimestamp() }
      schedulingCourses = data.courses.map(course => course.id === selected.id ? { ...course, priority: direction === 'up', priorityWeight: direction === 'up' ? Math.max(2, course.priorityWeight + 1) : Math.max(1, course.priorityWeight - 1) } : direction === 'up' ? { ...course, priority: false } : course)
      coursePatches = schedulingCourses.map(course => ({ id: course.id, priority: course.priority, priorityWeight: course.priorityWeight }))
      message = `${direction === 'up' ? '提高' : '降低'}“${selected.name}”的排程优先级并重新分配未来容量。`
      reasons.push('只改变课程权重，所有任务仍遵守总容量和时间冲突检查。')
    } else {
      return { data: { message: '我还不能确定要修改什么。', changedTaskIds: [], tasks: data.tasks, changeNote: '', reasons: [], needsClarification: true, clarificationQuestion: '请说明是时间、旅行、难度、课程优先级，还是学习量发生变化。' }, provider: 'local-rules', generatedAt: localTimestamp() }
    }
    const nextSchedule = { ...data.schedule, ...schedulePatch }
    const protectedTasks = candidates.filter(task => task.status === '已完成' || task.status === '进行中')
    const toSchedule = candidates.filter(task => task.status !== '已完成' && task.status !== '进行中').map(task => ({ ...task, date: '', time: '', scheduleStatus: 'needs-confirmation' as const }))
    const nextTasks = scheduleTasks(toSchedule, schedulingCourses, nextSchedule, protectedTasks)
    const changeSet = createTaskChangeSet(data.tasks, nextTasks, message, { scope: 'plan' })
    if (coursePatches) changeSet.changes.push(...schedulingCourses.filter(course => data.courses.some(before => before.id === course.id && (before.priority !== course.priority || before.priorityWeight !== course.priorityWeight))).map(course => ({ entityId: `__course:${course.id}`, before: { ...data.courses.find(item => item.id === course.id)! }, after: { ...course } })))
    return { data: { message, changedTaskIds: changeSet.changes.map(change => change.entityId), tasks: nextTasks, changeNote: message, reasons, schedulePatch, constraintDraft, changeSet, coursePatches }, provider: 'local-rules', generatedAt: localTimestamp() }
  },
}

export const mockPlanningProvider = localPlanningProvider

export const recordTaskEvent = (
  task: LearningTask,
  type: TaskEvent['type'],
  detail: string,
  actualMinutes = 0,
  completion?: Pick<TaskEvent, 'completionDegree' | 'note' | 'continueNeeded'>,
): TaskEvent => ({
  id: crypto.randomUUID(), taskId: task.id, courseId: task.courseId, planId: task.planId, type, detail, actualMinutes,
  plannedDate: task.originalPlannedDate || task.date, occurredAt: localTimestamp(), ...completion,
})

export const recordQuizEvent = (courseId: string, questionId: string, point: string, score: number, taskId?: string, details: Partial<QuizEvent> = {}): QuizEvent => ({
  id: crypto.randomUUID(), attemptId: details.attemptId ?? crypto.randomUUID(), questionVersion: details.questionVersion ?? 1, source: details.source ?? 'today', evidenceType: details.evidenceType ?? 'self_assessment',
  courseId, taskId, questionId, point, score, maxScore: details.maxScore ?? 2, answer: details.answer ?? '', occurredAt: details.occurredAt ?? localTimestamp(),
})

export const deriveProgress = (data: AppData, courseId = '', weekStart = mondayOfWeek()) => {
  const weekEnd = addDays(weekStart, 6)
  const courseFilter = <T extends { courseId: string }>(item: T) => !courseId || item.courseId === courseId
  const eventTaskIds = new Set(data.taskEvents.filter(event => courseFilter(event) && inDateRange(event.plannedDate, weekStart, weekEnd)).map(event => event.taskId))
  const weeklyTasks = data.tasks.filter(task => courseFilter(task) && (inDateRange(task.originalPlannedDate || task.date, weekStart, weekEnd) || eventTaskIds.has(task.id)))
  const archivedTaskIds = data.weekArchives
    .filter(archive => archive.weekStart === weekStart && (!courseId || archive.courseId === 'all' || archive.courseId === courseId))
    .flatMap(archive => {
      const scoped = archive.plannedTasks?.length
        ? archive.plannedTasks
        : archive.plannedTaskIds.map(taskId => ({ taskId, courseId: data.tasks.find(task => task.id === taskId)?.courseId ?? '' }))
      return scoped.filter(item => !courseId || item.courseId === courseId).map(item => item.taskId)
    })
  const weeklyIds = new Set([...weeklyTasks.map(task => task.id), ...eventTaskIds, ...archivedTaskIds])
  const events = data.taskEvents.filter(event => courseFilter(event) && (weeklyIds.has(event.taskId) || inDateRange(event.plannedDate, weekStart, weekEnd)))
  const completedIds = new Set(events.filter(event => event.type === 'completed' && event.completionDegree !== '未完成').map(event => event.taskId))
  weeklyTasks.filter(task => task.status === '已完成').forEach(task => completedIds.add(task.id))
  const skipped = new Set(events.filter(event => event.type === 'skipped').map(event => event.taskId)).size
  const delayed = new Set(events.filter(event => event.type === 'delayed' || event.type === 'moved').map(event => event.taskId)).size
  const quizzes = data.quizEvents.filter(event => courseFilter(event) && inDateRange(event.occurredAt.slice(0, 10), weekStart, weekEnd))
  const objective = quizzes.filter(event => event.evidenceType === 'objective_quiz')
  const accuracy = objective.length ? Math.round(objective.reduce((sum, item) => sum + item.score / Math.max(1, item.maxScore), 0) / objective.length * 100) : null
  const selfAssessments = quizzes.filter(event => event.evidenceType === 'self_assessment')
  const actualMinutes = events.filter(event => event.type === 'completed').reduce((sum, event) => sum + Math.max(0, event.actualMinutes), 0)
  const pointCounts = new Map<string, number>()
  objective.filter(event => event.score / Math.max(1, event.maxScore) < .6).forEach(event => pointCounts.set(event.point, (pointCounts.get(event.point) ?? 0) + 1))
  const repeatedWeakPoints = [...pointCounts.entries()].filter(([, count]) => count >= 2).map(([point]) => point)
  const usedResources = new Set(weeklyTasks.filter(task => task.resourceId).map(task => task.resourceId))
  const completedResources = new Set(weeklyTasks.filter(task => completedIds.has(task.id) && task.resourceId).map(task => task.resourceId))
  const resourceEvents = data.resourceEvents.filter(event => (!courseId || event.courseId === courseId) && inDateRange(event.occurredAt.slice(0, 10), weekStart, weekEnd))
  resourceEvents.filter(event => event.type === 'saved' || event.type === 'opened' || event.type === 'completed').forEach(event => usedResources.add(event.resourceId))
  resourceEvents.filter(event => event.type === 'completed').forEach(event => completedResources.add(event.resourceId))
  const skipReasons = events.filter(event => event.type === 'skipped').map(event => event.detail)
  const signals = [skipped ? `${skipped} 项原计划任务被跳过` : '', delayed ? `${delayed} 项原计划任务延期或移动` : '', repeatedWeakPoints.length ? `重复错题知识点：${repeatedWeakPoints.join('、')}` : '', usedResources.size > completedResources.size ? '存在未完成资源' : ''].filter(Boolean)
  const assessments = data.assessmentEvents.filter(event => courseFilter(event) && inDateRange(event.occurredAt.slice(0, 10), weekStart, weekEnd))
  // Browsing or saving a resource is not an execution failure. It remains a resource
  // metric, but cannot independently justify changing next week's plan.
  const reliableSignals = usedResources.size > completedResources.size ? signals.slice(0, -1) : signals
  return {
    weekStart, weekEnd, weeklyTasks, completed: [...completedIds].filter(id => weeklyIds.has(id)).length, skipped, delayed,
    completionRate: weeklyIds.size ? Math.round([...completedIds].filter(id => weeklyIds.has(id)).length / weeklyIds.size * 100) : null,
    accuracy, selfAssessmentCount: selfAssessments.length, actualMinutes, repeatedWeakPoints,
    resourceCompleted: completedResources.size, resourceTotal: usedResources.size, signals: reliableSignals,
    causes: [...new Set(skipReasons)],
    hasRecords: weeklyIds.size > 0 || events.length > 0 || quizzes.length > 0 || assessments.length > 0 || resourceEvents.length > 0 || weeklyTasks.some(task => task.status !== '待完成'), weeklyTaskIds: weeklyIds,
    assessments,
  }
}

export interface ProgressTrendPoint {
  weekStart: string
  weekEnd: string
  completed: number
  planned: number
  actualMinutes: number
  objectiveRate: number | null
  objectiveLabel: string
  delayed: number
  skipped: number
  repeatedWeakPoints: string[]
}

export interface ComparableAssessmentChange {
  knowledgePoint: string
  difficulty: AssessmentEvent['difficulty']
  type: AssessmentEvent['type']
  maxValue: number
  beforeRate: number
  afterRate: number
  change: number
  beforeAt: string
  afterAt: string
}

const normalizedPoint = (value: string) => value.trim().toLocaleLowerCase('zh-CN').replaceAll(/\s+/g, '')

export const comparableAssessmentChange = (data: AppData, courseId: string, throughWeekStart = mondayOfWeek()): ComparableAssessmentChange | null => {
  if (!courseId) return null
  const through = addDays(throughWeekStart, 6)
  const events = data.assessmentEvents
    .filter(event => event.courseId === courseId && event.type !== '自评' && event.maxValue > 0 && event.occurredAt.slice(0, 10) <= through)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
  const groups = new Map<string, AssessmentEvent[]>()
  events.forEach(event => {
    const key = [event.type, normalizedPoint(event.knowledgePoint), event.difficulty, event.maxValue].join('|')
    groups.set(key, [...(groups.get(key) ?? []), event])
  })
  const comparable = [...groups.values()].filter(group => group.length >= 2).map(group => group.slice(-2)).sort((left, right) => right[1].occurredAt.localeCompare(left[1].occurredAt))[0]
  if (!comparable) return null
  const [before, after] = comparable
  const beforeRate = Math.round(before.value / before.maxValue * 100)
  const afterRate = Math.round(after.value / after.maxValue * 100)
  return { knowledgePoint: after.knowledgePoint, difficulty: after.difficulty, type: after.type, maxValue: after.maxValue, beforeRate, afterRate, change: afterRate - beforeRate, beforeAt: before.occurredAt, afterAt: after.occurredAt }
}

export const deriveProgressTrend = (data: AppData, courseId: string, throughWeekStart = mondayOfWeek(), weeks = 6) => {
  const points: ProgressTrendPoint[] = []
  for (let offset = Math.max(1, weeks) - 1; offset >= 0; offset -= 1) {
    const weekStart = addDays(throughWeekStart, offset * -7)
    const progress = deriveProgress(data, courseId, weekStart)
    if (!progress.hasRecords) continue
    const objectiveAssessments = progress.assessments.filter(event => event.type !== '自评' && event.maxValue > 0)
    const latestAssessment = objectiveAssessments.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
    points.push({
      weekStart,
      weekEnd: progress.weekEnd,
      completed: progress.completed,
      planned: progress.weeklyTaskIds.size,
      actualMinutes: progress.actualMinutes,
      objectiveRate: progress.accuracy ?? (latestAssessment ? Math.round(latestAssessment.value / latestAssessment.maxValue * 100) : null),
      objectiveLabel: progress.accuracy !== null ? '客观小测' : latestAssessment?.type ?? '暂无客观测验',
      delayed: progress.delayed,
      skipped: progress.skipped,
      repeatedWeakPoints: progress.repeatedWeakPoints,
    })
  }
  return {
    state: points.length === 0 ? 'empty' as const : points.length === 1 ? 'current' as const : 'trend' as const,
    points,
    comparableChange: comparableAssessmentChange(data, courseId, throughWeekStart),
  }
}

export const recordAssessment = (courseId: string, value: Omit<AssessmentEvent, 'id' | 'courseId' | 'occurredAt'> & { occurredAt?: string }): AssessmentEvent => ({ id: crypto.randomUUID(), courseId, occurredAt: value.occurredAt ?? localTimestamp(), ...value })

export const nextWeekRevision = (from = localDateISO()) => mondayOfWeek(addDays(from, 7))
export const nextWeekLockKey = (courseId = 'all', weekId = mondayOfWeek()) => `${courseId || 'all'}:${weekId}`

export const applyNextWeekPlan = (tasks: LearningTask[], courseId = '', schedule?: AppData['schedule'], courses: Course[] = [], sourceWeek = mondayOfWeek()): LearningTask[] => {
  const currentWeek = sourceWeek
  const currentEnd = addDays(currentWeek, 6)
  const nextStart = addDays(currentWeek, 7)
  const affected = tasks.filter(task => (!courseId || task.courseId === courseId) && task.status !== '已完成' && inDateRange(task.originalPlannedDate || task.date, currentWeek, currentEnd))
  if (!schedule) return tasks.map(task => affected.some(item => item.id === task.id) ? { ...task, date: addDays(nextStart, affected.findIndex(item => item.id === task.id) % 6), status: '待完成' as const, changeNote: '本周未完成任务顺延到下周' } : task)
  const unaffected = tasks.filter(task => !affected.some(item => item.id === task.id))
  const candidates = affected.map(task => ({ ...task, date: '', time: '', status: '待完成' as const, scheduleStatus: 'needs-confirmation' as const, changeNote: '本周未完成任务顺延到下周' }))
  const nextSchedule = { ...schedule, holidayStart: nextStart > schedule.holidayStart ? nextStart : schedule.holidayStart }
  return scheduleTasks(candidates, courses, nextSchedule, unaffected)
}

export const canApplyNextWeekPlan = (data: AppData, courseId = '', weekId = mondayOfWeek()) => {
  const revision = nextWeekRevision(weekId)
  // `appliedRevision` is retained for migrated v2 data; v3 writes the more
  // precise course + source-week lock so one course cannot block another.
  if (!courseId && data.progress.appliedRevision === revision) return false
  return data.progress.appliedLocks[nextWeekLockKey(courseId, weekId)] !== revision
}
export const restorePreviousPlan = (data: AppData) => data.progress.previousPlan ? data.progress.previousPlan.map(task => ({ ...task })) : data.tasks.map(task => ({ ...task }))

export { capacityForDate, validateScheduleChange }
export type { ChangeSet }
