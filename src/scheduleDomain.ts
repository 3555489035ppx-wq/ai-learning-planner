import { addDays, localTimestamp, mondayOfWeek } from './dateUtils.ts'
import type {
  AppData,
  LearningStageDefinition,
  LearningTask,
  TaskPlacement,
  TaskPoolItem,
  TaskPoolStatus,
  WeeklySchedule,
} from './types.ts'

const completedTask = (task: LearningTask) => task.status === '已完成'
const activePlacement = (placement: TaskPlacement) => placement.status !== 'removed' && placement.status !== 'missed'

export const taskGenerationKey = (task: Pick<LearningTask, 'courseId' | 'phaseId' | 'stageLabel' | 'unitId' | 'knowledgePoint' | 'taskType' | 'order'>) => [
  task.courseId,
  task.phaseId || task.stageLabel || 'baseline',
  task.unitId || task.knowledgePoint || 'general',
  task.taskType,
  task.order,
].map(value => String(value).trim().toLowerCase()).join('|')

const poolStatusFor = (task: LearningTask, previous?: TaskPoolItem): TaskPoolStatus => {
  if (task.status === '已完成') return 'completed'
  if (task.status === '进行中') return 'in_progress'
  if (task.status === '已跳过' || task.status === '已延期') return 'deferred'
  if (task.scheduleStatus === 'scheduled' && task.date && task.slotId) return 'scheduled'
  if (previous?.status === 'blocked' || previous?.status === 'cancelled') return previous.status
  return 'ready'
}

export const taskToPoolItem = (task: LearningTask, previous?: TaskPoolItem, now = localTimestamp()): TaskPoolItem => ({
  id: task.id,
  planId: task.planId,
  courseId: task.courseId,
  stageId: task.phaseId || `${task.courseId}:stage:${task.stageLabel || 'baseline'}`,
  knowledgePointId: task.knowledgePointIds[0] || task.unitId || task.knowledgePoint,
  knowledgePoint: task.knowledgePoint,
  taskAction: task.action,
  taskType: task.taskType,
  estimatedMinutes: task.estimatedMinutes,
  minimumViableMinutes: task.minimumViableMinutes || 15,
  priorityScore: previous?.priorityScore ?? Math.max(1, 1000 - task.order),
  priorityReasons: previous?.priorityReasons?.length ? previous.priorityReasons : task.rationale.reasonCodes,
  dependencyTaskIds: task.rationale.dependencyTaskIds,
  resourceIds: task.resourceIds.length ? task.resourceIds : task.resourceId ? [task.resourceId] : [],
  completionCriteria: task.completionCriteriaItems.length ? task.completionCriteriaItems : [task.completionCriteria].filter(Boolean),
  progressCurrent: previous?.progressCurrent,
  progressTotal: previous?.progressTotal,
  status: poolStatusFor(task, previous),
  earliestDate: previous?.earliestDate,
  deadline: previous?.deadline,
  generationKey: previous?.generationKey || taskGenerationKey(task),
  waitingWeeks: previous?.waitingWeeks ?? 0,
  deferredCount: previous?.deferredCount ?? 0,
  createdAt: previous?.createdAt || now,
  updatedAt: now,
})

export const taskToPlacement = (task: LearningTask, previous?: TaskPlacement, now = localTimestamp()): TaskPlacement | null => {
  if (!task.date || !task.slotId || task.scheduleStatus !== 'scheduled' || task.status === '已跳过' || task.status === '已延期') return null
  const stableId = previous?.id || `placement:${task.id}:${task.date}:${task.slotId}`
  return {
    id: stableId,
    taskId: task.id,
    weekStart: mondayOfWeek(task.date),
    date: task.date,
    slotId: task.slotId,
    plannedMinutes: task.estimatedMinutes,
    status: completedTask(task) ? 'completed' : previous?.status === 'draft' ? 'draft' : 'published',
    source: previous?.source || 'migration',
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  }
}

