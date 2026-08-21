import { createTaskChangeSet } from '../changeSets.ts'
import { addDays, localDateISO, mondayOfWeek } from '../dateUtils.ts'
import { scheduleTasks } from '../scheduler.ts'
import { reconcileScheduleDomain } from '../scheduleDomain.ts'
import type { AppData, LearningTask, RecoveryOption, RecoveryProposal, RecoverySignal } from '../types.ts'

const active = (task: LearningTask) => task.status !== '已完成' && task.status !== '进行中' && task.status !== '已跳过'
const completed = (data: AppData, task: LearningTask) => task.status === '已完成' || data.taskEvents.some(event => event.taskId === task.id && event.type === 'completed' && event.completionDegree !== '未完成')

const dated = (value: string) => value.slice(0, 10)
const signal = (type: RecoverySignal['type'], severity: RecoverySignal['severity'], explanation: string, evidenceIds: string[], dates: string[]): RecoverySignal => ({
  id: crypto.randomUUID(), type, severity, explanation, evidenceIds, detectedAt: new Date().toISOString(), windowStart: dates[0] ?? localDateISO(), windowEnd: dates[dates.length - 1] ?? localDateISO(),
})

/** Detects only observable execution patterns; resource browsing alone never creates a recovery signal. */
export const detectRecoverySignals = (data: AppData, through = localDateISO()): RecoverySignal[] => {
  const signals: RecoverySignal[] = []
  const past = data.tasks.filter(task => task.date && task.date <= through)
  const byDate = new Map<string, LearningTask[]>()
  past.forEach(task => byDate.set(task.date, [...(byDate.get(task.date) ?? []), task]))
  const dates = [...byDate.keys()].sort().slice(-14)
  const lowDays = dates.filter(date => {
    const tasks = byDate.get(date) ?? []
    return tasks.length > 0 && tasks.filter(task => completed(data, task)).length / tasks.length < .5
  })
  for (let index = 0; index <= lowDays.length - 3; index += 1) {
    const window = lowDays.slice(index, index + 3)
    if (window.every((date, offset) => offset === 0 || date === addDays(window[0], offset))) {
      const related = past.filter(task => window.includes(task.date)).map(task => task.id)
      signals.push(signal('low_completion', 'actionable', '连续 3 个原定学习日完成不足一半；建议先调整负荷，而不是把未完成任务静默删除。', related, window)); break
    }
  }
  const skips = data.taskEvents.filter(event => event.type === 'skipped' && dated(event.occurredAt) >= addDays(through, -13))
  const skipByCourse = new Map<string, typeof skips>()
  skips.forEach(event => skipByCourse.set(event.courseId, [...(skipByCourse.get(event.courseId) ?? []), event]))
  skipByCourse.forEach((events, courseId) => {
    if (events.length >= 2) signals.push(signal('repeated_skip', 'actionable', `同一课程在两周内出现 ${events.length} 次主动跳过；需要根据原因重新安排，而非默认补回。`, events.map(event => event.id), events.map(event => dated(event.occurredAt)).sort()))
  })
  const overruns = data.taskEvents.filter(event => event.type === 'completed' && event.actualMinutes > 0).filter(event => {
    const task = data.tasks.find(item => item.id === event.taskId)
    return task && event.actualMinutes > task.estimatedMinutes * 1.5
  })
  if (overruns.length >= 2) signals.push(signal('time_overrun', 'notice', `有 ${overruns.length} 项任务实际用时显著超过预计；下一次排程会优先保留缓冲。`, overruns.map(event => event.id), overruns.map(event => dated(event.occurredAt)).sort()))
  const highDifficulty = data.evidenceRecords.filter(record => record.type === 'difficulty_rating' && String(record.value) === 'high' && dated(record.observedAt) >= addDays(through, -13))
  if (highDifficulty.length >= 2) signals.push(signal('high_difficulty', 'actionable', '至少两次证据记录为高难度；应把相关任务拆为可验证的前置步骤。', highDifficulty.map(record => record.id), highDifficulty.map(record => dated(record.observedAt)).sort()))
  const overdue = data.tasks.filter(task => active(task) && task.date && task.date < through)
  if (overdue.length >= 2) signals.push(signal('overdue', 'actionable', `有 ${overdue.length} 项任务已超过原定日期；请从恢复选项中明确选择处理方式。`, overdue.map(task => task.id), overdue.map(task => task.date).sort()))
  return signals
}

