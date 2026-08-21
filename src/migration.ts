import { normalizeCourseName } from './courseCatalog.ts'
import { createCurriculumProfile, normalizeEducationStage } from './curriculum.ts'
import { createCourse, createTask, initialData, verifiedResources } from './data.ts'
import { addDays, localTimestamp } from './dateUtils.ts'
import { inputSnapshotHash } from './versioning.ts'
import { reconcileScheduleDomain } from './scheduleDomain.ts'
import type { AppData, Course, DiagnosticEvidenceType, DiagnosisResult, EvidenceRecord, LearningResource, LearningTask, PlanSnapshot, ScheduleConstraint, ScheduleProfile, SubjectDomain } from './types.ts'

type LegacyData = Record<string, unknown> & { version?: number }

const array = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : []
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export const migrateCourseEducationStage = (value: { stage?: unknown; courseType?: unknown; name?: unknown }) => {
  const rawStage = String(value.stage ?? '').trim()
  const rawType = String(value.courseType ?? '').trim()
  const normalizedStage = normalizeEducationStage(rawStage)
  if (normalizedStage) return { stage: normalizedStage, stageStatus: 'confirmed' as const, legacyStage: '', legacyCourseType: '' }
  if (!rawStage) return { stage: '' as const, stageStatus: 'confirmed' as const, legacyStage: '', legacyCourseType: '' }
  const normalizedCourse = normalizeCourseName(String(value.name ?? ''))
  const softwareDomain = ['平面与图像设计', '矢量设计', '三维建模与CAD', '视频剪辑与动效', 'UIUX与交互设计'].includes(normalizedCourse.subjectDomain)
  const softwareType = /软件|设计工具|技能课程/.test(rawType)
  if (softwareDomain && softwareType) return { stage: '大学' as const, stageStatus: 'confirmed' as const, legacyStage: rawStage, legacyCourseType: rawType }
  return { stage: '' as const, stageStatus: 'needs-reconfirmation' as const, legacyStage: rawStage, legacyCourseType: rawType }
}

const migrateLearningStages = (values: unknown, schedule: ScheduleProfile) => array<Record<string, unknown>>(values).map((stage, index) => {
  const startDate = String(stage.startDate ?? addDays(schedule.holidayStart, index * 7))
  const endDate = String(stage.endDate ?? [addDays(startDate, 6), schedule.holidayEnd].sort()[0])
  return { ...stage, startDate, endDate }
}) as DiagnosisResult['learningStages']

const migrateResource = (value: Record<string, unknown>): LearningResource => {
  const firstName = array<string>(value.courseNames)[0] ?? ''
  const normalized = normalizeCourseName(firstName)
  const subjectDomain = (array<SubjectDomain>(value.subjectDomains)[0] ?? normalized.subjectDomain) as SubjectDomain
  return {
    id: String(value.id ?? crypto.randomUUID()),
    title: String(value.title ?? '未命名资源'),
    platform: (value.platform ?? '用户提供') as LearningResource['platform'],
    author: String(value.author ?? '用户提供'),
    durationMin: Number(value.durationMin ?? 30),
    canonicalCourseIds: array<string>(value.canonicalCourseIds).length ? array<string>(value.canonicalCourseIds) : normalized.confidence >= .5 ? [normalized.canonicalId] : [],
    courseNames: array<string>(value.courseNames),
    domainCategory: (value.domainCategory ?? '通用技能类') as LearningResource['domainCategory'],
    subjectDomains: array<SubjectDomain>(value.subjectDomains).length ? array<SubjectDomain>(value.subjectDomains) : [subjectDomain],
    suitableStage: String(value.suitableStage ?? '由用户判断'),
    educationStages: array(value.educationStages),
    difficulty: (value.difficulty ?? '基础') as LearningResource['difficulty'],
    contentType: (value.contentType ?? '文章/讲义') as LearningResource['contentType'],
    language: String(value.language ?? '中文'),
    knowledgePoints: array<string>(value.knowledgePoints),
    curriculumTags: array<string>(value.curriculumTags),
    knowledgePointIds: array<string>(value.knowledgePointIds).length ? array<string>(value.knowledgePointIds) : array<string>(value.knowledgePoints),
    recommendation: String(value.recommendation ?? '旧版本资源，适用性需重新确认。'),
    humanVerified: Boolean(value.humanVerified),
    reviewedAt: String(value.reviewedAt ?? ''),
    verificationNote: String(value.verificationNote ?? (value.humanVerified ? '从旧版本迁移，需在下一次运营检查中复核。' : '尚未人工验证。')),
    url: String(value.url ?? ''),
    status: (value.status ?? '可用') as LearningResource['status'],
    userProvided: Boolean(value.userProvided),
    dismissedAt: value.dismissedAt ? String(value.dismissedAt) : undefined,
    healthStatus: (value.healthStatus ?? 'unknown') as LearningResource['healthStatus'],
    lastCheckedAt: String(value.lastCheckedAt ?? value.reviewedAt ?? ''),
    originalCourseName: String(value.originalCourseName ?? firstName),
    province: String(value.province ?? ''),
    textbookVersion: String(value.textbookVersion ?? ''),
    major: String(value.major ?? ''),
    chapter: String(value.chapter ?? array<string>(value.knowledgePoints)[0] ?? ''),
    officialOrOriginal: value.officialOrOriginal === null || typeof value.officialOrOriginal === 'boolean' ? value.officialOrOriginal : null,
    reposted: value.reposted === null || typeof value.reposted === 'boolean' ? value.reposted : null,
    originalSourceNote: String(value.originalSourceNote ?? value.verificationNote ?? ''),
    publishedAt: String(value.publishedAt ?? ''),
    reviewer: String(value.reviewer ?? (value.humanVerified ? '旧目录维护者' : '')),
    suitableTaskTypes: array<string>(value.suitableTaskTypes).length ? array<string>(value.suitableTaskTypes) : [String(value.contentType ?? '文章/讲义')],
  }
}

