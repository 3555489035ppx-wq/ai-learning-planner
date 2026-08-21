import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CURRENT_SCHEMA_VERSION, initialData, LEGACY_STORAGE_KEY, MIGRATION_BACKUP_KEY, PREVIOUS_STORAGE_KEY, RESOURCE_CATALOG_VERSION, SCHEMA_MIGRATION_BACKUP_KEY, STORAGE_KEY, V3_MIGRATION_BACKUP_KEY, V4_STORAGE_KEY, V6_MIGRATION_BACKUP_KEY, V6_STORAGE_KEY, V7_MIGRATION_BACKUP_KEY } from './data.ts'
import { addDays, localDateISO } from './dateUtils.ts'
import { mergeResourceCatalog, migrateCourseEducationStage, migrateV2ToV4, migrateV3ToV4, migrateV4ToV6, migrateV6ToV7, migrateWeekReflectionKeys, validateV6Data, validateV7Data } from './migration.ts'
import { reconcileScheduleDomain } from './scheduleDomain.ts'
import type { AppData } from './types.ts'
import { markStaleDependencies } from './versioning.ts'
import { normalizeResourceMetadata } from './resourceProvider.ts'

type ToastKind = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; kind: ToastKind }
type LoadResult = { data: AppData; error: string; migrated: boolean }

interface StoreValue {
  data: AppData
  updateData: (updater: (current: AppData) => AppData) => void
  replaceData: (next: AppData) => void
  resetData: () => void
  notify: (message: string, kind?: ToastKind) => void
  storageError: string
  saveStatus: 'saved' | 'saving' | 'error'
}

const StoreContext = createContext<StoreValue | null>(null)

/** Repairs derived V7 schedule data when an older local snapshot has a stale pool. */
const validateStoredV7 = (value: unknown): AppData => {
  try { return validateV7Data(value) } catch (error) {
    const candidate = value as Partial<AppData>
    const canRepair = candidate.version === 7
      && Array.isArray(candidate.tasks)
      && Array.isArray(candidate.taskPool)
      && Array.isArray(candidate.taskPlacements)
      && Array.isArray(candidate.weeklySchedules)
    if (!canRepair) throw error
    return validateV7Data(reconcileScheduleDomain(candidate as AppData))
  }
}

