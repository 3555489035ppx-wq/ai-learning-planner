import { addDays, dayName, inDateRange, isWeekend, localDateISO, mondayOfWeek } from './dateUtils.ts'
import { enabledSlots, periodForPreference, slotDuration } from './timetable.ts'
import type { Course, LearningResource, LearningTask, ScheduleProfile, TimePeriod } from './types.ts'

export interface ScheduleValidationResult {
  valid: boolean
  reasons: string[]
  alternatives: Array<{ date: string; time: string; slotId: string }>
}

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const dateFromDateTime = (value: string) => value.slice(0, 10)

export const constraintApplies = (date: string, schedule: ScheduleProfile) => schedule.constraints.filter(item => {
  const start = dateFromDateTime(item.startAt)
  const end = dateFromDateTime(item.endAt)
  return start && end && inDateRange(date, start, end)
})

/**
 * Capacity is an availability signal. It only becomes a hard scheduling
 * boundary when the learner explicitly enables strict daily capacity.
 */
export const capacityForDate = (date: string, schedule: ScheduleProfile) => {
  if (schedule.strictHolidayRange && !inDateRange(date, schedule.holidayStart, schedule.holidayEnd)) return 0
  if (schedule.restDays.includes(dayName(date))) return 0
  const override = schedule.dailyOverrides[date]
  let capacity = override ?? (isWeekend(date) ? schedule.weekendMinutes : schedule.weekdayMinutes)
  for (const constraint of constraintApplies(date, schedule)) capacity = Math.min(capacity, Math.max(0, constraint.capacityMinutes))
  return Math.max(0, capacity)
}

const overlaps = (start: number, duration: number, task: LearningTask) => {
  const otherStart = timeToMinutes(task.time)
  return start < otherStart + task.estimatedMinutes && otherStart < start + duration
}

const stableHash = (value: string) => [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 1000003, 17)

const orderedSlots = (schedule: ScheduleProfile, periods: TimePeriod[] = []) => {
  const preferred = new Set(schedule.preferredTimes.map(periodForPreference).filter(Boolean))
  const rank = new Map(periods.map((period, index) => [period, index]))
  return [...enabledSlots(schedule.timeSlots)].sort((left, right) =>
    Number(preferred.has(right.period)) - Number(preferred.has(left.period))
    || (rank.get(left.period) ?? 99) - (rank.get(right.period) ?? 99)
    || left.order - right.order)
}

const periodsForTask = (task: LearningTask, course?: Course): TimePeriod[] => {
  const text = `${task.title} ${task.knowledgePoint} ${task.quizTask}`
  if (/错题|复习|词汇|总结|回顾|轻量/.test(text)) return ['evening', 'afternoon', 'morning']
  if (course && ['编程语言与Web开发', '计算机系统网络与数据库', '人工智能与数据科学', '平面与图像设计', '矢量设计', '三维建模与CAD', '视频剪辑与动效', 'UIUX与交互设计'].includes(course.subjectDomain)) return ['afternoon', 'morning', 'evening']
  if (task.difficulty === '进阶' || /新知识|推导|背诵|高难/.test(text)) return ['morning', 'afternoon', 'evening']
  return ['morning', 'afternoon', 'evening']
}

const componentBudget = (task: LearningTask) => {
  const estimated = Math.max(5, task.estimatedMinutes)
  const quiz = Math.min(Math.max(0, task.quizMinutes), Math.floor(estimated * .25))
  const watch = Math.min(Math.max(0, task.watchMinutes), Math.max(0, estimated - quiz - 5))
  return { watchMinutes: watch, practiceMinutes: Math.max(0, estimated - watch - quiz), quizMinutes: quiz }
}