export const mergeResourceCatalog = (existing: LearningResource[], builtIn = verifiedResources): LearningResource[] => {
  const existingById = new Map(existing.map(resource => [resource.id, resource]))
  const builtInIds = new Set(builtIn.map(resource => resource.id))
  const mergedBuiltIns = builtIn.map(resource => {
    const previous = existingById.get(resource.id)
    if (!previous) return JSON.parse(JSON.stringify(resource)) as LearningResource
    return {
      ...resource,
      status: previous.status,
      dismissedAt: previous.dismissedAt,
      bilibili: resource.bilibili ? { ...resource.bilibili, openedAt: previous.bilibili?.openedAt } : undefined,
    }
  })
  const userAndLegacy = existing.filter(resource => !builtInIds.has(resource.id)).map(resource => ({ ...resource }))
  return [...mergedBuiltIns, ...userAndLegacy]
}

export const migrateWeekReflectionKeys = (value: Record<string, string>) => Object.fromEntries(
  Object.entries(value).map(([key, reflection]) => [key.includes(':') ? key : `all:${key}`, reflection]),
)

export const migrateV2ToV4 = (legacy: LegacyData, rawBackup = JSON.stringify(legacy)): AppData => {
  if (legacy.version !== 2) throw new Error('只支持从 v2 数据迁移。')
  const fallback = initialData()
  const oldCourses = array<Record<string, unknown>>(legacy.courses)
  const courses = oldCourses.map(value => {
    const normalized = normalizeCourseName(String(value.name ?? ''))
    const stageMigration = migrateCourseEducationStage(value)
    return createCourse({
      ...(value as unknown as Partial<ReturnType<typeof createCourse>>),
      id: String(value.id ?? crypto.randomUUID()),
      revision: 1,
      canonicalId: normalized.ambiguityOptions?.length ? '' : normalized.canonicalId,
      canonicalName: normalized.canonicalName,
      subjectDomain: normalized.subjectDomain,
      normalizationConfidence: normalized.confidence,
      ambiguityOptions: normalized.ambiguityOptions ?? [],
      ambiguityResolved: !normalized.ambiguityOptions?.length,
      priorityWeight: value.priority ? 2 : 1,
      ...stageMigration,
      courseType: stageMigration.stage === '大学' && /软件|设计工具|技能课程/.test(String(value.courseType ?? '')) ? '软件工具课' : value.courseType as Course['courseType'],
      curriculum: createCurriculumProfile(stageMigration.stage, { stage: stageMigration.stage, source: 'unknown' }),
    })
  })
  const scheduleValue = record(legacy.schedule)
  const schedule: ScheduleProfile = {
    ...fallback.schedule,
    ...scheduleValue,
    preferredTimes: array<string>(scheduleValue.preferredTimes),
    restDays: array<string>(scheduleValue.restDays),
    constraints: array<ScheduleConstraint>(scheduleValue.constraints),
    dailyOverrides: record(scheduleValue.dailyOverrides) as Record<string, number>,
  }
  const oldTasks = array<Record<string, unknown>>(legacy.tasks)
  const tasks = oldTasks.map(value => createTask({
    ...(value as unknown as Partial<ReturnType<typeof createTask>>),
    id: String(value.id ?? crypto.randomUUID()),
    planId: `legacy-plan-${String(value.courseId ?? 'unknown')}`,
    originalPlannedDate: String(value.originalPlannedDate ?? value.date ?? ''),
    practiceMinutes: Number(value.practiceMinutes ?? Math.max(0, Number(value.estimatedMinutes ?? 30) - Number(value.watchMinutes ?? 0) - 5)),
    quizMinutes: Number(value.quizMinutes ?? 5),
    difficulty: (value.difficulty ?? '基础') as '基础' | '中等' | '进阶',
    scheduleStatus: value.date ? 'scheduled' : 'needs-confirmation',
    scheduleIssue: value.date ? '' : '旧版本任务缺少日期，请重新安排。',
  }))
  const oldDiagnoses = record(legacy.diagnoses)
  const diagnoses: Record<string, DiagnosisResult> = {}
  const diagnosisHistory: DiagnosisResult[] = []
  courses.forEach(course => {
    const old = record(oldDiagnoses[course.id])
    if (!Object.keys(old).length) return
    const diagnosis: DiagnosisResult = {
      ...(old as unknown as DiagnosisResult),
      id: String(old.id ?? `legacy-diagnosis-${course.id}`),
      version: Number(old.version ?? 1),
      courseRevision: 1,
      status: 'completed',
      source: 'local-rules',
      evidenceType: course.assessmentMode === 'score' ? 'exam_score' : course.assessmentMode === 'project' ? 'performance_task' : 'self_assessment',
      attemptId: String(old.attemptId ?? `legacy-attempt-${course.id}`),
      questionVersion: Number(old.questionVersion ?? 1),
      completedAt: String(old.completedAt ?? old.generatedAt ?? localTimestamp()),
      canonicalId: course.canonicalId,
      subjectDomain: course.subjectDomain || '通用技能',
      feasibilityWarning: String(old.feasibilityWarning ?? ''),
      diagnosticQuiz: array<DiagnosisResult['diagnosticQuiz'][number]>(old.diagnosticQuiz).map(question => ({ ...question, courseId: course.id })),
      learningStages: migrateLearningStages(old.learningStages, schedule).map(stage => ({ ...stage, courseId: course.id })),
      weakReasons: array(old.weakReasons),
      weakKnowledgePoints: array(old.weakKnowledgePoints),
      resourceKeywords: array(old.resourceKeywords),
      rationale: array(old.rationale),
    }
    diagnoses[course.id] = diagnosis
    diagnosisHistory.push(diagnosis)
  })
  const plans: PlanSnapshot[] = courses.flatMap(course => {
    const taskIds = tasks.filter(task => task.courseId === course.id).map(task => task.id)
    if (!taskIds.length) return []
    const diagnosis = diagnoses[course.id]
    return [{
      id: `legacy-plan-${course.id}`,
      version: 1,
      courseId: course.id,
      diagnosisId: diagnosis?.id ?? '',
      diagnosisVersion: diagnosis?.version ?? 1,
      inputSnapshotHash: inputSnapshotHash(course, schedule),
      generatedAt: diagnosis?.generatedAt ?? localTimestamp(),
      activatedAt: localTimestamp(),
      status: 'stale' as const,
      taskIds,
      pendingTaskIds: tasks.filter(task => task.courseId === course.id && task.scheduleStatus === 'needs-confirmation').map(task => task.id),
      staleReasons: ['由 v2 数据迁移，建议预览重新计算。'],
    }]
  })
  const oldSettings = record(legacy.settings)
  const oldProgress = record(legacy.progress)
  return {
    ...fallback,
    version: 4,
    onboardingCompleted: Boolean(legacy.onboardingCompleted),
    onboardingStep: legacy.onboardingCompleted ? 3 : 1,
    courses,
    schedule,
    resources: mergeResourceCatalog(array<Record<string, unknown>>(legacy.resources).map(migrateResource), fallback.resources),
    tasks,
    plans,
    diagnoses,
    diagnosisHistory,
    taskEvents: array<Record<string, unknown>>(legacy.taskEvents).map(event => ({
      id: String(event.id ?? crypto.randomUUID()), taskId: String(event.taskId ?? ''), courseId: String(event.courseId ?? ''), planId: `legacy-plan-${String(event.courseId ?? 'unknown')}`,
      type: (event.type ?? 'edited') as AppData['taskEvents'][number]['type'], occurredAt: String(event.occurredAt ?? localTimestamp()), plannedDate: String(event.plannedDate ?? ''), actualMinutes: 0,
      note: 'v2 迁移记录：旧版本可能把预计时长当作实际时长，因此未迁移该数值。', detail: String(event.detail ?? '旧版本事件'),
    })),
    quizEvents: array<Record<string, unknown>>(legacy.quizEvents).map(event => ({
      id: String(event.id ?? crypto.randomUUID()), attemptId: String(event.attemptId ?? `legacy-${String(event.id ?? crypto.randomUUID())}`), questionVersion: Number(event.questionVersion ?? 1), source: 'progress', evidenceType: 'self_assessment',
      courseId: String(event.courseId ?? ''), taskId: event.taskId ? String(event.taskId) : undefined, questionId: String(event.questionId ?? ''), point: String(event.point ?? ''), score: Number(event.score ?? 0), maxScore: 2, answer: '', occurredAt: String(event.occurredAt ?? localTimestamp()),
    })),
    dailyChecks: [],
    progress: { ...fallback.progress, ...oldProgress, appliedLocks: record(oldProgress.appliedLocks) as Record<string, string>, weekReflections: migrateWeekReflectionKeys(record(oldProgress.weekReflections) as Record<string, string>), weekReviewStates: {}, previousPlan: null },
    settings: { ...fallback.settings, ...oldSettings },
    coachMessages: array(legacy.coachMessages),
    planChanges: ['已从 v2 迁移；旧实际时长未作为可信数据迁移。', ...array<string>(legacy.planChanges)],
    migrationBackup: rawBackup,
  } as unknown as AppData
}

