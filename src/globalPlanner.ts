import { createTaskChangeSet } from './changeSets.ts'
import { addDays, inDateRange, localTimestamp, mondayOfWeek } from './dateUtils.ts'
import { buildCandidateTasks, recordTaskEvent, resourceMatchesCourse } from './providers.ts'
import { getCourseIntelligence } from './courseIntelligence.ts'
import { diagnosisInputHash, getPlanningBasis, planInputHash } from './planningBasis.ts'
import { capacityForDate, scheduleTasks } from './scheduler.ts'
import { reconcileScheduleDomain } from './scheduleDomain.ts'
import { slotDuration } from './timetable.ts'
import type {
  AppData,
  Course,
  GlobalPlanDraft,
  LearningTask,
  PlanSnapshot,
  PlanValidationFailureCode,
  PlanValidationIssue,
  PlanValidationResult,
  PlanQualitySummary,
  LearningPhase,
  WeeklyGoal,
} from './types.ts'

const failureLabels: Record<PlanValidationFailureCode, string> = {
  capacity: '容量不足',
  slot: '无有效节次',
  date: '日期越界',
  course: '课程缺失',
  conflict: '时间冲突',
  resource: '资源不可用',
  task: '任务信息不完整',
  budget: '预算未兑现',
  stage: '阶段目标缺失',
  evidence: '完成证据缺失',
}

const emptyFailureCounts = (): Record<PlanValidationFailureCode, number> => ({
  capacity: 0,
  slot: 0,
  date: 0,
  course: 0,
  conflict: 0,
  resource: 0,
  task: 0,
  budget: 0,
  stage: 0,
  evidence: 0,
})

const weekKeys = (start: string, end: string) => {
  const result: string[] = []
  for (let cursor = mondayOfWeek(start); cursor <= end; cursor = addDays(cursor, 7)) result.push(cursor)
  return result
}

const plannedMinutesByCourseWeek = (tasks: LearningTask[]) => {
  const result: Record<string, Record<string, number>> = {}
  tasks.filter(task => task.scheduleStatus === 'scheduled' && task.date).forEach(task => {
    const week = mondayOfWeek(task.date)
    result[task.courseId] ??= {}
    result[task.courseId][week] = (result[task.courseId][week] ?? 0) + task.estimatedMinutes
  })
  return result
}

const qualitySummary = (data: AppData, draft: GlobalPlanDraft, issues: PlanValidationIssue[]): PlanQualitySummary => {
  const weeks = weekKeys(draft.dateRange.start, draft.dateRange.end)
  const partialWeekIds = weeks.filter(week => week < draft.dateRange.start || addDays(week, 6) > draft.dateRange.end)
  const scheduledMinutesByCourseWeek = plannedMinutesByCourseWeek(draft.tasks)
  const weeklyCapacityMinutes = data.schedule.weekdayMinutes * 5 + data.schedule.weekendMinutes * 2
  const budget = draft.weeklyBudgetMinutesByCourse ?? draft.allocationByCourse
  const budgetFulfillmentRatio = Object.fromEntries(draft.courseIds.map(courseId => {
    const expected = weeks.reduce((sum, week) => {
      const usableDays = Array.from({ length: 7 }, (_, index) => addDays(week, index)).filter(date => inDateRange(date, draft.dateRange.start, draft.dateRange.end)).length
      return sum + (budget[courseId] ?? 0) * usableDays / 7
    }, 0)
    const actual = Object.values(scheduledMinutesByCourseWeek[courseId] ?? {}).reduce((sum, minutes) => sum + minutes, 0)
    return [courseId, expected ? actual / expected : 1]
  }))
  const structureValid = !issues.some(issue => ['course', 'task', 'stage', 'evidence'].includes(issue.code))
  const capacityValid = !issues.some(issue => ['capacity', 'slot', 'date', 'conflict'].includes(issue.code))
  // Weekly budget is explanatory data, not an activation gate.
  const semanticValid = !issues.some(issue => issue.code === 'resource')
  return { structureValid, capacityValid, semanticValid, executable: structureValid && capacityValid && semanticValid, weeklyCapacityMinutes, weeklyBudgetMinutesByCourse: budget, scheduledMinutesByCourseWeek, budgetFulfillmentRatio, partialWeekIds }
}