const findTime = (date: string, duration: number, tasks: LearningTask[], schedule: ScheduleProfile, requestedSlotId = '', periods: TimePeriod[] = [], rotationKey = '') => {
  const occupied = tasks.filter(task => task.date === date && task.scheduleStatus === 'scheduled' && task.status !== '已跳过')
  const slots = requestedSlotId ? orderedSlots(schedule, periods).filter(slot => slot.id === requestedSlotId) : orderedSlots(schedule, periods)
  const periodLoad = new Map<TimePeriod, number>([['morning', 0], ['afternoon', 0], ['evening', 0]])
  for (const task of occupied) {
    const period = schedule.timeSlots.find(slot => slot.id === task.slotId)?.period
    if (period) periodLoad.set(period, (periodLoad.get(period) ?? 0) + 1)
  }
  const preferred = new Set(schedule.preferredTimes.map(periodForPreference).filter(Boolean))
  const periodOrder: TimePeriod[] = ['morning', 'afternoon', 'evening']
  const diversify = Boolean(rotationKey)
  const periodShift = diversify ? stableHash(`${date}|${rotationKey}`) % periodOrder.length : 0
  const rotatedPeriodRank = new Map(periodOrder.map((period, index) => [periodOrder[(index + periodShift) % periodOrder.length], index]))
  const rotatedSlotRank = new Map(slots.map(slot => {
    const samePeriod = slots.filter(item => item.period === slot.period).sort((left, right) => left.order - right.order)
    const slotIndex = samePeriod.findIndex(item => item.id === slot.id)
    const slotShift = stableHash(`${date}|${rotationKey}|${slot.period}`) % Math.max(1, samePeriod.length)
    return [slot.id, (slotIndex + slotShift) % Math.max(1, samePeriod.length)] as const
  }))
  if (!requestedSlotId && diversify) {
    slots.sort((left, right) =>
      (preferred.size ? Number(preferred.has(right.period)) - Number(preferred.has(left.period)) : 0)
      || (periodLoad.get(left.period) ?? 0) - (periodLoad.get(right.period) ?? 0)
      || (diversify ? (rotatedPeriodRank.get(left.period) ?? 99) - (rotatedPeriodRank.get(right.period) ?? 99) : 0)
      || (diversify ? (rotatedSlotRank.get(left.id) ?? left.order) - (rotatedSlotRank.get(right.id) ?? right.order) : left.order - right.order))
  }
  for (const slot of slots) {
    // A Slot is a container, not a required task duration.
    if (duration > slotDuration(slot)) continue
    if (occupied.some(task => task.slotId === slot.id || overlaps(timeToMinutes(slot.start), duration, task))) continue
    return { time: slot.start, slotId: slot.id }
  }
  return null
}

const splitTask = (task: LearningTask, maxMinutes: number) => {
  const ceiling = Math.max(15, maxMinutes)
  // estimatedMinutes 是任务总时长的唯一排程口径；各子项只用于展示，必要时在
  // componentBudget 中被压缩，不能悄悄把「24 分钟任务」扩大成 25 分钟。
  const total = Math.max(15, task.estimatedMinutes)
  if (total <= ceiling) return [{ ...task, estimatedMinutes: total, ...componentBudget({ ...task, estimatedMinutes: total }) }]
  const count = Math.ceil(total / ceiling)
  let remaining = total
  return Array.from({ length: count }, (_, index) => {
    const partsLeft = count - index
    const ideal = Math.ceil(remaining / partsLeft)
    const minutes = Math.min(ceiling, Math.max(15, ideal))
    remaining -= minutes
    const part = {
      ...task,
      id: index === 0 ? task.id : `${task.id}:part:${index + 1}`,
      title: `${task.title} · 第 ${index + 1}/${count} 部分`,
      estimatedMinutes: minutes,
      order: task.order + index / 10,
      slotId: index === 0 ? task.slotId : '',
      time: index === 0 ? task.time : '',
    }
    return { ...part, ...componentBudget(part) }
  })
}

const orderedCandidates = (tasks: LearningTask[], courses: Course[]) => {
  const priority = new Map(courses.map(course => [course.id, Number(course.priority) * 100 + course.priorityWeight]))
  const taskOrder = (left: LearningTask, right: LearningTask) => left.phaseId.localeCompare(right.phaseId)
    || left.order - right.order
    || left.id.localeCompare(right.id)
  const queues = new Map<string, LearningTask[]>()
  for (const task of tasks) queues.set(task.courseId, [...(queues.get(task.courseId) ?? []), task])
  const courseIds = [...queues.keys()].sort((left, right) => (priority.get(right) ?? 0) - (priority.get(left) ?? 0) || left.localeCompare(right))
  for (const courseId of courseIds) queues.get(courseId)!.sort(taskOrder)

  // 优先级决定每一轮的先后，但不能让最高优先级课程独占整周节次。
  // 第一轮先给每门课的下一项基础任务一个排入机会，之后再开始第二轮。
  const ordered: LearningTask[] = []
  while (true) {
    let added = false
    for (const courseId of courseIds) {
      const next = queues.get(courseId)?.shift()
      if (!next) continue
      ordered.push(next)
      added = true
    }
    if (!added) return ordered
  }
}