const hydrateV7 = (value: AppData): AppData => {
  const fallback = initialData()
  const schedule = {
    ...fallback.schedule,
    ...value.schedule,
    constraints: Array.isArray(value.schedule?.constraints) ? value.schedule.constraints : [],
    dailyOverrides: value.schedule?.dailyOverrides && typeof value.schedule.dailyOverrides === 'object' ? value.schedule.dailyOverrides : {},
    timeSlots: Array.isArray(value.schedule?.timeSlots) && value.schedule.timeSlots.length ? value.schedule.timeSlots : fallback.schedule.timeSlots,
  }
  const hydrateStages = (stages: AppData['diagnosisHistory'][number]['learningStages'] = [], courseId = '') => stages.map((stage, index) => {
    const startDate = stage.startDate || addDays(schedule.holidayStart, index * 7)
    return { ...stage, courseId: stage.courseId || courseId, startDate, endDate: stage.endDate || [addDays(startDate, 6), schedule.holidayEnd].sort()[0] }
  })
  const tasks = Array.isArray(value.tasks) ? value.tasks.map(task => ({
    ...task,
    action: task.action ?? (task.materialLabel ? `学习“${task.materialLabel}”后完成练习或成果任务` : '完成练习或成果任务并记录检查结果'),
    resourceIds: Array.isArray(task.resourceIds) && task.resourceIds.length ? task.resourceIds : task.resourceId ? [task.resourceId] : [],
    completionCriteriaItems: Array.isArray(task.completionCriteriaItems) && task.completionCriteriaItems.length ? task.completionCriteriaItems : task.completionCriteria ? [task.completionCriteria] : [],
    source: task.source ?? 'system',
    slotId: task.slotId ?? '',
    unitId: task.unitId ?? '',
    stageStartDate: task.stageStartDate ?? '',
    stageEndDate: task.stageEndDate ?? '',
    arrangementReason: task.arrangementReason ?? '',
  })) : []
  const hydrateDiagnosis = (diagnosis: AppData['diagnosisHistory'][number], courseId = diagnosis.courseId) => ({
    ...diagnosis,
    diagnosticQuiz: (diagnosis.diagnosticQuiz ?? []).map(question => ({ ...question, courseId: question.courseId || courseId })),
    learningStages: hydrateStages(diagnosis.learningStages, courseId),
  })
  const weekReflections = migrateWeekReflectionKeys(value.progress?.weekReflections && typeof value.progress.weekReflections === 'object' ? value.progress.weekReflections : {})
  const weekArchives = Array.isArray(value.weekArchives) ? value.weekArchives.map(archive => {
    const plannedTasks = Array.isArray(archive.plannedTasks) && archive.plannedTasks.length
      ? archive.plannedTasks
      : archive.plannedTaskIds.map(taskId => ({ taskId, courseId: tasks.find(task => task.id === taskId)?.courseId ?? '' })).filter(item => item.courseId)
    return { ...archive, courseId: archive.courseId || 'all', plannedTasks }
  }) : []
  return reconcileScheduleDomain({
    ...fallback,
    ...value,
    version: 7,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    resourceCatalogVersion: RESOURCE_CATALOG_VERSION,
    schedule: {
      ...schedule,
      template: value.schedule?.template ?? 'standard',
      autoLoadProfile: value.schedule?.autoLoadProfile ?? 'balanced',
      maxAutoTasksPerDay: value.schedule?.maxAutoTasksPerDay ?? 3,
      bufferDaysPerWeek: value.schedule?.bufferDaysPerWeek ?? 1,
      strictHolidayRange: value.schedule?.strictHolidayRange ?? false,
      strictDailyCapacity: value.schedule?.strictDailyCapacity ?? false,
    },
    progress: {
      ...fallback.progress,
      ...value.progress,
      appliedLocks: value.progress?.appliedLocks && typeof value.progress.appliedLocks === 'object' ? value.progress.appliedLocks : {},
      weekReflections,
      weekReviewStates: value.progress?.weekReviewStates && typeof value.progress.weekReviewStates === 'object' ? value.progress.weekReviewStates : {},
    },
    settings: { ...fallback.settings, ...value.settings },
    courses: Array.isArray(value.courses) ? value.courses.map(course => {
      const stageMigration = course.stageStatus ? { stage: course.stage, stageStatus: course.stageStatus, legacyStage: course.legacyStage ?? '', legacyCourseType: course.legacyCourseType ?? '' } : migrateCourseEducationStage(course)
      return { ...course, ...stageMigration, curriculum: { ...course.curriculum, instructor: course.curriculum?.instructor ?? '', examFormat: course.curriculum?.examFormat ?? '', stage: stageMigration.stage, subjectSelection: Array.isArray(course.curriculum?.subjectSelection) ? course.curriculum.subjectSelection : [], syllabusUnits: Array.isArray(course.curriculum?.syllabusUnits) ? course.curriculum.syllabusUnits : [] }, completedWorks: Number(course.completedWorks ?? 0), projectChecklist: Array.isArray(course.projectChecklist) ? course.projectChecklist : [] }
    }) : [],
    resources: mergeResourceCatalog(Array.isArray(value.resources) ? value.resources.map(resource => normalizeResourceMetadata({ ...resource, curriculumTags: Array.isArray(resource.curriculumTags) ? resource.curriculumTags : [], knowledgePointIds: Array.isArray(resource.knowledgePointIds) ? resource.knowledgePointIds : resource.knowledgePoints, verificationNote: resource.verificationNote ?? '', healthStatus: resource.healthStatus ?? 'unknown', lastCheckedAt: resource.lastCheckedAt ?? '' })) : [], fallback.resources),
    tasks: tasks.map(task => ({
      ...task,
      phaseId: task.phaseId || `${task.courseId}:${task.stageLabel || 'baseline'}`,
      weeklyGoalId: task.weeklyGoalId || `${task.courseId}:${task.stageStartDate || task.date || 'unscheduled'}`,
      taskType: task.taskType || 'learn',
      knowledgePointIds: Array.isArray(task.knowledgePointIds) && task.knowledgePointIds.length ? task.knowledgePointIds : [task.unitId || task.knowledgePoint].filter(Boolean),
      rationale: task.rationale?.summary ? task.rationale : { summary: task.arrangementReason || '来自既有计划。', reasonCodes: [], evidenceIds: [], dependencyTaskIds: [], factors: [], confidence: .4, limitations: ['旧任务尚未生成完整安排依据。'] },
      evidenceRequirement: task.evidenceRequirement?.acceptedTypes?.length ? task.evidenceRequirement : { acceptedTypes: ['task_completion', 'time_spent', 'self_check'], minimumCount: 1, completionRule: '记录完成情况和一项检查结果。' },
      minimumViableMinutes: task.minimumViableMinutes || 15,
    })),
    learningStages: Array.isArray(value.learningStages) ? value.learningStages : [],
    taskPool: Array.isArray(value.taskPool) ? value.taskPool : [],
    taskPlacements: Array.isArray(value.taskPlacements) ? value.taskPlacements : [],
    weeklySchedules: Array.isArray(value.weeklySchedules) ? value.weeklySchedules : [],
    planDrafts: value.planDrafts && typeof value.planDrafts === 'object' ? value.planDrafts : {},
    globalPlanDraft: value.globalPlanDraft ? { ...value.globalPlanDraft, planningBases: value.globalPlanDraft.planningBases ?? {}, allocationReasons: value.globalPlanDraft.allocationReasons ?? {}, dayReasons: value.globalPlanDraft.dayReasons ?? {}, planInputHash: value.globalPlanDraft.planInputHash ?? '', phasesByCourse: value.globalPlanDraft.phasesByCourse ?? {}, weeklyGoals: value.globalPlanDraft.weeklyGoals ?? [], weeklyCapacityMinutes: value.globalPlanDraft.weeklyCapacityMinutes ?? 0, weeklyBudgetMinutesByCourse: value.globalPlanDraft.weeklyBudgetMinutesByCourse ?? value.globalPlanDraft.allocationByCourse ?? {}, scheduledMinutesByCourseWeek: value.globalPlanDraft.scheduledMinutesByCourseWeek ?? {}, budgetFulfillmentRatio: value.globalPlanDraft.budgetFulfillmentRatio ?? {}, tasks: Array.isArray(value.globalPlanDraft.tasks) ? value.globalPlanDraft.tasks.map(task => tasks.find(item => item.id === task.id) ?? { ...task, action: task.action ?? '', resourceIds: task.resourceIds ?? [], completionCriteriaItems: task.completionCriteriaItems ?? [], source: task.source ?? 'system' }) : [] } : null,
    globalPlanHistory: Array.isArray(value.globalPlanHistory) ? value.globalPlanHistory.map(plan => ({ ...plan, planningBases: plan.planningBases ?? {}, allocationReasons: plan.allocationReasons ?? {}, dayReasons: plan.dayReasons ?? {}, planInputHash: plan.planInputHash ?? '', phasesByCourse: plan.phasesByCourse ?? {}, weeklyGoals: plan.weeklyGoals ?? [], weeklyCapacityMinutes: plan.weeklyCapacityMinutes ?? 0, weeklyBudgetMinutesByCourse: plan.weeklyBudgetMinutesByCourse ?? plan.allocationByCourse ?? {}, scheduledMinutesByCourseWeek: plan.scheduledMinutesByCourseWeek ?? {}, budgetFulfillmentRatio: plan.budgetFulfillmentRatio ?? {} })) : [],
    planTaskArchive: value.planTaskArchive && typeof value.planTaskArchive === 'object' ? value.planTaskArchive : {},
    plans: Array.isArray(value.plans) ? value.plans : [],
    diagnoses: value.diagnoses && typeof value.diagnoses === 'object' ? Object.fromEntries(Object.entries(value.diagnoses).map(([id, diagnosis]) => [id, hydrateDiagnosis(diagnosis, id)])) : {},
    planningBases: value.planningBases && typeof value.planningBases === 'object' ? value.planningBases : {},
    diagnosisHistory: Array.isArray(value.diagnosisHistory) ? value.diagnosisHistory.map(diagnosis => hydrateDiagnosis(diagnosis)) : [],
    taskEvents: Array.isArray(value.taskEvents) ? value.taskEvents : [],
    quizEvents: Array.isArray(value.quizEvents) ? value.quizEvents : [],
    dailyChecks: Array.isArray(value.dailyChecks) ? value.dailyChecks.map(check => ({ ...check, difficulty: check.difficulty ?? '基础' })) : [],
    assessmentEvents: Array.isArray(value.assessmentEvents) ? value.assessmentEvents : [],
    evidenceRecords: Array.isArray(value.evidenceRecords) ? value.evidenceRecords : [],
    changeSets: Array.isArray(value.changeSets) ? value.changeSets.map(changeSet => ({ ...changeSet, source: changeSet.source ?? (changeSet.scope === 'week' ? 'weekly_review' : changeSet.scope === 'plan' ? 'regeneration' : 'manual') })) : [],
    weekArchives,
    resourceDismissals: Array.isArray(value.resourceDismissals) ? value.resourceDismissals : [],
    resourceEvents: Array.isArray(value.resourceEvents) ? value.resourceEvents : [],
    coachMessages: Array.isArray(value.coachMessages) ? value.coachMessages : fallback.coachMessages,
    coachingRequests: Array.isArray(value.coachingRequests) ? value.coachingRequests.map(request => ({
      ...request,
      agenda: Array.isArray(request.agenda) ? request.agenda : [],
      studentNote: request.studentNote ?? '',
      mentorNote: request.mentorNote ?? '',
      status: request.status ?? 'requested',
    })) : [],
    coachingMessages: Array.isArray(value.coachingMessages) ? value.coachingMessages : [],
    recoveryProposals: Array.isArray(value.recoveryProposals) ? value.recoveryProposals.map(proposal => ({
      ...proposal,
      options: proposal.options.map(option => ({
        ...option,
        impact: {
          ...option.impact,
          shortenedMinutes: option.impact.shortenedMinutes ?? 0,
          summary: option.impact.summary ?? (option.impact.shiftedTaskCount ? `涉及 ${option.impact.shiftedTaskCount} 项任务。` : '不改变任何任务或日期。'),
        },
      })),
    })) : [],
    activeRecoveryProposalId: value.activeRecoveryProposalId ?? '',
    lastCoachChangeSetId: value.lastCoachChangeSetId ?? '',
    planChanges: Array.isArray(value.planChanges) ? value.planChanges : [],
  })
}