export const migrateV3ToV4 = (legacy: LegacyData, rawBackup = JSON.stringify(legacy)): AppData => {
  if (legacy.version !== 3) throw new Error('只支持从 v3 数据迁移。')
  const fallback = initialData()
  const courses = array<Record<string, unknown>>(legacy.courses).map(value => {
    const stageMigration = migrateCourseEducationStage(value)
    const stage = stageMigration.stage
    const curriculum = record(value.curriculum)
    return createCourse({
      ...(value as unknown as Partial<ReturnType<typeof createCourse>>),
      ...stageMigration,
      courseType: stage === '大学' && /软件|设计工具|技能课程/.test(String(value.courseType ?? '')) ? '软件工具课' : value.courseType as Course['courseType'],
      stage,
      curriculum: createCurriculumProfile(stage, {
        ...(curriculum as unknown as Partial<ReturnType<typeof createCurriculumProfile>>),
        stage,
        syllabusUnits: array(curriculum.syllabusUnits),
        subjectSelection: array(curriculum.subjectSelection),
      }),
    })
  })
  const scheduleValue = record(legacy.schedule)
  const tasks = array<Record<string, unknown>>(legacy.tasks).map(value => createTask(value as unknown as Partial<ReturnType<typeof createTask>>))
  const schedule: ScheduleProfile = {
    ...fallback.schedule,
    ...scheduleValue,
    preferredTimes: array(scheduleValue.preferredTimes),
    restDays: array(scheduleValue.restDays),
    constraints: array(scheduleValue.constraints),
    dailyOverrides: record(scheduleValue.dailyOverrides) as Record<string, number>,
    timeSlots: array(scheduleValue.timeSlots).length ? array(scheduleValue.timeSlots) : fallback.schedule.timeSlots,
  }
  const diagnosisHistory = array<Record<string, unknown>>(legacy.diagnosisHistory).map(item => {
    const courseId = String(item.courseId ?? '')
    return { ...item, diagnosticQuiz: array<DiagnosisResult['diagnosticQuiz'][number]>(item.diagnosticQuiz).map(question => ({ ...question, courseId })), learningStages: migrateLearningStages(item.learningStages, schedule).map(stage => ({ ...stage, courseId })) }
  }) as DiagnosisResult[]
  const diagnoses = Object.fromEntries(Object.entries(record(legacy.diagnoses)).map(([key, item]) => [key, { ...record(item), diagnosticQuiz: array<DiagnosisResult['diagnosticQuiz'][number]>(record(item).diagnosticQuiz).map(question => ({ ...question, courseId: key })), learningStages: migrateLearningStages(record(item).learningStages, schedule).map(stage => ({ ...stage, courseId: key })) }])) as Record<string, DiagnosisResult>
  return {
    ...fallback,
    ...(legacy as unknown as Partial<AppData>),
    version: 4,
    courses,
    schedule,
    resources: mergeResourceCatalog(array<Record<string, unknown>>(legacy.resources).map(migrateResource), fallback.resources),
    tasks,
    diagnoses,
    diagnosisHistory,
    dailyChecks: array<Record<string, unknown>>(legacy.dailyChecks).map(item => ({ ...item, difficulty: item.difficulty ?? '基础' })) as AppData['dailyChecks'],
    migrationBackup: rawBackup,
    planChanges: ['已从 v3 迁移到 v4：新增课程目录、4＋4＋2 节次和独立今日自检。', ...array<string>(legacy.planChanges)],
  } as unknown as AppData
}