/** Schedules only the active natural week and leaves the remainder in the task pool/backlog. */
export const scheduleTasks = (candidates: LearningTask[], courses: Course[], schedule: ScheduleProfile, existingTasks: LearningTask[] = [], targetWeekStart?: string, options: { preserveRequestedDates?: boolean; diversifyPlacement?: boolean } = {}) => {
  const largestSlot = Math.max(15, ...enabledSlots(schedule.timeSlots).map(slotDuration))
  const maxFocus = Math.min(schedule.maxFocusMinutes, largestSlot)
  const expanded = orderedCandidates(candidates.flatMap(task => splitTask(task, maxFocus)), courses)
  const scheduled = [...existingTasks]
  const courseMap = new Map(courses.map(course => [course.id, course]))
  const anchor = targetWeekStart || (schedule.holidayStart > localDateISO() ? schedule.holidayStart : localDateISO())
  const weekStart = mondayOfWeek(anchor)
  // A newly generated plan has no requested dates, so it must not silently
  // place work before the user's chosen start date. Existing/manual task
  // candidates keep the natural-week behavior expected by recovery and
  // explicit scheduling flows.
  const isGeneratedPlan = !targetWeekStart && candidates.every(task => !task.date)
  const firstDate = isGeneratedPlan && schedule.holidayStart > weekStart ? schedule.holidayStart : weekStart
  const lastDate = schedule.strictHolidayRange ? [addDays(weekStart, 6), schedule.holidayEnd].sort()[0] : addDays(weekStart, 6)
  const maxTasksPerDay = Math.max(1, schedule.maxAutoTasksPerDay ?? 2)
  const diversifyPlacement = Boolean(options.diversifyPlacement)
  const earliestByKnowledge = new Map<string, string>()

  for (const candidate of expanded) {
    const knowledgeKey = `${candidate.courseId}|${candidate.knowledgePoint}`
    const candidatesByDate = [firstDate, earliestByKnowledge.get(knowledgeKey)].filter(Boolean).sort()
    // 用户在资源页或手动编辑中指定的日期/节次，是明确意图：先在该日期验证，
    // 不把它悄悄搬回“当前周”的自动排程起点。
    const requestedDate = options.preserveRequestedDates && candidate.date && candidate.scheduleStatus !== 'needs-confirmation' ? candidate.date : ''
    const earliest = requestedDate || candidatesByDate[candidatesByDate.length - 1] || firstDate
    const latest = requestedDate || lastDate
    let placed: LearningTask | null = null
    const availableDates: string[] = []
    for (let date = earliest; date <= latest; date = addDays(date, 1)) availableDates.push(date)
    const placementKey = `${candidate.courseId}|${candidate.order}|${candidate.knowledgePoint}|${candidate.title}`
    const dateShift = diversifyPlacement && availableDates.length ? stableHash(placementKey) % availableDates.length : 0
    const orderedDates = diversifyPlacement ? availableDates.slice().sort((left, right) => {
      const leftTasks = scheduled.filter(task => task.date === left && task.scheduleStatus === 'scheduled')
      const rightTasks = scheduled.filter(task => task.date === right && task.scheduleStatus === 'scheduled')
      const countDifference = leftTasks.length - rightTasks.length
      if (countDifference) return countDifference
      const minuteDifference = leftTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0) - rightTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)
      if (minuteDifference) return minuteDifference
      const leftIndex = (availableDates.indexOf(left) - dateShift + availableDates.length) % availableDates.length
      const rightIndex = (availableDates.indexOf(right) - dateShift + availableDates.length) % availableDates.length
      return leftIndex - rightIndex
    }) : availableDates
    for (const date of orderedDates) {
      const capacity = capacityForDate(date, schedule)
      if (capacity <= 0) continue
      const scheduledToday = scheduled.filter(task => task.date === date && task.scheduleStatus === 'scheduled' && task.status !== '已跳过')
      if (scheduledToday.length >= maxTasksPerDay) continue
      const used = scheduledToday.reduce((sum, task) => sum + task.estimatedMinutes, 0)
      if (schedule.strictDailyCapacity && used + candidate.estimatedMinutes > capacity) continue
      const placement = findTime(date, candidate.estimatedMinutes, scheduled, schedule, candidate.slotId, periodsForTask(candidate, courseMap.get(candidate.courseId)), diversifyPlacement ? placementKey : '')
      if (!placement) continue
      placed = {
        ...candidate,
        date,
        originalPlannedDate: candidate.originalPlannedDate || date,
        time: placement.time,
        slotId: placement.slotId,
        // 延期任务回到任务池后属于新的待执行任务；不能带着“已延期”状态重新入表。
        status: ['待确认', '已延期', '已跳过'].includes(candidate.status) ? '待完成' : candidate.status,
        scheduleStatus: 'scheduled',
        scheduleIssue: '',
        ...componentBudget(candidate),
      }
      break
    }
    if (placed) {
      scheduled.push(placed)
      earliestByKnowledge.set(knowledgeKey, addDays(placed.date, 1))
    } else {
      scheduled.push({
        ...candidate,
        date: '', time: '', slotId: '', originalPlannedDate: candidate.originalPlannedDate || '',
        status: '待确认', scheduleStatus: 'needs-confirmation',
        scheduleIssue: '本周暂未安排到合适节次，系统会在下一周继续安排。',
        ...componentBudget(candidate),
      })
    }
  }
  return scheduled
}

