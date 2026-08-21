import { dayName, inDateRange, mondayOfWeek } from './dateUtils.ts'
import { capacityForDate, constraintApplies } from './scheduler.ts'
import { slotDuration } from './timetable.ts'
import type { AppData, ScheduleEngineIssue, TaskPlacement, TaskPoolItem } from './types.ts'

const issue = (code: ScheduleEngineIssue['code'], severity: ScheduleEngineIssue['severity'], message: string, patch: Partial<ScheduleEngineIssue> = {}): ScheduleEngineIssue => ({
  id: `${code}:${patch.taskId ?? patch.placementId ?? crypto.randomUUID()}`,
  code,
  severity,
  message,
  ...patch,
})

const active = (placement: TaskPlacement) => !['missed', 'removed'].includes(placement.status)

/** The single scheduling legality source for placement, week publication and recovery. */
export const validateScheduleDomain = (data: Pick<AppData, 'courses' | 'schedule' | 'taskPool' | 'taskPlacements' | 'learningStages' | 'resources'>) => {
  const issues: ScheduleEngineIssue[] = []
  const courses = new Map(data.courses.map(course => [course.id, course]))
  const pool = new Map(data.taskPool.map(task => [task.id, task]))
  const stages = new Map(data.learningStages.map(stage => [stage.id, stage]))
  const seenTask = new Set<string>()
  const seenSlot = new Set<string>()

  data.taskPool.forEach(task => {
    if (!courses.has(task.courseId) || !stages.has(task.stageId) || stages.get(task.stageId)?.courseId !== task.courseId) issues.push(issue('invalid_reference', 'blocking', '任务引用的课程或学习阶段无效。', { taskId: task.id, courseId: task.courseId }))
    if (!task.knowledgePoint || !task.taskAction || task.estimatedMinutes <= 0 || task.minimumViableMinutes <= 0) issues.push(issue('invalid_task', 'blocking', '任务缺少可执行的知识点、动作或时长。', { taskId: task.id, courseId: task.courseId }))
  })

  data.taskPlacements.filter(active).forEach(placement => {
    const task = pool.get(placement.taskId)
    const slot = data.schedule.timeSlots.find(item => item.id === placement.slotId)
    if (!task) { issues.push(issue('invalid_reference', 'blocking', '课表中存在找不到原任务的安排。', { placementId: placement.id })); return }
    if (seenTask.has(placement.taskId)) issues.push(issue('duplicate_placement', 'blocking', '同一任务不能同时安排在两个时间。', { taskId: task.id, placementId: placement.id, courseId: task.courseId }))
    seenTask.add(placement.taskId)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(placement.date) || placement.weekStart !== mondayOfWeek(placement.date)) issues.push(issue('invalid_date', 'blocking', '课表日期无效，或不属于当前自然周。', { taskId: task.id, placementId: placement.id, courseId: task.courseId }))
    if (!slot || !slot.enabled) issues.push(issue('invalid_reference', 'blocking', '课表安排使用了不可用节次。', { taskId: task.id, placementId: placement.id, courseId: task.courseId }))
    if (slot && placement.plannedMinutes > slotDuration(slot)) issues.push(issue('task_too_long', 'blocking', '任务超过单节时长，需要拆成两个可完成步骤。', { taskId: task.id, placementId: placement.id, courseId: task.courseId }))
    const slotKey = `${placement.date}|${placement.slotId}`
    if (seenSlot.has(slotKey)) issues.push(issue('slot_conflict', 'blocking', '同一节次不能安排两个任务。', { taskId: task.id, placementId: placement.id, courseId: task.courseId }))
    seenSlot.add(slotKey)
    const unavailable = data.schedule.restDays.includes(dayName(placement.date)) || constraintApplies(placement.date, data.schedule).some(item => item.capacityMinutes <= 0)
    if (unavailable || (data.schedule.strictHolidayRange && !inDateRange(placement.date, data.schedule.holidayStart, data.schedule.holidayEnd))) issues.push(issue('unavailable_time', 'blocking', '该时间已被设为休息、旅行或不可用。', { taskId: task.id, placementId: placement.id, courseId: task.courseId }))
  })

  if (data.schedule.strictDailyCapacity) {
    const byDate = new Map<string, TaskPlacement[]>()
    data.taskPlacements.filter(active).forEach(placement => byDate.set(placement.date, [...(byDate.get(placement.date) ?? []), placement]))
    byDate.forEach((placements, date) => {
      const minutes = placements.reduce((sum, placement) => sum + placement.plannedMinutes, 0)
      if (minutes > capacityForDate(date, data.schedule)) placements.forEach(placement => issues.push(issue('unavailable_time', 'blocking', '这一天超过了你设定的严格学习时长上限。', { taskId: placement.taskId, placementId: placement.id })))
    })
  }

  const placed = new Set(data.taskPlacements.filter(active).map(placement => placement.taskId))
  data.taskPool.filter(task => ['ready', 'deferred'].includes(task.status) && !placed.has(task.id)).forEach(task => {
    issues.push(issue('backlog', 'recoverable', '本周暂未安排，系统会在下一周继续安排。', { taskId: task.id, courseId: task.courseId }))
  })

  return issues
}

export const blockingScheduleIssues = (issues: ScheduleEngineIssue[]) => issues.filter(item => item.severity === 'blocking')

export const scheduleMessage = (issues: ScheduleEngineIssue[]) => {
  const blocking = blockingScheduleIssues(issues)
  if (blocking.length) return { tone: 'error' as const, message: '计划需要调整后才能发布本周课表。', count: blocking.length }
  const backlog = issues.filter(item => item.code === 'backlog').length
  if (backlog) return { tone: 'info' as const, message: `本周已安排任务，其余 ${backlog} 个任务会在下一周继续安排。`, count: backlog }
  return { tone: 'success' as const, message: '本周课表已准备好。', count: 0 }
}

export const taskPoolById = (items: TaskPoolItem[]) => new Map(items.map(item => [item.id, item]))
