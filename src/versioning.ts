import { localTimestamp } from './dateUtils.ts'
import { diagnosisInputHash } from './planningBasis.ts'
import type { AppData, Course, ScheduleProfile } from './types.ts'

const planCourseInput = (course: Course) => ({
  diagnosis: diagnosisInputHash(course),
  goalType: course.goalType,
  targetScore: course.targetScore,
  targetDate: course.targetDate,
  priority: course.priority,
  priorityWeight: course.priorityWeight,
  desiredResult: course.desiredResult,
})

const scheduleInput = (schedule: ScheduleProfile) => ({
  holidayStart: schedule.holidayStart,
  holidayEnd: schedule.holidayEnd,
  weekdayMinutes: schedule.weekdayMinutes,
  weekendMinutes: schedule.weekendMinutes,
  preferredTimes: schedule.preferredTimes,
  constraints: schedule.constraints,
  restDays: schedule.restDays,
  maxFocusMinutes: schedule.maxFocusMinutes,
  dailyOverrides: schedule.dailyOverrides,
  useDefaultTimetable: schedule.useDefaultTimetable,
  timeSlots: schedule.timeSlots,
})

const hashText = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(36)
}

export const inputSnapshotHash = (course: Course, schedule: ScheduleProfile) => hashText(JSON.stringify({ course: planCourseInput(course), schedule: scheduleInput(schedule) }))

const planCourseFingerprint = (course: Course | undefined) => course ? JSON.stringify(planCourseInput(course)) : ''
const diagnosisCourseFingerprint = (course: Course | undefined) => course ? diagnosisInputHash(course) : ''
const scheduleFingerprint = (schedule: ScheduleProfile) => JSON.stringify(scheduleInput(schedule))

export const markStaleDependencies = (previous: AppData, next: AppData): AppData => {
  const scheduleChanged = scheduleFingerprint(previous.schedule) !== scheduleFingerprint(next.schedule)
  const previousIds = new Set(previous.courses.filter(course => !course.archivedAt).map(course => course.id))
  const nextIds = new Set(next.courses.filter(course => !course.archivedAt).map(course => course.id))
  const membershipChanged = previousIds.size !== nextIds.size || [...previousIds].some(id => !nextIds.has(id))
  const diagnosisChangedIds = new Set<string>()
  const planChangedIds = new Set<string>()
  next.courses.forEach(course => {
    const before = previous.courses.find(item => item.id === course.id)
    if (!before) return
    if (diagnosisCourseFingerprint(before) !== diagnosisCourseFingerprint(course)) diagnosisChangedIds.add(course.id)
    if (planCourseFingerprint(before) !== planCourseFingerprint(course)) planChangedIds.add(course.id)
  })
  if (!scheduleChanged && !membershipChanged && !planChangedIds.size) return next
  const courses = next.courses.map(course => diagnosisChangedIds.has(course.id) ? { ...course, revision: Math.max(course.revision, (previous.courses.find(item => item.id === course.id)?.revision ?? 0) + 1) } : course)
  const diagnoses = { ...next.diagnoses }
  diagnosisChangedIds.forEach(courseId => {
    if (diagnoses[courseId]?.status === 'completed') diagnoses[courseId] = { ...diagnoses[courseId], status: 'superseded' }
  })
  const planningBases = Object.fromEntries(Object.entries(next.planningBases).filter(([courseId]) => !diagnosisChangedIds.has(courseId)))
  const plans = next.plans.map(plan => {
    if (plan.status !== 'active' && plan.status !== 'stale') return plan
    const reasons = [...plan.staleReasons]
    if (scheduleChanged) reasons.push('假期、可用时间或课表节次发生变化')
    if (membershipChanged) reasons.push('启用课程集合发生变化')
    if (diagnosisChangedIds.has(plan.courseId)) reasons.push('课程、教材或评估证据发生变化')
    else if (planChangedIds.has(plan.courseId)) reasons.push('课程目标或优先级发生变化')
    return reasons.length > plan.staleReasons.length ? { ...plan, status: 'stale' as const, staleReasons: [...new Set(reasons)] } : plan
  })
  const changedPlan = plans.some((plan, index) => plan.status !== next.plans[index]?.status || plan.staleReasons.length !== next.plans[index]?.staleReasons.length)
  const summary = scheduleChanged ? '现实时间发生变化，只需重排计划，已有诊断继续有效'
    : diagnosisChangedIds.size ? '课程事实发生变化，仅对应课程诊断需要复核'
      : membershipChanged ? '课程集合发生变化，需要重新生成全课程计划' : '目标或优先级发生变化，需要重新计算计划'
  return {
    ...next,
    courses,
    diagnoses,
    planningBases,
    plans,
    globalPlanDraft: changedPlan && next.globalPlanDraft?.status === 'activated' ? { ...next.globalPlanDraft, status: 'needs_adjustment' } : next.globalPlanDraft,
    planChanges: changedPlan
      ? [`${summary}。请先查看差异再应用。`, ...next.planChanges].slice(0, 50)
      : next.planChanges,
  }
}

export const archiveActivePlans = (data: AppData, courseIds = data.courses.map(course => course.id)): AppData => {
  const ids = new Set(courseIds)
  const archivedAt = localTimestamp()
  return {
    ...data,
    plans: data.plans.map(plan => ids.has(plan.courseId) && (plan.status === 'active' || plan.status === 'stale') ? { ...plan, status: 'archived', staleReasons: [...plan.staleReasons, `归档于 ${archivedAt}`] } : plan),
  }
}

export const activePlanForCourse = (data: AppData, courseId: string) => [...data.plans].reverse().find(plan => plan.courseId === courseId && (plan.status === 'active' || plan.status === 'stale'))