export const validateScheduleChange = (task: LearningTask, next: { date: string; time?: string; slotId?: string; estimatedMinutes?: number }, currentPlan: LearningTask[], schedule: ScheduleProfile): ScheduleValidationResult => {
  const date = next.date
  const duration = next.estimatedMinutes ?? task.estimatedMinutes
  const requestedTime = next.time ?? task.time
  const requestedSlot = next.slotId ? schedule.timeSlots.find(slot => slot.id === next.slotId) : schedule.timeSlots.find(slot => slot.start === requestedTime)
  const reasons: string[] = []
  if (task.status === '已完成') reasons.push('已完成任务受保护，不能移动或修改时长。')
  if (schedule.strictHolidayRange && !inDateRange(date, schedule.holidayStart, schedule.holidayEnd)) reasons.push('目标日期不在你设定的严格假期范围内。')
  const capacity = capacityForDate(date, schedule)
  if (capacity <= 0) reasons.push(schedule.restDays.includes(dayName(date)) ? '目标日期是休息日。' : '目标日期受旅行或固定安排影响，无法学习。')
  const others = currentPlan.filter(item => item.id !== task.id && item.date === date && item.status !== '已跳过')
  const used = others.reduce((sum, item) => sum + item.estimatedMinutes, 0)
  if (schedule.strictDailyCapacity && used + duration > capacity) reasons.push(`目标日期的严格时长上限还剩 ${Math.max(0, capacity - used)} 分钟。`)
  if (!requestedSlot || !requestedSlot.enabled) reasons.push('请选择一个可用节次。')
  if (requestedSlot && duration > slotDuration(requestedSlot)) reasons.push(`任务需要 ${duration} 分钟，超过“${requestedSlot.label}”的 ${slotDuration(requestedSlot)} 分钟。`)
  if (requestedTime && others.some(item => Boolean(item.slotId && requestedSlot?.id === item.slotId) || overlaps(timeToMinutes(requestedTime), duration, item))) reasons.push('这个节次已有安排，请选择其他节次。')
  if (duration > schedule.maxFocusMinutes) reasons.push(`单次任务超过 ${schedule.maxFocusMinutes} 分钟专注上限，请先拆分任务。`)
  const alternatives: Array<{ date: string; time: string; slotId: string }> = []
  for (let offset = 0; alternatives.length < 3 && offset < 14; offset += 1) {
    const candidateDate = addDays(date, offset)
    if ((schedule.strictHolidayRange && !inDateRange(candidateDate, schedule.holidayStart, schedule.holidayEnd)) || capacityForDate(candidateDate, schedule) <= 0) continue
    const placement = findTime(candidateDate, duration, currentPlan.filter(item => item.id !== task.id), schedule)
    if (placement) alternatives.push({ date: candidateDate, ...placement })
  }
  return { valid: reasons.length === 0, reasons, alternatives }
}

export const tasksFromResource = (resource: LearningResource, course: Course, baseTask: LearningTask, schedule: ScheduleProfile) => {
  const largestSlot = Math.max(15, ...enabledSlots(schedule.timeSlots).map(slotDuration))
  return splitTask({
    ...baseTask,
    courseId: course.id,
    resourceId: resource.id,
    materialLabel: resource.title,
    watchMinutes: resource.durationMin,
    practiceMinutes: 10,
    quizMinutes: 5,
    estimatedMinutes: resource.durationMin + 15,
  }, Math.min(schedule.maxFocusMinutes, largestSlot))
}