export const migrateV2ToV3 = migrateV2ToV4

const v6EvidenceRequirements = (course?: Course): LearningTask['evidenceRequirement'] => {
  if (course?.assessmentMode === 'project') return { acceptedTypes: ['task_completion', 'work_output', 'time_spent'], minimumCount: 1, completionRule: '记录一个可查看的成果、里程碑或检查结果。' }
  if (course?.assessmentMode === 'score') return { acceptedTypes: ['task_completion', 'objective_result', 'time_spent', 'self_check'], minimumCount: 1, completionRule: '记录完成情况，并补充正确数、错题或自检结果。' }
  return { acceptedTypes: ['task_completion', 'self_check', 'time_spent'], minimumCount: 1, completionRule: '记录完成情况和一项自我检查结果。' }
}

const migrateTaskToV6 = (task: LearningTask, course?: Course): LearningTask => {
  const phaseId = task.phaseId || `${task.courseId}:${task.stageLabel || 'baseline'}`
  const weeklyGoalId = task.weeklyGoalId || `${phaseId}:${task.stageStartDate || task.date || 'unscheduled'}`
  const project = course?.assessmentMode === 'project'
  const taskType = task.taskType || (project ? 'project' : /小测|自检/.test(`${task.title} ${task.quizTask}`) ? 'quiz' : /复习|回顾|错因/.test(`${task.title} ${task.action}`) ? 'review' : /练习|题/.test(`${task.title} ${task.action}`) ? 'practice' : 'learn')
  const evidenceRefs = task.arrangementReason ? [`legacy-task:${task.id}`] : []
  return {
    ...task,
    phaseId,
    weeklyGoalId,
    taskType,
    knowledgePointIds: task.knowledgePointIds?.length ? task.knowledgePointIds : [task.unitId || task.knowledgePoint].filter(Boolean),
    rationale: task.rationale?.summary ? task.rationale : {
      summary: task.arrangementReason || '从旧计划迁移；请在下一次生成时补充完整安排依据。',
      reasonCodes: task.changeNote.includes('补充') ? ['continuity'] : ['score_gap'],
      evidenceIds: evidenceRefs,
      dependencyTaskIds: [],
      factors: [{ key: 'legacy-plan', weight: 1, explanation: '来自既有计划任务。' }],
      confidence: .4,
      limitations: ['旧版本任务没有结构化理由，已保留原文。'],
    },
    evidenceRequirement: task.evidenceRequirement?.acceptedTypes?.length ? task.evidenceRequirement : v6EvidenceRequirements(course),
    minimumViableMinutes: task.minimumViableMinutes || (task.taskType === 'micro_check' ? 1 : 15),
  }
}

