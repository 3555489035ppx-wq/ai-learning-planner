import type { EvidenceRecord, LearningTask } from '../types.ts'

type CompletionInput = {
  actualMinutes: number
  degree: '全部完成' | '部分完成' | '未完成'
  note?: string
  occurredAt?: string
  eventId?: string
}

const createRecord = (record: Omit<EvidenceRecord, 'id'>): EvidenceRecord => ({ id: crypto.randomUUID(), ...record })

/**
 * Evidence is deliberately separate from task state: a checked task is not proof of
 * mastery, while time and self-report remain useful but lower-confidence signals.
 */
export const evidenceFromCompletion = (task: LearningTask, input: CompletionInput): EvidenceRecord[] => {
  const observedAt = input.occurredAt ?? new Date().toISOString()
  const base = {
    courseId: task.courseId,
    taskId: task.id,
    knowledgePointId: task.knowledgePointIds[0] || task.knowledgePoint || undefined,
    observedAt,
    provenance: { eventId: input.eventId, provider: 'local' as const, schemaVersion: 6 },
  }
  const records: EvidenceRecord[] = [
    createRecord({ ...base, type: 'time_spent', source: 'task', value: input.actualMinutes, unit: 'minutes', comparabilityKey: `time:${task.courseId}:${task.knowledgePoint}`, confidence: .86 }),
    createRecord({ ...base, type: 'task_completion', source: 'task', value: input.degree, unit: 'level', rubric: task.evidenceRequirement.completionRule || task.completionCriteria, comparabilityKey: `completion:${task.id}`, confidence: input.degree === '全部完成' ? .76 : .52 }),
  ]
  if (input.note?.trim()) records.push(createRecord({ ...base, type: 'self_check', source: 'user', value: input.note.trim(), unit: 'text', rubric: '学习者记录的结果、卡点或下一步', comparabilityKey: `reflection:${task.courseId}:${task.knowledgePoint}`, confidence: .56 }))
  return records
}

export const evidenceFromSkip = (task: LearningTask, reason: string, eventId?: string): EvidenceRecord => createRecord({
  courseId: task.courseId,
  taskId: task.id,
  knowledgePointId: task.knowledgePointIds[0] || task.knowledgePoint || undefined,
  type: 'skip_reason',
  source: 'task',
  value: reason,
  unit: 'text',
  rubric: '用户主动填写的跳过原因',
  comparabilityKey: `skip:${task.courseId}`,
  observedAt: new Date().toISOString(),
  provenance: { eventId, provider: 'user', schemaVersion: 6 },
  confidence: .72,
})

export const evidenceForTask = (records: EvidenceRecord[], taskId: string) => records.filter(record => record.taskId === taskId)

export const comparableEvidence = (records: EvidenceRecord[], courseId: string, comparabilityKey: string) => records
  .filter(record => record.courseId === courseId && record.comparabilityKey === comparabilityKey)
  .sort((left, right) => left.observedAt.localeCompare(right.observedAt))

export const evidenceNarrative = (records: EvidenceRecord[], courseId: string) => {
  const courseRecords = records.filter(record => record.courseId === courseId)
  const spent = courseRecords.filter(record => record.type === 'time_spent').reduce((total, record) => total + (typeof record.value === 'number' ? record.value : 0), 0)
  const objective = courseRecords.filter(record => record.type === 'objective_result' && typeof record.value === 'number')
  const latestObjective = objective.sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]
  return {
    spent,
    objective: latestObjective ? Number(latestObjective.value) : null,
    hasComparableResult: objective.length >= 2,
    summary: courseRecords.length ? `已记录 ${courseRecords.length} 条学习证据，其中实际投入 ${spent} 分钟。` : '尚无可用于比较的学习证据；完成任务本身不会被当作掌握度。',
  }
}