const stageDefinitions = (tasks: LearningTask[], previous: LearningStageDefinition[]): LearningStageDefinition[] => {
  const previousMap = new Map(previous.map(stage => [stage.id, stage]))
  const grouped = new Map<string, LearningTask[]>()
  tasks.forEach(task => {
    const id = task.phaseId || `${task.courseId}:stage:${task.stageLabel || 'baseline'}`
    grouped.set(id, [...(grouped.get(id) ?? []), task])
  })
  const byCourse = new Map<string, Array<[string, LearningTask[]]>>()
  grouped.forEach((items, id) => byCourse.set(items[0].courseId, [...(byCourse.get(items[0].courseId) ?? []), [id, items]]))
  const result = [...previous]
  byCourse.forEach(groups => {
    const ordered = groups.sort((left, right) => Math.min(...left[1].map(task => task.order)) - Math.min(...right[1].map(task => task.order)))
    const firstIncomplete = ordered.findIndex(([, items]) => items.some(task => !completedTask(task)))
    ordered.forEach(([id, items], index) => {
      const old = previousMap.get(id)
      const first = items[0]
      const allComplete = items.every(completedTask)
      const next: LearningStageDefinition = {
        id,
        courseId: first.courseId,
        order: old?.order ?? index + 1,
        title: old?.title || first.stageLabel || `阶段 ${index + 1}`,
        objective: old?.objective || first.rationale.summary || first.arrangementReason,
        knowledgePointIds: [...new Set(items.flatMap(task => task.knowledgePointIds.length ? task.knowledgePointIds : [task.knowledgePoint]).filter(Boolean))],
        entryCriteria: old?.entryCriteria ?? [],
        exitCriteria: old?.exitCriteria?.length ? old.exitCriteria : [...new Set(items.flatMap(task => task.completionCriteriaItems).filter(Boolean))],
        dependencyStageIds: old?.dependencyStageIds ?? (index ? [ordered[index - 1][0]] : []),
        status: allComplete ? 'completed' : index === firstIncomplete ? 'active' : firstIncomplete < 0 || index < firstIncomplete ? 'ready' : 'locked',
        progress: items.length ? Math.round(items.filter(completedTask).length / items.length * 100) : 0,
        completedAt: allComplete ? old?.completedAt || localTimestamp() : undefined,
        estimatedEffortMinutes: items.reduce((sum, task) => sum + task.estimatedMinutes, 0),
        legacyTiming: first.stageStartDate || first.stageEndDate ? { startDate: first.stageStartDate, endDate: first.stageEndDate } : old?.legacyTiming,
      }
      const existingIndex = result.findIndex(stage => stage.id === id)
      if (existingIndex >= 0) result[existingIndex] = next
      else result.push(next)
    })
  })
  return result
}

const weeklySchedules = (placements: TaskPlacement[], pool: TaskPoolItem[], previous: WeeklySchedule[], now: string) => {
  const weeks = new Set(placements.filter(activePlacement).map(placement => placement.weekStart))
  const oldMap = new Map(previous.map(schedule => [schedule.weekStart, schedule]))
  return [...weeks].sort().map(weekStart => {
    const old = oldMap.get(weekStart)
    const placementIds = placements.filter(placement => placement.weekStart === weekStart && activePlacement(placement)).map(placement => placement.id)
    const scheduledTaskIds = new Set(placements.filter(placement => placement.weekStart === weekStart && activePlacement(placement)).map(placement => placement.taskId))
    const backlogTaskIds = pool.filter(task => ['ready', 'deferred'].includes(task.status) && !scheduledTaskIds.has(task.id)).map(task => task.id)
    return {
      id: old?.id || `week:${weekStart}`,
      weekStart,
      weekEnd: addDays(weekStart, 6),
      placementIds,
      backlogTaskIds,
      status: old?.status || 'published',
      version: old?.version || 1,
      generatedAt: old?.generatedAt || now,
      publishedAt: old?.publishedAt,
      issues: old?.issues ?? [],
    } satisfies WeeklySchedule
  })
}

/** Keeps the V7 schedule domain in sync while legacy pages still edit LearningTask. */
export const reconcileScheduleDomain = (data: AppData): AppData => {
  const now = localTimestamp()
  const oldPool = new Map((data.taskPool ?? []).map(task => [task.id, task]))
  const oldPlacementByKey = new Map((data.taskPlacements ?? []).map(placement => [`${placement.taskId}|${placement.date}|${placement.slotId}`, placement]))
  const dedupe = new Map<string, TaskPoolItem>()
  data.tasks.forEach(task => {
    const item = taskToPoolItem(task, oldPool.get(task.id), now)
    const existing = dedupe.get(item.generationKey)
    if (!existing || existing.status === 'completed') dedupe.set(item.generationKey, item)
  })
  const taskPool = [...dedupe.values()]
  const taskIds = new Set(taskPool.map(task => task.id))
  const deferredTaskIds = new Set(data.tasks.filter(task => task.status === '已跳过' || task.status === '已延期').map(task => task.id))
  const active = data.tasks.flatMap(task => {
    if (!taskIds.has(task.id)) return []
    const key = `${task.id}|${task.date}|${task.slotId}`
    const placement = taskToPlacement(task, oldPlacementByKey.get(key), now)
    return placement ? [placement] : []
  })
  const activeKeys = new Set(active.map(placement => `${placement.taskId}|${placement.date}|${placement.slotId}`))
  const historical = (data.taskPlacements ?? [])
    .filter(placement => taskIds.has(placement.taskId) && !activeKeys.has(`${placement.taskId}|${placement.date}|${placement.slotId}`))
    .map(placement => ['missed', 'removed', 'completed'].includes(placement.status)
      ? placement
      : { ...placement, status: deferredTaskIds.has(placement.taskId) ? 'missed' as const : 'removed' as const, updatedAt: now })
  const taskPlacements = [...historical, ...active]
  return {
    ...data,
    version: 7,
    learningStages: stageDefinitions(data.tasks, data.learningStages ?? []),
    taskPool,
    taskPlacements,
    weeklySchedules: weeklySchedules(taskPlacements, taskPool, data.weeklySchedules ?? [], now),
  }
}