const loadData = (): LoadResult => {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY)
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw) as unknown
      const needsSchemaMigration = (parsed as Partial<AppData>).schemaVersion !== CURRENT_SCHEMA_VERSION
      if (needsSchemaMigration) localStorage.setItem(SCHEMA_MIGRATION_BACKUP_KEY, currentRaw)
      const validated = validateStoredV7(parsed)
      const repaired = hydrateV7(validated)
      if (JSON.stringify(validated) !== JSON.stringify(parsed)) localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired))
      return { data: repaired, error: '', migrated: needsSchemaMigration }
    }

    const v6Raw = localStorage.getItem(V6_STORAGE_KEY)
    if (v6Raw) {
      localStorage.setItem(V7_MIGRATION_BACKUP_KEY, v6Raw)
      const migrated = hydrateV7(migrateV6ToV7(validateV6Data(JSON.parse(v6Raw)), v6Raw))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      return { data: migrated, error: '', migrated: true }
    }

    const v4Raw = localStorage.getItem(V4_STORAGE_KEY)
    if (v4Raw) {
      localStorage.setItem(V6_MIGRATION_BACKUP_KEY, v4Raw)
      const migrated = hydrateV7(migrateV6ToV7(migrateV4ToV6(JSON.parse(v4Raw) as AppData, v4Raw), v4Raw))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      return { data: migrated, error: '', migrated: true }
    }

    const previousRaw = localStorage.getItem(PREVIOUS_STORAGE_KEY)
    if (previousRaw) {
      localStorage.setItem(V3_MIGRATION_BACKUP_KEY, previousRaw)
      const migrated = hydrateV7(migrateV6ToV7(migrateV4ToV6(migrateV3ToV4(JSON.parse(previousRaw), previousRaw), previousRaw), previousRaw))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      return { data: migrated, error: '', migrated: true }
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacyRaw) return { data: initialData(), error: '', migrated: false }

    // The untouched source is kept independently before any transformation.
    localStorage.setItem(MIGRATION_BACKUP_KEY, legacyRaw)
    const migrated = hydrateV7(migrateV6ToV7(migrateV4ToV6(migrateV2ToV4(JSON.parse(legacyRaw), legacyRaw), legacyRaw), legacyRaw))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    return { data: migrated, error: '', migrated: true }
  } catch (error) {
    return {
      data: initialData(),
      error: `本地数据未能迁移，原始数据仍保留。${error instanceof Error ? `原因：${error.message}` : ''}`,
      migrated: false,
    }
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState<LoadResult>(loadData)
  const [data, setData] = useState<AppData>(loaded.data)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [storageError, setStorageError] = useState(loaded.error)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const sentReminders = useRef(new Set<string>())

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.round(Math.random() * 1000)
    setToasts(items => [...items, { id, message, kind }])
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 2600)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (loaded.migrated) notify('旧版学习数据已安全迁移，并保留了迁移前备份。')
      if (loaded.error) notify(loaded.error, 'error')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loaded.error, loaded.migrated, notify])

  const persist = useCallback((next: AppData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageError('')
      setSaveStatus('saved')
    } catch {
      const message = '浏览器未能保存数据，请检查隐私模式或存储空间。'
      setStorageError(message)
      setSaveStatus('error')
    }
  }, [])

  const updateData = useCallback((updater: (current: AppData) => AppData) => {
    setSaveStatus('saving')
    setData(current => {
      const next = reconcileScheduleDomain(markStaleDependencies(current, updater(current)))
      queueMicrotask(() => persist(next))
      return next
    })
  }, [persist])

  const replaceData = useCallback((next: AppData) => {
    const candidate = next.version === 7 ? validateStoredV7(next) : migrateV6ToV7(validateV6Data(next))
    const hydrated = hydrateV7(candidate)
    setData(hydrated)
    persist(hydrated)
  }, [persist])

  useEffect(() => {
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        const next = hydrateV7(validateStoredV7(JSON.parse(event.newValue)))
        setData(next)
        setStorageError('')
        setSaveStatus('saved')
        notify('已同步另一标签页中的学习数据。', 'info')
      } catch {
        setStorageError('检测到另一标签页写入了无效数据，本页未采用。')
      }
    }
    window.addEventListener('storage', syncAcrossTabs)
    return () => window.removeEventListener('storage', syncAcrossTabs)
  }, [notify])

  useEffect(() => {
    const checkReminders = () => {
      const date = localDateISO()
      const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
      const dueCount = data.tasks.filter(task => task.date === date && (task.status === '待完成' || task.status === '进行中' || task.status === '已延期')).length
      const dailyKey = `daily:${date}`
      if (data.settings.dailyReminder && dueCount > 0 && time >= data.settings.reminderTime && !sentReminders.current.has(dailyKey)) {
        sentReminders.current.add(dailyKey)
        notify(`今日还有 ${dueCount} 项待执行任务。`, 'info')
      }
      const staleKey = `stale:${data.plans.filter(plan => plan.status === 'stale').map(plan => plan.id).join(',')}`
      if (data.settings.adjustmentReminder && data.plans.some(plan => plan.status === 'stale') && !sentReminders.current.has(staleKey)) {
        sentReminders.current.add(staleKey)
        notify('当前计划基于旧信息，请预览重新计算。', 'info')
      }
    }
    checkReminders()
    const timer = window.setInterval(checkReminders, 30_000)
    return () => window.clearInterval(timer)
  }, [data.plans, data.settings.adjustmentReminder, data.settings.dailyReminder, data.settings.reminderTime, data.tasks, notify])

  const resetData = useCallback(() => {
    const next = initialData()
    setData(next)
    persist(next)
    notify('本地学习数据已清除。')
  }, [notify, persist])

  const value = useMemo(() => ({ data, updateData, replaceData, resetData, notify, storageError, saveStatus }), [data, updateData, replaceData, resetData, notify, storageError, saveStatus])

  return <StoreContext.Provider value={value}>
    {children}
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map(toast => <div key={toast.id} className={`toast ${toast.kind}`} role="status">{toast.message}</div>)}
    </div>
  </StoreContext.Provider>
}

export const useStore = () => {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore 必须在 StoreProvider 内使用。')
  return value
}