const migrateEvidence = (legacy: AppData): EvidenceRecord[] => {
  const records: EvidenceRecord[] = []
  const known = new Set<string>()
  const add = (record: EvidenceRecord) => { if (!known.has(record.id)) { known.add(record.id); records.push(record) } }
  legacy.taskEvents.forEach(event => {
    if (event.type === 'completed') add({ id: `task-completion:${event.id}`, courseId: event.courseId, taskId: event.taskId, type: 'task_completion', source: 'task', value: event.completionDegree !== '未完成', unit: 'text', observedAt: event.occurredAt, provenance: { eventId: event.id, provider: 'imported', schemaVersion: 4 }, confidence: .9 })
    if (event.actualMinutes > 0) add({ id: `task-time:${event.id}`, courseId: event.courseId, taskId: event.taskId, type: 'time_spent', source: 'task', value: event.actualMinutes, unit: 'minutes', observedAt: event.occurredAt, provenance: { eventId: event.id, provider: 'imported', schemaVersion: 4 }, confidence: .9 })
    if (event.type === 'skipped') add({ id: `task-skip:${event.id}`, courseId: event.courseId, taskId: event.taskId, type: 'skip_reason', source: 'task', value: event.detail || event.note || '未填写原因', unit: 'text', observedAt: event.occurredAt, provenance: { eventId: event.id, provider: 'imported', schemaVersion: 4 }, confidence: .8 })
  })
  legacy.quizEvents.forEach(event => add({ id: `quiz:${event.id}`, courseId: event.courseId, taskId: event.taskId, knowledgePointId: event.point, type: event.evidenceType === 'objective_quiz' ? 'objective_result' : 'self_check', source: 'quiz', value: Math.round(event.score / Math.max(1, event.maxScore) * 100), unit: 'percent', comparabilityKey: `${event.source}|${event.point}|${event.questionVersion}|${event.maxScore}`, observedAt: event.occurredAt, provenance: { eventId: event.id, provider: 'imported', schemaVersion: 4 }, confidence: event.evidenceType === 'objective_quiz' ? .9 : .55 }))
  legacy.assessmentEvents.forEach(event => add({ id: `assessment:${event.id}`, courseId: event.courseId, knowledgePointId: event.knowledgePoint, type: event.type === '作品检查' ? 'work_output' : 'objective_result', source: 'assessment', value: Math.round(event.value / Math.max(1, event.maxValue) * 100), unit: 'percent', comparabilityKey: `${event.type}|${event.knowledgePoint}|${event.difficulty}|${event.maxValue}`, observedAt: event.occurredAt, provenance: { eventId: event.id, provider: 'imported', schemaVersion: 4 }, confidence: event.type === '自评' ? .55 : .9 }))
  legacy.resourceEvents.forEach(event => add({ id: `resource:${event.id}`, courseId: event.courseId, type: 'resource_feedback', source: 'resource', value: event.type, unit: 'text', observedAt: event.occurredAt, provenance: { eventId: event.id, provider: 'imported', schemaVersion: 4 }, confidence: .6 }))
  return records
}