function unique<T>(items: T[]) {
  return [...new Set(items)]
}

const draftEvidenceIds = (data: AppData, courseId: string) => data.planningBases[courseId]?.evidenceRefs ?? []

const daysUntil = (date: string) => {
  if (!date) return 180
  return Math.max(0, Math.round((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86_400_000))
}

export const coursePriorityScore = (course: Course) => {
  const scoreRatio = course.assessmentMode === 'score' && course.score !== '' && course.maxScore !== '' && Number(course.maxScore) > 0
    ? Number(course.score) / Number(course.maxScore)
    : .6
  const weakness = Math.max(0, 1 - scoreRatio) * 45
  const deadline = Math.max(0, 1 - Math.min(120, daysUntil(course.targetDate)) / 120) * 25
  const explicitPriority = course.priority ? 20 : Math.max(0, course.priorityWeight - 1) * 5
  const prerequisites = Math.min(10, course.curriculum.syllabusUnits.reduce((sum, unit) => sum + unit.prerequisites.length, 0) * 2)
  return Math.max(1, Math.round(weakness + deadline + explicitPriority + prerequisites))
}

const allocationFor = (courses: Course[], data: AppData) => {
  // 以普通周容量的 75% 作为任务池下限；排程器会在不可拆分任务需要时
  // 自然落在 75%–90% 区间，避免先生成 100% 任务再产生大量无节次任务。
  const totalWeeklyMinutes = data.schedule.weekdayMinutes * 5 + data.schedule.weekendMinutes * 2
  const weights = new Map(courses.map(course => [course.id, coursePriorityScore(course)]))
  const totalWeight = [...weights.values()].reduce((sum, value) => sum + value, 0) || 1
  return Object.fromEntries(courses.map(course => [course.id, Math.max(30, Math.round(totalWeeklyMinutes * (weights.get(course.id)! / totalWeight)))]))
}

const reinforcementModes = [
  { title: '主动回忆', action: '先不看完整示例，写出核心概念、适用条件和一个最小例子，再核对遗漏。', criterion: '留下回忆记录与核对后的修正' },
  { title: '检索练习', action: '完成一组与当前知识点对应的新练习或新操作，过程不照抄示例。', criterion: '完成新任务并标出至少一个检查点' },
  { title: '错因复盘', action: '复查最近一次未达项，按概念、步骤、检查或表达分类原因，再完成一个同类新任务。', criterion: '记录错因分类并完成一次针对性修正' },
  { title: '结构预习', action: '依据教材、课程目录或目标浏览下一部分，写出三个待验证问题和必要前置条件。', criterion: '形成三个具体问题与一项前置检查' },
  { title: '阶段小测', action: '在限定时间内完成一个同等难度的新任务，结束后按完成标准逐项检查。', criterion: '保留限时结果、检查记录与下一步' },
  { title: '迁移输出', action: '把当前方法用于一个条件不同的新题、案例、作品或实现，并说明调整了什么。', criterion: '产出可检查结果并说明一次方法调整' },
] as const

const expandTasksToAllocation = (tasks: LearningTask[], limit: number, course: Course) => {
  if (!tasks.length || tasks.length >= limit) return tasks.slice(0, limit)
  const stageOrder = [...new Set(tasks.map(task => task.stageLabel))]
  const byStage = new Map(stageOrder.map(stage => [stage, tasks.filter(task => task.stageLabel === stage)]))
  const perStage = Math.floor(limit / stageOrder.length)
  let remainder = limit % stageOrder.length
  return stageOrder.flatMap((stage, stageIndex) => {
    const seeds = byStage.get(stage) ?? []
    const stageLimit = perStage + (remainder > 0 ? 1 : 0)
    remainder = Math.max(0, remainder - 1)
    return Array.from({ length: stageLimit }, (_, index) => {
      const base = seeds[index % seeds.length]
      if (index < seeds.length) return { ...base, order: stageIndex * 100 + index }
      const mode = reinforcementModes[(index - seeds.length) % reinforcementModes.length]
      return {
        ...base,
        id: crypto.randomUUID(),
        title: `${course.name} · ${base.knowledgePoint} · ${mode.title}`,
        action: `${mode.action}围绕“${base.knowledgePoint}”执行。`,
        quizTask: `${mode.title}后用 1–3 分钟确认“${base.knowledgePoint}”是否能独立完成。`,
        completionCriteria: [...base.completionCriteriaItems, mode.criterion].join('；'),
        completionCriteriaItems: [...new Set([...base.completionCriteriaItems, mode.criterion])],
        arrangementReason: `${base.arrangementReason}；为使普通学习日达到目标容量，补充${mode.title}，不引入新的课程章节。`,
        order: stageIndex * 100 + index,
        resourceId: mode.title === '结构预习' ? base.resourceId : '',
        resourceIds: mode.title === '结构预习' ? base.resourceIds : [],
        materialLabel: mode.title === '结构预习' ? base.materialLabel : '',
        watchMinutes: mode.title === '结构预习' ? base.watchMinutes : 0,
        practiceMinutes: mode.title === '结构预习' ? base.practiceMinutes : Math.max(10, base.estimatedMinutes - base.quizMinutes),
        changeNote: `${base.stageLabel}补充任务 · ${mode.title} · 本地规则`,
      }
    })
  })
}

const addIssue = (issues: PlanValidationIssue[], taskId: string, courseId: string, code: PlanValidationFailureCode, message: string) => {
  if (!issues.some(issue => issue.taskId === taskId && issue.code === code && issue.message === message)) issues.push({ taskId, courseId, code, message })
}

export const validateGlobalPlanDraft = (data: AppData, draft: GlobalPlanDraft): PlanValidationResult => {
  const issues: PlanValidationIssue[] = []
  const courseIds = new Set(draft.courseIds)
  const courseMap = new Map(data.courses.map(course => [course.id, course]))
  const protectedTasks = data.tasks.filter(task => (task.status === '已完成' || task.status === '进行中') && !draft.tasks.some(item => item.id === task.id))
  const occupied = new Map<string, string>()
  const dayMinutes = new Map<string, number>()

  draft.courseIds.forEach(courseId => {
    const course = courseMap.get(courseId)
    if (!course) addIssue(issues, `course:${courseId}`, courseId, 'course', '计划引用了不存在的课程。')
    else if (!draft.planningBases[courseId]) addIssue(issues, `course:${courseId}`, courseId, 'course', '课程缺少可追溯的规划依据。')
  })

  draft.tasks.forEach(task => {
    const course = courseMap.get(task.courseId)
    if (!course || !courseIds.has(task.courseId)) addIssue(issues, task.id, task.courseId, 'course', '任务不属于当前学习计划。')
    if (!task.title.trim() || !task.knowledgePoint.trim() || !task.action.trim() || !task.completionCriteria.trim()) addIssue(issues, task.id, task.courseId, 'task', '任务缺少知识点、学习动作或完成标准。')
    if (task.taskType !== 'micro_check' && task.estimatedMinutes < 15) addIssue(issues, task.id, task.courseId, 'task', '普通学习任务不得少于 15 分钟。')
    if (!task.phaseId || !task.rationale.summary) addIssue(issues, task.id, task.courseId, 'stage', '任务缺少学习阶段或安排依据。')
    if (!task.evidenceRequirement?.acceptedTypes?.length || !task.evidenceRequirement.completionRule) addIssue(issues, task.id, task.courseId, 'evidence', '任务缺少完成证据要求。')

    const placed = task.scheduleStatus === 'scheduled' && Boolean(task.date && task.slotId)
    if (placed) {
      const slot = data.schedule.timeSlots.find(item => item.id === task.slotId && item.enabled)
      if (!slot) addIssue(issues, task.id, task.courseId, 'slot', '已安排任务缺少可用节次。')
      if (slot && task.estimatedMinutes > Math.min(slotDuration(slot), data.schedule.maxFocusMinutes)) addIssue(issues, task.id, task.courseId, 'capacity', '任务超过单节或专注时长。')
      if (task.date && capacityForDate(task.date, data.schedule) <= 0) addIssue(issues, task.id, task.courseId, 'capacity', '任务被安排在休息、旅行或不可用时间。')
      if (task.date && task.slotId) {
        const key = `${task.date}|${task.slotId}`
        const previous = occupied.get(key)
        if (previous || protectedTasks.some(item => item.date === task.date && item.slotId === task.slotId && item.status !== '已跳过')) addIssue(issues, task.id, task.courseId, 'conflict', '同一节次不能安排两个任务。')
        occupied.set(key, previous ?? task.id)
        dayMinutes.set(task.date, (dayMinutes.get(task.date) ?? 0) + task.estimatedMinutes)
      }
    }
    const resourceIds = unique([task.resourceId, ...(task.resourceIds ?? [])].filter(Boolean))
    resourceIds.forEach(resourceId => {
      const resource = data.resources.find(item => item.id === resourceId)
      if (!resource || !course || resource.healthStatus === 'unavailable' || !resourceMatchesCourse(resource, course, task.knowledgePoint)) addIssue(issues, task.id, task.courseId, 'resource', '任务资源不可用或与课程不匹配。')
    })
  })

  if (data.schedule.strictDailyCapacity) dayMinutes.forEach((minutes, date) => {
    const protectedMinutes = protectedTasks.filter(task => task.date === date && task.status !== '已跳过').reduce((sum, task) => sum + task.estimatedMinutes, 0)
    if (minutes + protectedMinutes > capacityForDate(date, data.schedule)) draft.tasks.filter(task => task.date === date).forEach(task => addIssue(issues, task.id, task.courseId, 'capacity', '这一天超过了严格学习时长上限。'))
  })

  const failedIds = new Set(issues.map(item => item.taskId).filter(id => !id.startsWith('course:')))
  const confirmationTaskIds = draft.tasks.filter(task => task.scheduleStatus !== 'scheduled' && !failedIds.has(task.id)).map(task => task.id)
  const scheduledTaskIds = draft.tasks.filter(task => task.scheduleStatus === 'scheduled' && !failedIds.has(task.id)).map(task => task.id)
  const failedTaskIds = draft.tasks.filter(task => failedIds.has(task.id)).map(task => task.id)
  const failuresByReason = emptyFailureCounts()
  issues.forEach(item => { failuresByReason[item.code] += 1 })
  const reasons = unique(issues.map(item => item.message))
  if (!draft.tasks.length) reasons.push('学习计划没有生成任何任务。')
  const quality = qualitySummary(data, draft, issues)
  return { valid: reasons.length === 0 && draft.tasks.length > 0 && quality.executable, reasons, scheduledTaskIds, confirmationTaskIds, failedTaskIds, failuresByReason, issues, quality }
}

const toPhases = (courseId: string, stages: import('./types.ts').LearningStage[]): LearningPhase[] => stages.map((stage, index) => ({
  id: `${courseId}:phase:${index + 1}`,
  courseId,
  title: stage.title,
  startDate: stage.startDate,
  endDate: stage.endDate,
  objective: stage.focus,
  exitCriteria: [stage.deliverable, stage.practice].filter(Boolean),
  dependencyPhaseIds: index ? [`${courseId}:phase:${index}`] : [],
}))

const toWeeklyGoals = (phasesByCourse: Record<string, LearningPhase[]>, weeklyBudget: Record<string, number>): WeeklyGoal[] => Object.values(phasesByCourse).flatMap(phases => phases.map(phase => ({
  id: `${phase.id}:week:${mondayOfWeek(phase.startDate)}`,
  phaseId: phase.id,
  courseId: phase.courseId,
  weekStart: mondayOfWeek(phase.startDate),
  objective: phase.objective,
  plannedMinutes: weeklyBudget[phase.courseId] ?? 0,
  completionCriteria: phase.exitCriteria,
  knowledgePointIds: [],
})))

export const buildGlobalPlanDraft = (data: AppData): GlobalPlanDraft => {
  const courses = data.courses
    .filter(course => !course.archivedAt && course.stageStatus === 'confirmed')
    .sort((left, right) => coursePriorityScore(right) - coursePriorityScore(left) || left.id.localeCompare(right.id))
  if (!courses.length) throw new Error('请先添加并确认至少一门课程。')
  const courseMap = new Map(courses.map(course => [course.id, course]))
  const id = crypto.randomUUID()
  const allocationByCourse = allocationFor(courses, data)
  const planningBases = Object.fromEntries(courses.map(course => [course.id, getPlanningBasis(data, course)]))
  const allocationReasons = Object.fromEntries(courses.map(course => {
    const score = coursePriorityScore(course)
    const basis = planningBases[course.id]
    return [course.id, `${basis.currentLevel}；综合目标日期、前置依赖与用户优先级得分 ${score}，每周分配约 ${allocationByCourse[course.id]} 分钟。`]
  }))
  const weightedCourses = courses.map(course => ({ ...course, priorityWeight: coursePriorityScore(course) }))
  const stagesByCourse = Object.fromEntries(courses.map(course => [course.id, data.diagnoses[course.id]?.status === 'completed' ? data.diagnoses[course.id].learningStages : getCourseIntelligence(course, data.schedule).learningStages]))
  const phasesByCourse = Object.fromEntries(Object.entries(stagesByCourse).map(([courseId, stages]) => [courseId, toPhases(courseId, stages)]))
  const weeklyGoals = toWeeklyGoals(phasesByCourse, allocationByCourse)
  const candidates = courses.flatMap(course => {
    const all = buildCandidateTasks(data, planningBases[course.id], id).map(task => ({
      ...task,
      action: task.action || (task.materialLabel ? `学习“${task.materialLabel}”后完成 ${task.practiceCount} 项练习或成果任务` : `完成 ${task.practiceCount || 1} 项练习或成果任务，并记录检查结果`),
      resourceIds: task.resourceIds?.length ? task.resourceIds : task.resourceId ? [task.resourceId] : [],
      completionCriteriaItems: task.completionCriteriaItems?.length ? task.completionCriteriaItems : [task.completionCriteria],
      source: 'system' as const,
    }))
    return all
  })
  const protectedTasks = data.tasks.filter(task => task.status === '已完成' || task.status === '进行中')
  const scheduledCandidates = scheduleTasks(candidates, weightedCourses, data.schedule, protectedTasks, undefined, { diversifyPlacement: true })
    .filter(task => task.planId === id)
  const omittedByCourse = Object.fromEntries(courses.map(course => [course.id, scheduledCandidates.filter(task => task.courseId === course.id && task.scheduleStatus !== 'scheduled').length]))
  // Core stage tasks that cannot be placed remain explicit validation failures.
  // Optional reinforcement candidates may be omitted when capacity is exhausted,
  // but their count and reason stay visible in allocationReasons/dayReasons.
  const tasks = scheduledCandidates.map(task => {
    const phase = (phasesByCourse[task.courseId] ?? []).find(item => item.startDate === task.stageStartDate && item.endDate === task.stageEndDate) ?? phasesByCourse[task.courseId]?.[0]
    const weeklyGoal = weeklyGoals.find(goal => goal.phaseId === phase?.id)
    const course = courseMap.get(task.courseId)
    const inferredTaskType: LearningTask['taskType'] = course?.assessmentMode === 'project' ? 'project' : /小测|自检|模拟/.test(`${task.title} ${task.quizTask}`) ? 'quiz' : /复习|错因|检查|调试/.test(`${task.title} ${task.action}`) ? 'review' : /练习|题|编码|输出/.test(`${task.title} ${task.action}`) ? 'practice' : 'learn'
    const taskType: LearningTask['taskType'] = task.taskType !== 'learn' ? task.taskType : inferredTaskType
    const acceptedTypes = course?.assessmentMode === 'project' ? ['task_completion', 'work_output', 'time_spent'] as const : ['task_completion', 'objective_result', 'self_check', 'time_spent'] as const
    return {
      ...task,
      phaseId: phase?.id ?? `${task.courseId}:phase:baseline`,
      weeklyGoalId: weeklyGoal?.id ?? `${task.courseId}:week:${mondayOfWeek(task.date || data.schedule.holidayStart)}`,
      taskType,
      knowledgePointIds: task.knowledgePointIds?.length ? task.knowledgePointIds : [task.unitId || task.knowledgePoint].filter(Boolean),
      rationale: {
        summary: task.arrangementReason || `${course?.name ?? '该课程'}当前阶段的基础安排。`,
        reasonCodes: [course?.priority ? 'user_priority' as const : 'score_gap' as const, 'continuity' as const],
        evidenceIds: draftEvidenceIds(data, task.courseId),
        dependencyTaskIds: [],
        factors: [{ key: 'course-priority', weight: coursePriorityScore(course ?? courses[0]), explanation: '结合成绩差距、目标日期、前置关系与用户优先级。' }],
        confidence: data.planningBases[task.courseId]?.confidence === 'high' ? .8 : .6,
        limitations: ['未完成基础诊断时，知识点安排仅基于成绩与课程目录。'],
      },
      evidenceRequirement: { acceptedTypes: [...acceptedTypes], minimumCount: 1, completionRule: course?.assessmentMode === 'project' ? '完成一个可查看的成果或里程碑，并记录实际用时。' : '记录完成情况，并补充正确数、错题或自检结果。' },
      minimumViableMinutes: 15,
    }
  })
  // 课程预算是“计划学习路线”的口径，不能被当前自然周的排入结果覆盖。
  // 当前周容量有限时，任务进入任务池并在下周继续；课程仍然有自己的计划。
  const scheduledMinutesThisWeekByCourse = Object.fromEntries(courses.map(course => {
    const actualMinutes = tasks.filter(task => task.courseId === course.id && task.scheduleStatus === 'scheduled').reduce((sum, task) => sum + task.estimatedMinutes, 0)
    return [course.id, actualMinutes]
  }))
  const effectiveAllocationReasons = Object.fromEntries(courses.map(course => {
    const omitted = omittedByCourse[course.id]
    return [course.id, `${allocationReasons[course.id]} 当前周已安排 ${scheduledMinutesThisWeekByCourse[course.id]} 分钟。${omitted ? ` 另有 ${omitted} 项任务保留在任务池，将在下一周继续安排。` : ''}`]
  }))
  const dayReasons: Record<string, string> = {}
  for (let date = data.schedule.holidayStart; date <= data.schedule.holidayEnd; date = addDays(date, 1)) {
    const capacity = capacityForDate(date, data.schedule)
    const minutes = tasks.filter(task => task.date === date && task.scheduleStatus === 'scheduled').reduce((sum, task) => sum + task.estimatedMinutes, 0)
    if (capacity <= 0) dayReasons[date] = '休息、旅行或固定安排使当天没有可用学习容量。'
    else if (minutes === 0) {
      const pendingCount = tasks.filter(task => task.scheduleStatus !== 'scheduled' && (!task.stageStartDate || !task.stageEndDate || inDateRange(date, task.stageStartDate, task.stageEndDate))).length
      dayReasons[date] = pendingCount
        ? `当天仍有 ${pendingCount} 项候选任务未能通过节次或容量校验；草案不会在修复前启用。`
        : '当天处于阶段边界或没有足够学习证据，保留为恢复与复盘，不为了填满课表制造任务。'
    }
    else if (minutes / capacity < .75) {
      const pendingCount = tasks.filter(task => task.scheduleStatus !== 'scheduled' && (!task.stageStartDate || !task.stageEndDate || inDateRange(date, task.stageStartDate, task.stageEndDate))).length
      dayReasons[date] = pendingCount
        ? `仍有 ${pendingCount} 项候选任务因节次、阶段或容量冲突未排入；需先调整后才能启用草案。`
        : '当前阶段没有足够且有证据支持的任务达到 75%，剩余时间保留为恢复与复盘，不制造新章节。'
    }
    else if (minutes / capacity > .9) dayReasons[date] = '受单次专注时长和不可拆分任务影响，略高于 90% 目标但未超过每日容量。'
  }
  const draftBase: GlobalPlanDraft = {
    id,
    version: Math.max(0, ...data.globalPlanHistory.map(item => item.version), data.globalPlanDraft?.version ?? 0) + 1,
    courseIds: courses.map(course => course.id),
    createdAt: localTimestamp(),
    activatedAt: '',
    dateRange: { start: data.schedule.holidayStart, end: data.schedule.holidayEnd },
    tasks,
    stagesByCourse,
    phasesByCourse,
    weeklyGoals,
    allocationByCourse,
    weeklyCapacityMinutes: data.schedule.weekdayMinutes * 5 + data.schedule.weekendMinutes * 2,
    weeklyBudgetMinutesByCourse: allocationByCourse,
    scheduledMinutesByCourseWeek: {},
    budgetFulfillmentRatio: {},
    allocationReasons: effectiveAllocationReasons,
    planningBases,
    dayReasons,
    planInputHash: planInputHash(data, planningBases),
    validation: { valid: false, reasons: [], scheduledTaskIds: [], confirmationTaskIds: [], failedTaskIds: [], failuresByReason: emptyFailureCounts(), issues: [], quality: { structureValid: false, capacityValid: false, semanticValid: false, executable: false, weeklyCapacityMinutes: 0, weeklyBudgetMinutesByCourse: {}, scheduledMinutesByCourseWeek: {}, budgetFulfillmentRatio: {}, partialWeekIds: [] } },
    status: 'draft',
    source: 'local-rules',
  }
  const validation = validateGlobalPlanDraft(data, draftBase)
  return { ...draftBase, scheduledMinutesByCourseWeek: validation.quality.scheduledMinutesByCourseWeek, budgetFulfillmentRatio: validation.quality.budgetFulfillmentRatio, validation, status: validation.valid ? 'valid' : 'needs_adjustment' }
}

export const activateGlobalPlanDraft = (data: AppData, draft = data.globalPlanDraft) => {
  if (!draft) throw new Error('当前没有可启用的全课程草案。')
  const validation = validateGlobalPlanDraft(data, draft)
  if (!validation.valid) throw new Error(`总课表未通过统一校验：${validation.reasons.join(' ')}`)
  const protectedTasks = data.tasks.filter(task => task.status === '已完成' || task.status === '进行中')
  const activatedTasks = draft.tasks.map(task => ({
    ...task,
    status: '待完成' as const,
    scheduleStatus: task.scheduleStatus === 'scheduled' ? 'scheduled' as const : 'needs-confirmation' as const,
    date: task.scheduleStatus === 'scheduled' ? task.date : '',
    time: task.scheduleStatus === 'scheduled' ? task.time : '',
    slotId: task.scheduleStatus === 'scheduled' ? task.slotId : '',
  }))
  const nextTasks = [...protectedTasks, ...activatedTasks]
  const changeSet = createTaskChangeSet(data.tasks, nextTasks, `启用第 ${draft.version} 版全部课程计划`, { scope: 'plan', source: 'regeneration' })
  const currentActivePlans = data.plans.filter(plan => plan.status === 'active' || plan.status === 'stale')
  const archivedSnapshots = Object.fromEntries(currentActivePlans.map(plan => [plan.id, data.tasks.filter(task => task.courseId === plan.courseId).map(task => ({ ...task }))]))
  const plans: PlanSnapshot[] = draft.courseIds.map(courseId => {
    const diagnosis = data.diagnoses[courseId]
    const course = data.courses.find(item => item.id === courseId)!
    const basis = draft.planningBases[courseId]
    return {
      id: `${draft.id}:${courseId}`,
      bundleId: draft.id,
      version: Math.max(0, ...data.plans.filter(plan => plan.courseId === courseId).map(plan => plan.version)) + 1,
      courseId,
      diagnosisId: basis.source === 'completed-diagnosis' ? diagnosis?.id : undefined,
      diagnosisVersion: basis.source === 'completed-diagnosis' ? diagnosis?.version : undefined,
      planningBasis: basis,
      diagnosisInputHash: diagnosisInputHash(course),
      planInputHash: draft.planInputHash,
      inputSnapshotHash: `${course.revision}:${draft.createdAt}`,
      generatedAt: draft.createdAt,
      activatedAt: localTimestamp(),
      status: 'active',
      taskIds: activatedTasks.filter(task => task.courseId === courseId).map(task => task.id),
      pendingTaskIds: [],
      staleReasons: [],
    }
  })
  const activatedDraft: GlobalPlanDraft = { ...draft, validation, status: 'activated', activatedAt: localTimestamp() }
  return reconcileScheduleDomain({
    ...data,
    planningBases: { ...data.planningBases, ...draft.planningBases },
    tasks: nextTasks,
    globalPlanDraft: activatedDraft,
    globalPlanHistory: [...data.globalPlanHistory.filter(item => item.id !== draft.id), activatedDraft],
    planDrafts: {},
    planTaskArchive: { ...data.planTaskArchive, ...archivedSnapshots, [draft.id]: activatedTasks.map(task => ({ ...task })), ...Object.fromEntries(plans.map(plan => [plan.id, activatedTasks.filter(task => task.courseId === plan.courseId).map(task => ({ ...task }))])) },
    plans: [...data.plans.map(plan => plan.status === 'active' || plan.status === 'stale' || plan.status === 'draft' ? { ...plan, status: 'archived' as const } : plan), ...plans],
    changeSets: [...data.changeSets, changeSet],
    taskEvents: [...data.taskEvents, ...activatedTasks.map(task => recordTaskEvent(task, 'created', '用户确认并启用全部课程计划'))],
    planChanges: [`已启用第 ${draft.version} 版学习路线：本周已安排 ${activatedTasks.filter(task => task.scheduleStatus === 'scheduled').length} 项，其余任务会在后续自然周继续安排。`, ...data.planChanges].slice(0, 50),
  })
}

export const restoreGlobalPlanVersion = (data: AppData, draftId: string) => {
  const target = data.globalPlanHistory.find(item => item.id === draftId)
  const snapshot = data.planTaskArchive[draftId]
  if (!target || !snapshot?.length) throw new Error('这个总课表版本没有可恢复的任务快照。')
  const candidate = { ...target, tasks: snapshot.map(task => ({ ...task })) }
  const validation = validateGlobalPlanDraft(data, candidate)
  if (!validation.valid) throw new Error(`该版本与当前时间约束冲突：${validation.reasons[0]}`)
  const protectedTasks = data.tasks.filter(task => task.status === '已完成' || task.status === '进行中')
  const restored = snapshot.filter(task => !protectedTasks.some(item => item.id === task.id)).map(task => ({ ...task }))
  const nextTasks = [...protectedTasks, ...restored]
  const changeSet = createTaskChangeSet(data.tasks, nextTasks, `恢复第 ${target.version} 版全部课程计划`, { scope: 'plan', source: 'regeneration' })
  const activated = { ...candidate, validation, status: 'activated' as const, activatedAt: localTimestamp() }
  return reconcileScheduleDomain({
    ...data,
    tasks: nextTasks,
    globalPlanDraft: activated,
    globalPlanHistory: data.globalPlanHistory.map(item => item.id === target.id ? activated : item.status === 'activated' ? { ...item, status: 'archived' as const } : item),
    changeSets: [...data.changeSets, changeSet],
    planChanges: [`已恢复第 ${target.version} 版全部课程计划；已完成和进行中任务保持不变。`, ...data.planChanges].slice(0, 50),
  })
}

export const planValidationLabel = (code: PlanValidationFailureCode) => failureLabels[code]
