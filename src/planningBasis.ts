import { isStableCatalogCourse } from './courseCatalog.ts'
import { getCourseIntelligence } from './courseIntelligence.ts'
import { localTimestamp } from './dateUtils.ts'
import type { AppData, Course, PlanningBasis, ScheduleProfile, UserSettings } from './types.ts'

const hashText = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(36)
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]))
}

const stableHash = (value: unknown) => hashText(JSON.stringify(stableValue(value)))

export const diagnosisInputHash = (course: Course) => stableHash({
  identity: { id: course.id, name: course.name, canonicalId: course.canonicalId, stage: course.stage, courseType: course.courseType },
  curriculum: course.curriculum,
  assessment: {
    mode: course.assessmentMode,
    score: course.score,
    maxScore: course.maxScore,
    passScore: course.passScore,
    examType: course.examType,
    incomplete: course.incomplete,
    mastery: course.mastery,
    projectCompleted: course.projectCompleted,
    completedWorks: course.completedWorks,
    projectChecklist: course.projectChecklist,
    mainDifficulty: course.mainDifficulty,
    selfEvidence: course.selfEvidence,
  },
})

const schedulePlanInput = (schedule: ScheduleProfile) => ({
  holidayStart: schedule.holidayStart,
  holidayEnd: schedule.holidayEnd,
  weekdayMinutes: schedule.weekdayMinutes,
  weekendMinutes: schedule.weekendMinutes,
  preferredTimes: schedule.preferredTimes,
  constraints: schedule.constraints,
  restDays: schedule.restDays,
  maxFocusMinutes: schedule.maxFocusMinutes,
  dailyOverrides: schedule.dailyOverrides,
  timeSlots: schedule.timeSlots,
})

const resourcePlanInput = (settings: UserSettings) => ({
  platforms: settings.resourcePlatforms,
  languages: settings.resourceLanguages,
  contentTypes: settings.resourceContentTypes,
  difficulty: settings.resourceDifficulty,
  maxMinutes: settings.maxResourceMinutes,
  onlyHumanVerified: settings.onlyHumanVerified,
  acceptShortVideo: settings.acceptShortVideo,
})

export const planningBasisHash = (basis: PlanningBasis) => stableHash({ ...basis, createdAt: undefined })

export const planInputHash = (data: AppData, bases: Record<string, PlanningBasis>) => stableHash({
  bases: Object.fromEntries(Object.entries(bases).sort(([left], [right]) => left.localeCompare(right)).map(([id, basis]) => [id, planningBasisHash(basis)])),
  goals: [...data.courses].sort((left, right) => left.id.localeCompare(right.id)).map(course => ({
    id: course.id,
    goalType: course.goalType,
    targetScore: course.targetScore,
    targetDate: course.targetDate,
    priority: course.priority,
    priorityWeight: course.priorityWeight,
    desiredResult: course.desiredResult,
  })),
  schedule: schedulePlanInput(data.schedule),
  resources: resourcePlanInput(data.settings),
})

const missingBaselineFacts = (course: Course) => {
  const missing: string[] = []
  if (!course.name.trim()) missing.push('课程名称')
  if (!course.stage) missing.push('教育阶段')
  if (!course.courseType) missing.push('课程类型')
  if (course.assessmentMode === 'score') {
    if (course.score === '') missing.push('本次得分')
    if (course.maxScore === '' || Number(course.maxScore) <= 0) missing.push('试卷满分')
    if (!course.examType) missing.push('考试类型')
  } else {
    if (!course.mastery) missing.push('自评掌握程度')
    if (!course.selfEvidence.trim() && !course.mainDifficulty.trim() && course.projectChecklist.length === 0) missing.push('自评或作品证据')
  }
  return [...new Set(missing)]
}

const scoreLevel = (course: Course) => {
  const ratio = Number(course.score) / Math.max(1, Number(course.maxScore))
  if (ratio < .3) return `基础断点明显（${course.score}/${course.maxScore}）`
  if (ratio < .6) return `距离及格线仍有明显差距（${course.score}/${course.maxScore}）`
  if (ratio < .8) return `基础可用但稳定性不足（${course.score}/${course.maxScore}）`
  return `基础较稳，可进入综合迁移（${course.score}/${course.maxScore}）`
}

const baselineProblems = (data: AppData, course: Course) => {
  const intelligence = getCourseIntelligence(course, data.schedule)
  const units = intelligence.curriculumUnits.map(unit => unit.title)
  const userEvidence = [course.mainDifficulty, course.desiredResult, course.selfEvidence]
    .map(value => value.trim())
    .filter(Boolean)
  const fallback = isStableCatalogCourse(course.canonicalId)
    ? intelligence.competencyDimensions
    : userEvidence.length
      ? userEvidence.map(value => `${course.name}：${value}`)
      : intelligence.competencyDimensions.map(value => `${course.name}：${value}`)
  return [...new Set([...(units.length ? units : fallback), ...userEvidence])].slice(0, 4)
}

export const getPlanningBasis = (data: AppData, course: Course): PlanningBasis => {
  const missing = missingBaselineFacts(course)
  if (missing.length) throw new Error(`“${course.name || '未命名课程'}”缺少生成计划所需事实：${missing.join('、')}。`)

  const diagnosis = data.diagnoses[course.id]
  if (diagnosis?.status === 'completed' && diagnosis.courseRevision === course.revision) return {
    source: 'completed-diagnosis',
    courseId: course.id,
    currentLevel: diagnosis.currentLevel,
    priorityProblems: diagnosis.weakKnowledgePoints.length ? diagnosis.weakKnowledgePoints : [diagnosis.priorityProblem],
    target: diagnosis.realisticGoal || course.desiredResult,
    confidence: diagnosis.confidence === '高' ? 'high' : diagnosis.confidence === '中' ? 'medium' : 'low',
    evidenceRefs: [diagnosis.id, diagnosis.attemptId, ...data.quizEvents.filter(event => event.attemptId === diagnosis.attemptId).map(event => event.id)],
    createdAt: diagnosis.completedAt || diagnosis.generatedAt,
  }

  if (course.assessmentMode === 'score') return {
    source: 'score-baseline',
    courseId: course.id,
    currentLevel: scoreLevel(course),
    priorityProblems: baselineProblems(data, course),
    target: course.desiredResult || (course.targetScore !== '' ? `目标达到 ${course.targetScore}/${course.maxScore}` : '先建立稳定的基础表现'),
    confidence: course.incomplete ? 'low' : 'medium',
    evidenceRefs: [`score:${course.score}/${course.maxScore}`, `exam:${course.examType}`, `course-revision:${course.revision}`],
    createdAt: localTimestamp(),
  }

  return {
    source: 'self-report-baseline',
    courseId: course.id,
    currentLevel: course.mastery || '需要从最小可交付任务开始验证',
    priorityProblems: baselineProblems(data, course),
    target: course.desiredResult || '完成一项可检查的阶段成果',
    confidence: course.selfEvidence.trim() || course.projectChecklist.length ? 'medium' : 'low',
    evidenceRefs: [course.selfEvidence, course.mainDifficulty, ...course.projectChecklist].filter(Boolean),
    createdAt: localTimestamp(),
  }
}