const replan = (data: AppData, pending: LearningTask[], transform: (task: LearningTask) => LearningTask, weekStart?: string, courses = data.courses) => {
  const protectedTasks = data.tasks.filter(task => !active(task))
  const candidates = pending.map(task => ({ ...transform(task), date: '', time: '', slotId: '', scheduleStatus: 'needs-confirmation' as const }))
  return scheduleTasks(candidates, courses, data.schedule, protectedTasks, weekStart)
}

/**
 * Closes missed placements and returns the original semantic task to the pool.
 * It intentionally keeps the task ID stable so evidence and duplicate checks
 * remain connected to the same learning action.
 */
export const returnMissedTasksToPool = (data: AppData, through = localDateISO()) => {
  const changed = data.tasks.map(task => {
    const unresolved = active(task) && task.date && task.date < through
    return unresolved
      ? { ...task, status: '已延期' as const, scheduleStatus: 'needs-confirmation' as const, date: '', time: '', slotId: '', changeNote: '未完成任务已回到任务池，等待重新安排。' }
      : task
  })
  const affected = changed.filter((task, index) => task !== data.tasks[index])
  if (!affected.length) return data
  const changeSet = createTaskChangeSet(data.tasks, changed, '将未完成任务返回任务池', { scope: 'week', source: 'weekly_review' })
  return reconcileScheduleDomain({
    ...data,
    tasks: changed,
    changeSets: [...data.changeSets, changeSet],
    taskEvents: [...data.taskEvents, ...affected.map(task => ({
      id: crypto.randomUUID(), taskId: task.id, courseId: task.courseId, planId: task.planId,
      type: 'delayed' as const, occurredAt: new Date().toISOString(), plannedDate: '', actualMinutes: 0,
      detail: '未完成任务回到任务池，等待后续自然周重新安排。',
    }))],
  })
}

/** Schedules only pool work for the requested natural week; overflow remains ready. */
export const scheduleBacklogForWeek = (data: AppData, weekStart: string) => {
  const normalized = reconcileScheduleDomain(data)
  const poolIds = new Set(normalized.taskPool.filter(item => ['ready', 'deferred'].includes(item.status)).map(item => item.id))
  const candidates = normalized.tasks.filter(task => poolIds.has(task.id))
  const protectedTasks = normalized.tasks.filter(task => !poolIds.has(task.id) && task.scheduleStatus === 'scheduled')
  const scheduled = scheduleTasks(candidates, normalized.courses, normalized.schedule, protectedTasks, weekStart)
  const scheduledById = new Map(scheduled.map(task => [task.id, task]))
  const nextTasks = normalized.tasks.map(task => scheduledById.get(task.id) ?? task)
  const changeSet = createTaskChangeSet(normalized.tasks, nextTasks, `重新安排 ${weekStart} 当周任务`, { scope: 'week', source: 'weekly_review', weekId: weekStart })
  return reconcileScheduleDomain({
    ...normalized,
    tasks: nextTasks,
    changeSets: changeSet.changes.length ? [...normalized.changeSets, changeSet] : normalized.changeSets,
  })
}

const option = (data: AppData, input: Omit<RecoveryOption, 'id' | 'changeSetPreview'>, tasks: LearningTask[]): RecoveryOption => ({
  ...input,
  id: crypto.randomUUID(),
  changeSetPreview: createTaskChangeSet(data.tasks, tasks, input.explanation, { scope: 'plan', source: 'coach' }),
})