export const migrateV4ToV6 = (legacy: AppData, rawBackup = JSON.stringify(legacy)): AppData => {
  if ((legacy as { version?: number }).version !== 4) throw new Error('只支持从 v4 数据迁移到 v6。')
  const fallback = initialData()
  const courseMap = new Map(legacy.courses.map(course => [course.id, course]))
  const tasks = legacy.tasks.map(task => migrateTaskToV6(task, courseMap.get(task.courseId)))
  const migrateDraft = (draft: AppData['globalPlanDraft']) => draft ? {
    ...draft,
    tasks: draft.tasks.map(task => migrateTaskToV6(task, courseMap.get(task.courseId))),
    phasesByCourse: draft.phasesByCourse ?? {},
    weeklyGoals: draft.weeklyGoals ?? [],
    weeklyCapacityMinutes: draft.weeklyCapacityMinutes ?? 0,
    weeklyBudgetMinutesByCourse: draft.weeklyBudgetMinutesByCourse ?? draft.allocationByCourse ?? {},
    scheduledMinutesByCourseWeek: draft.scheduledMinutesByCourseWeek ?? {},
    budgetFulfillmentRatio: draft.budgetFulfillmentRatio ?? {},
  } : null
  return {
    ...fallback,
    ...legacy,
    version: 6,
    schemaVersion: fallback.schemaVersion,
    schedule: { ...fallback.schedule, ...legacy.schedule, template: legacy.schedule.template ?? 'standard' },
    tasks,
    globalPlanDraft: migrateDraft(legacy.globalPlanDraft),
    globalPlanHistory: legacy.globalPlanHistory.map(item => migrateDraft(item)!),
    evidenceRecords: migrateEvidence(legacy),
    recoveryProposals: [],
    activeRecoveryProposalId: '',
    migrationBackup: rawBackup,
    planChanges: ['已从 v4 迁移到 v6：保留原始事件并生成统一学习证据。', ...legacy.planChanges],
  }
}

/** V7 separates semantic tasks from their calendar placements. */
export const migrateV6ToV7 = (legacy: AppData, rawBackup = JSON.stringify(legacy)): AppData => {
  if (legacy.version !== 6 && legacy.version !== 7) throw new Error('只支持从 v6 数据迁移到 v7。')
  const fallback = initialData()
  return reconcileScheduleDomain({
    ...fallback,
    ...legacy,
    version: 7,
    schemaVersion: fallback.schemaVersion,
    schedule: {
      ...fallback.schedule,
      ...legacy.schedule,
      autoLoadProfile: legacy.schedule.autoLoadProfile ?? 'balanced',
      maxAutoTasksPerDay: legacy.schedule.maxAutoTasksPerDay ?? 2,
      bufferDaysPerWeek: legacy.schedule.bufferDaysPerWeek ?? 1,
      strictHolidayRange: legacy.schedule.strictHolidayRange ?? false,
      strictDailyCapacity: legacy.schedule.strictDailyCapacity ?? false,
    },
    learningStages: Array.isArray(legacy.learningStages) ? legacy.learningStages : [],
    taskPool: Array.isArray(legacy.taskPool) ? legacy.taskPool : [],
    taskPlacements: Array.isArray(legacy.taskPlacements) ? legacy.taskPlacements : [],
    weeklySchedules: Array.isArray(legacy.weeklySchedules) ? legacy.weeklySchedules : [],
    migrationBackup: legacy.version === 6 ? rawBackup : legacy.migrationBackup,
    planChanges: legacy.version === 6
      ? ['已迁移到 v7：学习阶段与自然周日期解耦，未排任务进入任务池。', ...legacy.planChanges]
      : legacy.planChanges,
  })
}

