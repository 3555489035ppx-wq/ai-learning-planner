import { localTimestamp } from './dateUtils.ts'
import type { AppData, ChangeSet, Course, LearningTask } from './types.ts'

const comparableTask = (task: LearningTask) => JSON.stringify(task)

export const createTaskChangeSet = (
  beforeTasks: LearningTask[],
  afterTasks: LearningTask[],
  reason: string,
  options: { scope?: ChangeSet['scope']; courseId?: string; weekId?: string; source?: ChangeSet['source'] } = {},
): ChangeSet => {
  const beforeMap = new Map(beforeTasks.map(task => [task.id, task]))
  const afterMap = new Map(afterTasks.map(task => [task.id, task]))
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()])
  const changes = [...ids].flatMap(id => {
    const before = beforeMap.get(id)
    const after = afterMap.get(id)
    if (before && after && comparableTask(before) === comparableTask(after)) return []
    return [{
      entityId: id,
      before: before ? { ...before } : { __exists: false },
      after: after ? { ...after } : { __exists: false },
    }]
  })
  return {
    id: crypto.randomUUID(),
    scope: options.scope ?? 'task',
    courseId: options.courseId,
    weekId: options.weekId,
    reason,
    source: options.source ?? (options.scope === 'week' ? 'weekly_review' : options.scope === 'plan' ? 'regeneration' : 'manual'),
    createdAt: localTimestamp(),
    changes,
  }
}

export const createCourseChangeSet = (
  beforeCourses: Course[],
  afterCourses: Course[],
  reason: string,
  courseId?: string,
): ChangeSet => {
  const beforeMap = new Map(beforeCourses.map(course => [course.id, course]))
  const afterMap = new Map(afterCourses.map(course => [course.id, course]))
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()])
  return {
    id: crypto.randomUUID(),
    scope: 'course',
    courseId,
    reason,
    source: 'manual',
    createdAt: localTimestamp(),
    changes: [...ids].flatMap(id => {
      const before = beforeMap.get(id)
      const after = afterMap.get(id)
      if (before && after && JSON.stringify(before) === JSON.stringify(after)) return []
      return [{
        entityId: `__course:${id}`,
        before: before ? { ...before } : { __exists: false },
        after: after ? { ...after } : { __exists: false },
      }]
    }),
  }
}

const applySide = (tasks: LearningTask[], changeSet: ChangeSet, side: 'before' | 'after') => {
  const next = new Map(tasks.map(task => [task.id, task]))
  changeSet.changes.forEach(change => {
    if (change.entityId.startsWith('__')) return
    const value = change[side]
    if (value.__exists === false) next.delete(change.entityId)
    else next.set(change.entityId, value as unknown as LearningTask)
  })
  return [...next.values()]
}

export const applyTaskChangeSet = (tasks: LearningTask[], changeSet: ChangeSet) => applySide(tasks, changeSet, 'after')

export const revertTaskChangeSet = (tasks: LearningTask[], changeSet: ChangeSet) => applySide(tasks, changeSet, 'before')

export const commitChangeSet = (data: AppData, changeSet: ChangeSet): AppData => ({
  ...data,
  tasks: applyTaskChangeSet(data.tasks, changeSet),
  schedule: (changeSet.changes.find(change => change.entityId === '__schedule')?.after as unknown as AppData['schedule']) ?? data.schedule,
  changeSets: [...data.changeSets, changeSet],
})

export const revertChangeSet = (data: AppData, changeSetId: string): AppData => {
  const changeSet = data.changeSets.find(item => item.id === changeSetId && !item.revertedAt)
  if (!changeSet) return data
  const revertedAt = localTimestamp()
  const courseChanges = new Map(changeSet.changes.filter(change => change.entityId.startsWith('__course:')).map(change => [change.entityId.slice('__course:'.length), change.before]))
  const courses = new Map(data.courses.map(course => [course.id, course]))
  courseChanges.forEach((before, id) => {
    if (before.__exists === false) courses.delete(id)
    else courses.set(id, before as unknown as Course)
  })
  const plansChange = changeSet.changes.find(change => change.entityId === '__plans')?.before as { value?: AppData['plans'] } | undefined
  const diagnosisChanges = changeSet.changes.filter(change => change.entityId.startsWith('__diagnosis:'))
  const diagnoses = { ...data.diagnoses }
  diagnosisChanges.forEach(change => {
    const id = change.entityId.slice('__diagnosis:'.length)
    if (change.before.__exists === false) delete diagnoses[id]
    else diagnoses[id] = change.before as unknown as AppData['diagnoses'][string]
  })
  return {
    ...data,
    tasks: revertTaskChangeSet(data.tasks, changeSet),
    schedule: (changeSet.changes.find(change => change.entityId === '__schedule')?.before as unknown as AppData['schedule']) ?? data.schedule,
    courses: [...courses.values()],
    plans: plansChange?.value ?? data.plans,
    diagnoses,
    changeSets: data.changeSets.map(item => item.id === changeSetId ? { ...item, revertedAt } : item),
  }
}