export const buildRecoveryProposal = (data: AppData, signals = detectRecoverySignals(data)): RecoveryProposal | null => {
  const actionable = signals.filter(item => item.severity === 'actionable')
  if (!actionable.length) return null
  const pending = data.tasks.filter(active)
  if (!pending.length) return null
  const affectedCourseIds = [...new Set(pending.map(task => task.courseId))]
  const reduced = replan(data, pending, task => ({ ...task, estimatedMinutes: Math.max(task.minimumViableMinutes || 15, Math.round(task.estimatedMinutes * .8)), practiceCount: Math.max(1, Math.ceil(task.practiceCount * .8)), changeNote: '恢复方案：降低单次负荷并重新排程' }))
  const nextWeek = addDays(mondayOfWeek(localDateISO()), 7)
  const extended = replan(data, pending, task => ({ ...task, changeNote: '恢复方案：保留任务，延后到下一自然周的可用节次' }), nextWeek)
  const priority = new Set(data.courses.filter(course => course.priority).map(course => course.id))
  const prioritisedCourses = data.courses.map(course => ({ ...course, priorityWeight: priority.has(course.id) ? Math.max(10, course.priorityWeight) : course.priorityWeight, priority: priority.has(course.id) }))
  const rebalanced = replan(data, pending, task => ({ ...task, changeNote: priority.has(task.courseId) ? '恢复方案：优先目标课程先恢复' : '恢复方案：为优先目标课程让出可用节次' }), undefined, prioritisedCourses)
  const changed = (tasks: LearningTask[]) => createTaskChangeSet(data.tasks, tasks, '预览').changes.filter(change => !change.entityId.startsWith('__')).length
  const minutesInNextWeek = (tasks: LearningTask[]) => tasks.filter(task => task.date >= nextWeek && task.date <= addDays(nextWeek, 6)).reduce((sum, task) => sum + task.estimatedMinutes, 0)
  const reducedMinutes = pending.reduce((sum, task) => sum + task.estimatedMinutes, 0) - reduced.filter(task => pending.some(source => source.id === task.id)).reduce((sum, task) => sum + task.estimatedMinutes, 0)
  return {
    id: crypto.randomUUID(), signalIds: actionable.map(item => item.id), createdAt: new Date().toISOString(), status: 'draft',
    options: [
      option(data, { type: 'reduce_daily_load', title: '降低每日负荷', explanation: '缩短未完成任务的单次负荷，不删除任务；重新放入可用节次。', impact: { nextWeekMinutes: minutesInNextWeek(reduced), affectedCourseIds, shiftedTaskCount: changed(reduced), shortenedMinutes: Math.max(0, reducedMinutes), summary: `将每项任务压缩为可完成的最小步骤，预计减少 ${Math.max(0, reducedMinutes)} 分钟。`, targetDateChanges: [] } }, reduced),
      option(data, { type: 'extend_horizon', title: '延后到下一周', explanation: '不把旧任务标记为完成，保留它们并尝试放到下一自然周的可用节次。', impact: { nextWeekMinutes: minutesInNextWeek(extended), affectedCourseIds, shiftedTaskCount: changed(extended), shortenedMinutes: 0, summary: `将未完成任务优先安排到下一周（${nextWeek} 起），保留原有学习内容。`, targetDateChanges: [] } }, extended),
      option(data, { type: 'rebalance_priority', title: '重新平衡优先级', explanation: '先恢复你标记为优先的课程，其余课程保留但不被删除。', impact: { nextWeekMinutes: minutesInNextWeek(rebalanced), affectedCourseIds, shiftedTaskCount: changed(rebalanced), shortenedMinutes: 0, summary: `优先恢复 ${priority.size || 0} 门已标记优先的课程，其余任务继续留在任务池。`, targetDateChanges: [] } }, rebalanced),
      { id: crypto.randomUUID(), type: 'keep_plan', title: '暂不改动计划', explanation: '保留现有计划；本次信号会继续留在进展中，等待新的执行证据。', impact: { nextWeekMinutes: 0, affectedCourseIds: [], shiftedTaskCount: 0, shortenedMinutes: 0, summary: '不改变任何任务或日期，之后可随时再次查看恢复方案。', targetDateChanges: [] } },
    ],
  }
}