export const validateV4Data = (value: unknown): AppData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('数据不是有效对象。')
  const data = value as Partial<AppData> & { version?: number }
  const requiredArrays: Array<keyof AppData> = ['courses', 'resources', 'tasks', 'plans', 'diagnosisHistory', 'taskEvents', 'quizEvents', 'dailyChecks', 'assessmentEvents', 'changeSets', 'weekArchives', 'resourceDismissals', 'coachMessages', 'planChanges']
  if (!([4, 6, 7].includes((data as { version?: number }).version ?? 0)) || !data.schedule || typeof data.schedule !== 'object' || !data.settings || typeof data.settings !== 'object' || requiredArrays.some(key => !Array.isArray(data[key]))) throw new Error('v4/v6/v7 数据结构不完整。')
  if (!data.diagnoses || typeof data.diagnoses !== 'object' || Array.isArray(data.diagnoses) || !data.progress || typeof data.progress !== 'object') throw new Error('v4 诊断或进展数据结构不完整。')
  if (data.planDrafts && (typeof data.planDrafts !== 'object' || Array.isArray(data.planDrafts))) throw new Error('计划草案结构无效。')
  if (data.planTaskArchive && (typeof data.planTaskArchive !== 'object' || Array.isArray(data.planTaskArchive))) throw new Error('计划版本任务快照结构无效。')
  const ensureUniqueIds = (items: unknown[], label: string) => {
    const ids = items.map(item => String(record(item).id ?? ''))
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error(`${label}存在空 ID 或重复 ID。`)
    return new Set(ids)
  }
  const courseIds = ensureUniqueIds(data.courses!, '课程')
  const taskIds = ensureUniqueIds(data.tasks!, '任务')
  const planIds = ensureUniqueIds(data.plans!, '计划版本')
  const planBundleIds = new Set(data.plans!.map(item => String(record(item).bundleId ?? '')).filter(Boolean))
  ensureUniqueIds(data.resources!, '学习资源')
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  const validDate = (date: unknown) => typeof date === 'string' && datePattern.test(date) && !Number.isNaN(new Date(`${date}T12:00:00`).getTime())
  const schedule = data.schedule as ScheduleProfile
  if (!validDate(schedule.holidayStart) || !validDate(schedule.holidayEnd) || schedule.holidayStart > schedule.holidayEnd) throw new Error('假期日期无效或起止顺序错误。')
  data.courses!.forEach(item => {
    const course = record(item)
    if (typeof course.name !== 'string' || typeof course.curriculum !== 'object') throw new Error('课程字段不完整。')
    if (course.stage && !['高中', '大学', '小学', '初中', '职业技能', '职业/技能', '其他'].includes(String(course.stage))) throw new Error(`课程“${course.name}”的教育阶段无效。`)
  })
  data.tasks!.forEach(item => {
    const task = record(item)
    if (!courseIds.has(String(task.courseId))) throw new Error(`任务“${task.title ?? task.id}”引用了不存在的课程。`)
    if (task.date && !validDate(task.date)) throw new Error(`任务“${task.title ?? task.id}”的日期格式无效。`)
    if (task.planId && planIds.size && !planIds.has(String(task.planId)) && !planBundleIds.has(String(task.planId))) throw new Error(`任务“${task.title ?? task.id}”引用了不存在的计划版本。`)
  })
  data.plans!.forEach(item => {
    const plan = record(item)
    if (!courseIds.has(String(plan.courseId))) throw new Error('计划版本引用了不存在的课程。')
    array<string>(plan.taskIds).forEach(id => { if (!taskIds.has(id) && String(plan.status) !== 'draft') throw new Error('计划版本引用了不存在的任务。') })
  })
  data.resources!.forEach(item => {
    const resource = record(item)
    const url = String(resource.url ?? '')
    if (url && !/^https?:\/\//i.test(url)) throw new Error(`资源“${resource.title ?? resource.id}”的链接必须使用 http 或 https。`)
    if (!Number.isFinite(Number(resource.durationMin)) || Number(resource.durationMin) < 0) throw new Error(`资源“${resource.title ?? resource.id}”的时长无效。`)
    const bilibili = record(resource.bilibili)
    if (Object.keys(bilibili).length) {
      if (!/^BV[0-9A-Za-z]{10}$/.test(String(bilibili.bvid ?? '')) || !url.includes(`/video/${String(bilibili.bvid)}`)) throw new Error(`资源“${resource.title ?? resource.id}”的 BV 号或具体视频链接无效。`)
      ;['viewCount', 'likeCount', 'favoriteCount', 'coinCount'].forEach(key => {
        const stat = bilibili[key]
        if (stat !== null && (!Number.isFinite(Number(stat)) || Number(stat) < 0)) throw new Error(`资源“${resource.title ?? resource.id}”的热度快照字段无效。`)
      })
    }
  })
  return JSON.parse(JSON.stringify(data)) as AppData
}

export const validateV6Data = (value: unknown): AppData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('数据不是有效对象。')
  const data = value as Partial<AppData>
  const requiredArrays: Array<keyof AppData> = ['courses', 'resources', 'tasks', 'plans', 'diagnosisHistory', 'taskEvents', 'quizEvents', 'dailyChecks', 'assessmentEvents', 'evidenceRecords', 'changeSets', 'weekArchives', 'resourceDismissals', 'resourceEvents', 'coachMessages', 'recoveryProposals', 'planChanges']
  if (data.version !== 6 || !data.schedule || typeof data.schedule !== 'object' || !data.settings || typeof data.settings !== 'object' || requiredArrays.some(key => !Array.isArray(data[key]))) throw new Error('v6 数据结构不完整。')
  if (!data.diagnoses || typeof data.diagnoses !== 'object' || Array.isArray(data.diagnoses) || !data.progress || typeof data.progress !== 'object') throw new Error('v6 诊断或进展数据结构不完整。')
  const seenEvidence = new Set<string>()
  data.evidenceRecords!.forEach(record => {
    if (!record.id || seenEvidence.has(record.id) || !record.courseId || !record.observedAt) throw new Error('学习证据存在空 ID、重复 ID 或必要字段缺失。')
    seenEvidence.add(record.id)
  })
  return JSON.parse(JSON.stringify(data)) as AppData
}

export const validateV7Data = (value: unknown): AppData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('数据不是有效对象。')
  const data = value as Partial<AppData>
  const requiredArrays: Array<keyof AppData> = [
    'courses', 'resources', 'tasks', 'learningStages', 'taskPool', 'taskPlacements', 'weeklySchedules',
    'plans', 'diagnosisHistory', 'taskEvents', 'quizEvents', 'dailyChecks', 'assessmentEvents',
    'evidenceRecords', 'changeSets', 'weekArchives', 'resourceDismissals', 'resourceEvents',
    'coachMessages', 'recoveryProposals', 'planChanges',
  ]
  if (data.version !== 7 || !data.schedule || typeof data.schedule !== 'object' || !data.settings || typeof data.settings !== 'object' || requiredArrays.some(key => !Array.isArray(data[key]))) throw new Error('v7 数据结构不完整。')
  const courseIds = new Set(data.courses!.map(course => course.id))
  const taskIds = new Set(data.taskPool!.map(task => task.id))
  const generationKeys = new Set<string>()
  data.taskPool!.forEach(task => {
    if (!task.id || !courseIds.has(task.courseId) || !task.stageId || !task.generationKey || generationKeys.has(task.generationKey)) throw new Error('任务池存在无效引用或重复任务。')
    generationKeys.add(task.generationKey)
  })
  const placementIds = new Set<string>()
  data.taskPlacements!.forEach(placement => {
    if (!placement.id || placementIds.has(placement.id) || !taskIds.has(placement.taskId) || !/^\d{4}-\d{2}-\d{2}$/.test(placement.date) || !placement.slotId || placement.plannedMinutes <= 0) throw new Error('课表排程存在无效字段、重复 ID 或孤立任务。')
    placementIds.add(placement.id)
  })
  data.weeklySchedules!.forEach(schedule => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.weekEnd) || schedule.placementIds.some(id => !placementIds.has(id)) || schedule.backlogTaskIds.some(id => !taskIds.has(id))) throw new Error('周课表存在无效日期或任务引用。')
  })
  return JSON.parse(JSON.stringify(data)) as AppData
}

export const validateV3Data = validateV4Data
