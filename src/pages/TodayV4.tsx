import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CourseSwitcher, EmptyState, Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { CourseManager } from '../components/CourseManager.tsx'
import { applyTaskChangeSet, revertChangeSet } from '../changeSets.ts'
import { createTask } from '../data.ts'
import { addDays, dayName, localDateISO } from '../dateUtils.ts'
import { generateDailyChecks, selectDailyCheckState, submitDailyCheck } from '../dailyCheck.ts'
import { evidenceFromCompletion, evidenceFromSkip } from '../domain/evidence.ts'
import { buildRecoveryProposal, detectRecoverySignals } from '../domain/recovery.ts'
import { matchingResources, recordTaskEvent } from '../providers.ts'
import { capacityForDate, validateScheduleChange } from '../scheduler.ts'
import { useStore } from '../store.tsx'
import { periodLabels } from '../timetable.ts'
import type { AppData, DailyCheck, LearningTask } from '../types.ts'

const dateLabel = (date: string) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))

function DailyCheckPanel({ check, data, onRecorded, onLater }: { check: DailyCheck; data: AppData; onRecorded: (event: AppData['quizEvents'][number], needsReview: boolean) => void; onLater: () => void }) {
  const [answer, setAnswer] = useState('')
  const [confidence, setConfidence] = useState<AppData['quizEvents'][number]['confidence']>()
  const [submitError, setSubmitError] = useState('')
  const submit = () => {
    if (!answer.trim() || !confidence) return
    try {
      const event = submitDailyCheck(data, check, answer, confidence)
      onRecorded(event, event.evidenceType === 'objective_quiz' ? event.score < event.maxScore : confidence === '需要复习')
      setSubmitError('')
    } catch (reason) { setSubmitError(reason instanceof Error ? reason.message : '自检记录失败。') }
  }
  return <section className="daily-check-panel" aria-labelledby="daily-check-title"><div className="section-title"><div><span className="section-kicker">今日快速自检 · 1–3 分钟</span><h2 id="daily-check-title">用真实作答检查今天的学习</h2></div><span className="status-pill">{check.questionType === 'objective' ? '客观题' : check.questionType === 'performance' ? '产出检查' : check.questionType === 'application' ? '应用题' : '主动回忆'}</span></div><p>{check.prompt}</p>{check.options ? <div className="daily-check-options">{check.options.map(option => <label key={option} className={answer === option ? 'selected' : ''}><input type="radio" name={`daily-check-${check.id}`} checked={answer === option} onChange={() => setAnswer(option)} />{option}</label>)}</div> : <label className="field"><span>{check.questionType === 'performance' ? '产出说明与检查结果' : '你的答案、步骤或结果'}</span><textarea name={`daily-check-answer-${check.id}`} autoComplete="off" rows={4} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="请写下真实作答，不能只填写“掌握”或“不会”…" />{check.rubric?.length ? <small>检查要点：{check.rubric.join('；')}</small> : null}</label>}<fieldset className="confidence-field"><legend>你对这次作答的信心（不计入正确率）</legend><div className="daily-check-options">{(['掌握', '部分掌握', '需要复习'] as const).map(option => <label key={option} className={confidence === option ? 'selected' : ''}><input type="radio" name={`daily-confidence-${check.id}`} checked={confidence === option} onChange={() => setConfidence(option)} />{option}</label>)}</div></fieldset>{submitError && <InlineNotice tone="error">{submitError}</InlineNotice>}<div className="daily-check-actions"><button className="button secondary" onClick={onLater}>稍后再做</button><button className="button primary" onClick={submit} disabled={!answer.trim() || !confidence}>保存作答</button></div></section>
}

function DailyCheckSummary({ check, event, onReview }: { check: DailyCheck; event: AppData['quizEvents'][number]; onReview: () => void }) {
  const objective = event.evidenceType === 'objective_quiz' && event.maxScore > 0
  const needsReview = objective ? event.score < event.maxScore : event.confidence === '需要复习'
  return <section className="daily-check-summary" aria-labelledby="daily-check-summary-title"><div><span className="section-kicker">最近一次今日自检</span><h2 id="daily-check-summary-title">作答已保存</h2><p>{new Date(event.occurredAt).toLocaleString('zh-CN')} · {objective ? `客观得分 ${event.score}/${event.maxScore}` : `证据类型：${event.evidenceType === 'performance_task' ? '表现任务' : '自评'}`}</p></div><dl><div><dt>作答证据</dt><dd>{event.answer}</dd></div><div><dt>复习建议</dt><dd>{needsReview ? '建议安排一次短复习并使用新任务验证。' : '暂不追加任务，按原计划继续。'}</dd></div><div><dt>判断说明</dt><dd>{objective ? check.explanation : `这不是客观题，不显示正确或错误。${check.explanation}`}</dd></div></dl>{needsReview && <button className="button secondary" onClick={onReview}>把薄弱点加入后续计划</button>}</section>
}

export default function TodayV4() {
  const { data, updateData, notify } = useStore()
  const today = localDateISO()
  const [courseFilter, setCourseFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [completeTask, setCompleteTask] = useState<LearningTask | null>(null)
  const [completion, setCompletion] = useState({ actualMinutes: '30', degree: '全部完成' as '全部完成' | '部分完成' | '未完成', note: '', continueNeeded: false })
  const [skipTask, setSkipTask] = useState<LearningTask | null>(null)
  const [deletingTask, setDeletingTask] = useState<LearningTask | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [editTask, setEditTask] = useState<LearningTask | null>(null)
  const [capacityOpen, setCapacityOpen] = useState(false)
  const [capacityDraft, setCapacityDraft] = useState(String(data.schedule.dailyOverrides[today] ?? capacityForDate(today, data.schedule)))
  const [addOpen, setAddOpen] = useState(false)
  const [addDraft, setAddDraft] = useState({ courseId: data.courses[0]?.id ?? '', title: '', knowledgePoint: '', slotId: data.schedule.timeSlots.find(slot => slot.enabled)?.id ?? '', estimatedMinutes: '30' })
  const [error, setError] = useState('')
  const [dismissedCheckId, setDismissedCheckId] = useState('')
  const [checkStatus, setCheckStatus] = useState('')
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [lastRecoveryChangeSetId, setLastRecoveryChangeSetId] = useState('')

  const courseById = useMemo(() => new Map(data.courses.map(course => [course.id, course])), [data.courses])
  const recoverySignals = useMemo(() => detectRecoverySignals(data, today), [data, today])
  const recoveryProposal = useMemo(() => buildRecoveryProposal(data, recoverySignals), [data, recoverySignals])
  const todayTasks = useMemo(() => data.tasks.filter(task => task.date === today && (!courseFilter || task.courseId === courseFilter)).sort((a, b) => a.time.localeCompare(b.time)), [courseFilter, data.tasks, today])
  const actionable = todayTasks.filter(task => task.status === '待完成' || task.status === '进行中' || task.status === '已延期')
  const nextTask = actionable[0]
  const completed = todayTasks.filter(task => task.status === '已完成')
  const remaining = actionable.reduce((sum, task) => sum + task.estimatedMinutes, 0)
  const checks = data.dailyChecks.filter(check => completed.some(task => task.id === check.taskId))
  const { pendingCheck, latestSubmittedCheck, latestSubmittedEvent } = selectDailyCheckState(checks, data.quizEvents, { enabled: data.settings.dailySelfCheck, dismissedCheckId })

  const startTask = (task: LearningTask) => {
    updateData(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, status: '进行中' } : item), taskEvents: [...current.taskEvents, recordTaskEvent(task, 'started', '用户从今日页开始任务')] }))
    notify(`已开始“${task.title}”。`)
  }

  const applyRecovery = (optionId: string) => {
    const proposal = recoveryProposal
    const option = proposal?.options.find(item => item.id === optionId)
    if (!proposal || !option) return
    if (option.type === 'keep_plan') {
      updateData(current => ({ ...current, recoveryProposals: [...current.recoveryProposals, { ...proposal, status: 'dismissed', selectedOptionId: option.id }], activeRecoveryProposalId: '' }))
      notify('已保留当前计划；恢复信号会继续出现在学习进展中。', 'info'); setRecoveryOpen(false); return
    }
    const changeSet = option.changeSetPreview
    if (!changeSet) return
    updateData(current => ({ ...current, tasks: applyTaskChangeSet(current.tasks, changeSet), changeSets: [...current.changeSets, changeSet], recoveryProposals: [...current.recoveryProposals, { ...proposal, status: 'applied', selectedOptionId: option.id }], activeRecoveryProposalId: proposal.id, planChanges: [`恢复计划：${option.explanation}`, ...current.planChanges] }))
    setLastRecoveryChangeSetId(changeSet.id)
    notify('恢复方案已应用，并保留了可撤销的变更记录。'); setRecoveryOpen(false)
  }

  const undoRecovery = () => {
    const changeSet = data.changeSets.find(item => item.id === lastRecoveryChangeSetId && !item.revertedAt)
    if (!changeSet) return
    updateData(current => ({ ...revertChangeSet(current, changeSet.id), activeRecoveryProposalId: '', planChanges: [`已撤销恢复计划：${changeSet.reason}`, ...current.planChanges] }))
    setLastRecoveryChangeSetId('')
    notify('已撤销这次恢复安排，其他后续修改保持不变。', 'info')
  }

  const openComplete = (task: LearningTask) => {
    setCompletion({ actualMinutes: String(task.estimatedMinutes), degree: '全部完成', note: '', continueNeeded: false })
    setCompleteTask(task); setMoreOpen(false)
  }

  const saveCompletion = () => {
    if (!completeTask) return
    const actualMinutes = Number(completion.actualMinutes)
    if (!Number.isFinite(actualMinutes) || actualMinutes < 0 || actualMinutes > 720) { setError('实际学习时间应为 0–720 分钟。'); return }
    const nextStatus = completion.degree === '未完成' ? '待完成' as const : '已完成' as const
    const hasCheck = data.dailyChecks.some(check => check.taskId === completeTask.id && check.generatedAt.slice(0, 10) === today)
    let checksToAdd: DailyCheck[] = []
    if (nextStatus === '已完成' && data.settings.dailySelfCheck && !hasCheck) {
      try { checksToAdd = generateDailyChecks(data, completeTask, 1); setCheckStatus('') }
      catch { setCheckStatus('今日暂无新题。你可以继续执行计划，稍后再试。') }
    }
    updateData(current => ({ ...current, tasks: current.tasks.map(item => item.id === completeTask.id ? { ...item, status: nextStatus, changeNote: completion.continueNeeded ? '需要后续继续任务' : item.changeNote } : item), taskEvents: [...current.taskEvents, recordTaskEvent(completeTask, 'completed', completion.note || completion.degree, actualMinutes, { completionDegree: completion.degree, note: completion.note, continueNeeded: completion.continueNeeded })], evidenceRecords: [...current.evidenceRecords, ...evidenceFromCompletion(completeTask, { actualMinutes, degree: completion.degree, note: completion.note })], dailyChecks: [...current.dailyChecks, ...checksToAdd] }))
    notify(nextStatus === '已完成' ? checksToAdd.length ? '完成记录已保存；可以进行今日自检。' : '完成记录已保存。' : '已保留为待完成任务。')
    setCompleteTask(null); setError('')
  }

  const delay = (task: LearningTask) => {
    const targetDate = addDays(task.date, 1)
    const validation = validateScheduleChange(task, { date: targetDate, slotId: task.slotId, time: task.time }, data.tasks, data.schedule)
    if (!validation.valid) { setError(validation.reasons.join(' ')); return }
    updateData(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, date: targetDate, status: '已延期', changeNote: '从今日页延期一天' } : item), taskEvents: [...current.taskEvents, recordTaskEvent(task, 'delayed', `延期到 ${targetDate}`)], planChanges: [`“${task.title}”延期到 ${targetDate}。`, ...current.planChanges] }))
    notify('任务已延期一天。'); setMoreOpen(false)
  }

  const saveSkip = () => {
    if (!skipTask || !skipReason.trim()) { setError('请填写跳过原因。'); return }
    updateData(current => ({ ...current, tasks: current.tasks.map(item => item.id === skipTask.id ? { ...item, status: '已跳过', skipReason: skipReason.trim() } : item), taskEvents: [...current.taskEvents, recordTaskEvent(skipTask, 'skipped', skipReason.trim())], evidenceRecords: [...current.evidenceRecords, evidenceFromSkip(skipTask, skipReason.trim())] }))
    notify('已记录跳过原因。'); setSkipTask(null); setSkipReason(''); setError('')
  }

  const deleteCurrentTask = () => {
    if (!deletingTask) return
    updateData(current => ({
      ...current,
      tasks: current.tasks.filter(task => task.id !== deletingTask.id),
      taskEvents: [...current.taskEvents, recordTaskEvent(deletingTask, 'deleted', '用户从今日页删除任务')],
      planChanges: [`“${deletingTask.title}”已从今日计划删除。`, ...current.planChanges],
    }))
    notify('任务已删除；删除记录已保留在学习进展中。')
    setDeletingTask(null)
    setMoreOpen(false)
  }

  const cycleResource = (task: LearningTask) => {
    const choices = matchingResources(data, task.courseId, task.knowledgePoint)
    if (!choices.length) { setError('没有与这门课程和知识点匹配的已审核资源。'); return }
    const index = choices.findIndex(resource => resource.id === task.resourceId)
    const resource = choices[(index + 1) % choices.length]
    updateData(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, resourceId: resource.id, materialLabel: resource.title, changeNote: '用户在今日页更换资源' } : item), taskEvents: [...current.taskEvents, recordTaskEvent(task, 'resource-changed', `更换为“${resource.title}”`)] }))
    notify(`已切换为“${resource.title}”。`); setMoreOpen(false)
  }

  const saveEdit = () => {
    if (!editTask || !editTask.title.trim() || !editTask.knowledgePoint.trim()) { setError('任务名称和知识点不能为空。'); return }
    const validation = validateScheduleChange(data.tasks.find(task => task.id === editTask.id) ?? editTask, { date: editTask.date, slotId: editTask.slotId, time: data.schedule.timeSlots.find(slot => slot.id === editTask.slotId)?.start, estimatedMinutes: editTask.estimatedMinutes }, data.tasks, data.schedule)
    if (!validation.valid) { setError(validation.reasons.join(' ')); return }
    updateData(current => ({ ...current, tasks: current.tasks.map(task => task.id === editTask.id ? { ...editTask, time: current.schedule.timeSlots.find(slot => slot.id === editTask.slotId)?.start ?? editTask.time } : task), taskEvents: [...current.taskEvents, recordTaskEvent(editTask, 'edited', '用户在今日页编辑任务')] }))
    notify('任务已更新。'); setEditTask(null); setError('')
  }

  const saveCapacity = () => {
    const minutes = Number(capacityDraft)
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 720) { setError('今日学习时长应为 0–720 分钟。'); return }
    updateData(current => ({ ...current, schedule: { ...current.schedule, dailyOverrides: { ...current.schedule.dailyOverrides, [today]: minutes } }, planChanges: [`今日容量调整为 ${minutes} 分钟；既有任务未被静默删除。`, ...current.planChanges] }))
    notify('今日可用时间已保存。'); setCapacityOpen(false); setError('')
  }

  const addTask = () => {
    const slot = data.schedule.timeSlots.find(item => item.id === addDraft.slotId)
    const course = courseById.get(addDraft.courseId)
    if (!course || !slot || !addDraft.title.trim() || !addDraft.knowledgePoint.trim()) { setError('请填写课程、任务、知识点和节次。'); return }
    const task = createTask({ id: crypto.randomUUID(), planId: 'user-task', date: today, originalPlannedDate: today, time: slot.start, slotId: slot.id, courseId: course.id, title: addDraft.title.trim(), action: `完成“${addDraft.title.trim()}”并记录结果或卡点`, knowledgePoint: addDraft.knowledgePoint.trim(), unitId: 'user-input', estimatedMinutes: Number(addDraft.estimatedMinutes), practiceMinutes: Math.max(0, Number(addDraft.estimatedMinutes) - 5), quizMinutes: 5, completionCriteria: '完成任务并记录一个结果或卡点。', completionCriteriaItems: ['完成任务', '记录结果或卡点'], arrangementReason: '用户主动添加到今日课表。', status: '待完成', source: 'temporary' })
    const validation = validateScheduleChange(task, { date: today, slotId: slot.id, time: slot.start, estimatedMinutes: task.estimatedMinutes }, data.tasks, data.schedule)
    if (!validation.valid) { setError(validation.reasons.join(' ')); return }
    updateData(current => ({ ...current, tasks: [...current.tasks, task], taskEvents: [...current.taskEvents, recordTaskEvent(task, 'created', '用户在今日页添加任务')] }))
    notify('任务已加入今日课表。'); setAddOpen(false); setError('')
  }

  const recordCheck = (event: AppData['quizEvents'][number], needsReview: boolean) => {
    updateData(current => ({ ...current, quizEvents: [...current.quizEvents, event], planChanges: needsReview ? [`今日自检显示“${event.point}”仍需复习；等待用户确认是否加入后续计划。`, ...current.planChanges] : current.planChanges }))
    notify('今日自检结果已记录。')
  }

  const addReviewTask = (check: DailyCheck) => {
    const sourceTask = data.tasks.find(task => task.id === check.taskId)
    if (!sourceTask) return
    const review = createTask({ ...sourceTask, id: crypto.randomUUID(), date: addDays(today, 1), originalPlannedDate: addDays(today, 1), status: '待确认', title: `${sourceTask.title} · 短复习`, resourceId: '', materialLabel: '', estimatedMinutes: 20, watchMinutes: 0, practiceMinutes: 15, quizMinutes: 5, arrangementReason: '用户确认把今日自检薄弱点加入后续计划。', changeNote: '今日自检后新增' })
    const validation = validateScheduleChange(review, { date: review.date, slotId: review.slotId, time: review.time, estimatedMinutes: review.estimatedMinutes }, data.tasks, data.schedule)
    const task = validation.valid ? { ...review, status: '待完成' as const, scheduleStatus: 'scheduled' as const } : { ...review, date: '', time: '', slotId: '', scheduleStatus: 'needs-confirmation' as const, scheduleIssue: validation.reasons.join(' ') }
    updateData(current => ({ ...current, tasks: [...current.tasks, task], taskEvents: [...current.taskEvents, recordTaskEvent(task, 'created', '今日自检薄弱点复习')] }))
    notify(validation.valid ? '短复习已加入明日课表。' : '已加入待确认列表，请在计划页选择节次。')
  }

  const capacity = data.schedule.dailyOverrides[today] ?? capacityForDate(today, data.schedule)
  const capacitySource = data.schedule.dailyOverrides[today] !== undefined
    ? '来自今天的临时调整'
    : data.schedule.constraints.some(item => item.startAt.slice(0, 10) <= today && item.endAt.slice(0, 10) >= today)
      ? '已结合旅行或固定安排'
      : data.schedule.restDays.includes(dayName(today)) ? '来自休息日设置' : '来自你的工作日/周末设置'
  const activePlanExists = data.globalPlanDraft?.status === 'activated' || data.plans.some(plan => plan.status === 'active' || plan.status === 'stale')
  const hasSchedulingFailure = data.tasks.some(task => task.scheduleStatus === 'unscheduled')
  const emptyReason = data.schedule.restDays.includes(dayName(today)) ? '今天是你设置的休息日。' : capacity === 0 ? '今天受旅行、固定安排或容量设置影响，没有可用学习时间。' : !activePlanExists ? '总课表尚未启用，请先在学习计划中生成并确认全部课程计划。' : hasSchedulingFailure ? '部分任务排程失败，请到学习计划查看失败原因并调整约束。' : '今天没有系统安排的任务，可以查看明日计划或添加一项临时任务。'
  const actualMinutesToday = data.taskEvents.filter(event => event.type === 'completed' && event.occurredAt.slice(0, 10) === today).reduce((sum, event) => sum + event.actualMinutes, 0)
  const enabledSlots = data.schedule.timeSlots.filter(slot => slot.enabled)
  const visibleSlots = showAll ? enabledSlots : enabledSlots.filter(slot => todayTasks.some(task => task.slotId === slot.id))
  const emptySlotCount = enabledSlots.length - enabledSlots.filter(slot => todayTasks.some(task => task.slotId === slot.id)).length

  return <div className="page today-page">
    <PageHeader eyebrow={dateLabel(today)} title="现在，只做下一件事" description={`已完成 ${completed.length}/${todayTasks.length} 项 · 预计剩余 ${remaining} 分钟 · 今日可用上限 ${capacity} 分钟（${capacitySource}）`} actions={<button className="button secondary" onClick={() => setAddOpen(true)}><Icon name="plus" /> 添加任务</button>} />
    <CourseSwitcher courses={data.courses} value={courseFilter} onChange={setCourseFilter} includeAll action={<CourseManager className="course-add-action" />} />
    {lastRecoveryChangeSetId && <InlineNotice tone="success"><strong>恢复安排已应用。</strong> 未完成任务已重新回到任务池并参与后续排程。<button className="inline-action" onClick={undoRecovery}>撤销这次恢复</button></InlineNotice>}
    {recoveryProposal && <InlineNotice tone="info"><strong>检测到计划需要恢复，而不是简单补回。</strong>{recoverySignals[0]?.explanation}<button className="inline-action" onClick={() => setRecoveryOpen(true)}>查看恢复选项</button></InlineNotice>}
    {nextTask && (nextTask.status === '进行中' || nextTask.difficulty === '进阶') && <section className="today-coaching-bridge"><div><span className="section-kicker">需要人工确认时</span><strong>如果你已经尝试过，仍卡在“{nextTask.knowledgePoint}”</strong><p>可以申请一次有目标的 1 对 1 辅导。辅导结果会变成新的学习证据，不会自动替你改计划。</p></div><Link className="button secondary" to={`/coaching?course=${nextTask.courseId}&task=${nextTask.id}`}>申请辅导</Link></section>}
    {error && <InlineNotice tone="error">{error}</InlineNotice>}

    {nextTask ? <section className="next-task-focus"><div className="next-task-copy"><div className="task-topline"><span className="course-tag">{courseById.get(nextTask.courseId)?.name}</span><span>{data.schedule.timeSlots.find(slot => slot.id === nextTask.slotId)?.label || nextTask.time} · {nextTask.estimatedMinutes} 分钟</span></div><h2>{nextTask.title}</h2><p className="knowledge-point">{nextTask.stageLabel} · {nextTask.knowledgePoint}</p><dl><div><dt>学习动作</dt><dd>{nextTask.action || (nextTask.materialLabel ? `使用“${nextTask.materialLabel}”后完成 ${nextTask.practiceCount} 项练习` : `完成 ${nextTask.practiceCount || 1} 项练习或成果任务`)}</dd></div><div><dt>完成标准</dt><dd>{nextTask.completionCriteria}</dd></div><div><dt>为什么现在做</dt><dd>{nextTask.rationale.summary || nextTask.arrangementReason || nextTask.changeNote || '依据当前课程优先级和可用节次安排。'}</dd></div>{nextTask.rationale.limitations.length > 0 && <div><dt>证据边界</dt><dd>{nextTask.rationale.limitations[0]}</dd></div>}</dl></div><div className="next-task-actions"><button className="button primary" onClick={() => nextTask.status === '进行中' ? openComplete(nextTask) : startTask(nextTask)}>{nextTask.status === '进行中' ? '记录完成' : '开始任务'} <Icon name="arrow" /></button><button className="icon-button" aria-label="更多任务操作" title="更多任务操作" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}><Icon name="more" /></button>{moreOpen && <div className="task-more-menu"><button onClick={() => { setEditTask({ ...nextTask }); setMoreOpen(false) }}>编辑任务</button><button onClick={() => delay(nextTask)}>延期一天</button><button onClick={() => { setSkipTask(nextTask); setSkipReason(''); setMoreOpen(false) }}>跳过并说明原因</button><button onClick={() => cycleResource(nextTask)}>更换学习资源</button><button className="danger-text" onClick={() => { setDeletingTask(nextTask); setMoreOpen(false) }}>删除任务</button></div>}</div></section> : todayTasks.length ? <section className="today-complete-strip" role="status"><div><strong>今日计划已完成</strong><span>共学习 {actualMinutesToday} 分钟</span></div><div><Link className="button secondary" to="/plan">查看明日计划</Link>{pendingCheck ? <a className="button secondary" href="#daily-check-title">进行今日复习</a> : null}</div></section> : <EmptyState title="今天没有待执行任务" description={emptyReason} action={activePlanExists ? <Link className="button primary" to="/plan">查看学习计划</Link> : <Link className="button primary" to="/plan">生成全部课程计划</Link>} />}

    <section className="today-timetable"><div className="section-title"><div><span className="section-kicker">今日 4＋4＋2 课表</span><h2>保留空节，不为了填满而学习</h2><p>{emptySlotCount > 0 ? `剩余 ${emptySlotCount} 个空闲节次，默认已折叠。` : '今天没有空闲节次。'}</p></div><div className="today-secondary-actions"><button className="text-button" onClick={() => setShowAll(value => !value)}>{showAll ? '折叠空闲节次' : '查看空闲节次'}</button><button className="text-button" onClick={() => setCapacityOpen(true)}>调整今日容量</button></div></div><div className="compact-slot-grid">{visibleSlots.map(slot => { const task = todayTasks.find(item => item.slotId === slot.id); return <article className={`${task ? 'has-task' : ''} ${task?.status === '已完成' ? 'completed' : ''}`} key={slot.id}><span>{periodLabels[slot.period]} · {slot.label.split(' ')[1]}</span><strong>{task ? `${task.source === 'temporary' ? '临时 · ' : ''}${task.title}` : '空闲'}</strong><small>{slot.start}–{slot.end}{task ? ` · ${courseById.get(task.courseId)?.name}` : ''}</small>{showAll && task && <p>{task.knowledgePoint} · {task.completionCriteria}</p>}</article> })}</div></section>

    {pendingCheck && <DailyCheckPanel key={pendingCheck.id} check={pendingCheck} data={data} onRecorded={recordCheck} onLater={() => { setDismissedCheckId(pendingCheck.id); notify('自检已暂时收起，可在完成下一项任务后继续。', 'info') }} />}
    {!pendingCheck && latestSubmittedCheck && latestSubmittedEvent && <DailyCheckSummary check={latestSubmittedCheck} event={latestSubmittedEvent} onReview={() => addReviewTask(latestSubmittedCheck)} />}
    {checkStatus && <InlineNotice>{checkStatus}</InlineNotice>}
    {completed.length > 0 && <button type="button" className="text-button daily-check-toggle" onClick={() => updateData(current => ({ ...current, settings: { ...current.settings, dailySelfCheck: !current.settings.dailySelfCheck } }))}>{data.settings.dailySelfCheck ? '关闭每日自检' : '开启每日自检'}</button>}
    {data.planChanges.length > 0 && <details className="today-rationale"><summary>为什么这样安排</summary><ul>{data.planChanges.slice(0, 4).map(item => <li key={item}>{item}</li>)}</ul></details>}

    {completeTask && <Modal title="记录实际完成情况" description="预计时长不会自动当作实际学习时长。" onClose={() => setCompleteTask(null)} footer={<><button className="button secondary" onClick={() => setCompleteTask(null)}>取消</button><button className="button primary" onClick={saveCompletion}>保存记录</button></>}><div className="form-grid two"><label className="field"><span>实际学习分钟</span><input name="actual-study-minutes" type="number" min="0" max="720" value={completion.actualMinutes} onChange={event => setCompletion(current => ({ ...current, actualMinutes: event.target.value }))} /></label><label className="field"><span>完成程度</span><select name="completion-degree" value={completion.degree} onChange={event => setCompletion(current => ({ ...current, degree: event.target.value as typeof current.degree }))}><option>全部完成</option><option>部分完成</option><option>未完成</option></select></label><label className="field full-span"><span>卡点或结果</span><textarea name="completion-note" rows={3} value={completion.note} onChange={event => setCompletion(current => ({ ...current, note: event.target.value }))} /></label><label className="check-field full-span"><input name="continue-needed" type="checkbox" checked={completion.continueNeeded} onChange={event => setCompletion(current => ({ ...current, continueNeeded: event.target.checked }))} /><span><strong>还需要一个后续任务</strong><small>只记录需要，不会静默制造任务</small></span></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {skipTask && <Modal title="跳过这项任务？" description="原因会进入本周复盘，计划不会假装它已完成。" onClose={() => setSkipTask(null)} footer={<><button className="button secondary" onClick={() => setSkipTask(null)}>取消</button><button className="button danger" onClick={saveSkip}>确认跳过</button></>}><label className="field"><span>跳过原因</span><textarea name="skip-reason" rows={3} value={skipReason} onChange={event => setSkipReason(event.target.value)} /></label>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {deletingTask && <Modal title="删除今日任务？" description="任务会从课表移除，但删除事件仍保留在学习进展中。" onClose={() => setDeletingTask(null)} footer={<><button className="button secondary" onClick={() => setDeletingTask(null)}>取消</button><button className="button danger" onClick={deleteCurrentTask}>确认删除</button></>}><p>确定删除「{deletingTask.title}」吗？</p></Modal>}
    {editTask && <Modal title="编辑今日任务" description="节次、时长和冲突会重新校验。" onClose={() => setEditTask(null)} footer={<><button className="button secondary" onClick={() => setEditTask(null)}>取消</button><button className="button primary" onClick={saveEdit}>保存修改</button></>}><div className="form-grid two"><label className="field"><span>任务名称</span><input name="edit-task-title" autoComplete="off" value={editTask.title} onChange={event => setEditTask(current => current ? { ...current, title: event.target.value } : current)} /></label><label className="field"><span>知识点</span><input name="edit-task-knowledge" autoComplete="off" value={editTask.knowledgePoint} onChange={event => setEditTask(current => current ? { ...current, knowledgePoint: event.target.value } : current)} /></label><label className="field"><span>目标节次</span><select name="edit-task-slot" value={editTask.slotId} onChange={event => setEditTask(current => current ? { ...current, slotId: event.target.value } : current)}>{data.schedule.timeSlots.filter(slot => slot.enabled).map(slot => <option key={slot.id} value={slot.id}>{slot.label} · {slot.start}</option>)}</select></label><label className="field"><span>预计分钟</span><input name="edit-task-minutes" type="number" min="5" max={data.schedule.maxFocusMinutes} value={editTask.estimatedMinutes} onChange={event => setEditTask(current => current ? { ...current, estimatedMinutes: Number(event.target.value) } : current)} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {capacityOpen && <Modal title="调整今日可用时间" description="只修改今天，不会改变其他工作日设置。" onClose={() => setCapacityOpen(false)} footer={<><button className="button secondary" onClick={() => setCapacityOpen(false)}>取消</button><button className="button primary" onClick={saveCapacity}>保存今日容量</button></>}><label className="field"><span>今日最多学习（分钟）</span><input name="today-capacity" type="number" min="0" max="720" value={capacityDraft} onChange={event => setCapacityDraft(event.target.value)} /></label>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {addOpen && <Modal title="添加今日任务" description="任务会进入指定课程与节次，并通过统一冲突校验。" onClose={() => setAddOpen(false)} footer={<><button className="button secondary" onClick={() => setAddOpen(false)}>取消</button><button className="button primary" onClick={addTask}>加入今日课表</button></>}><div className="form-grid two"><label className="field"><span>课程</span><select name="add-task-course" value={addDraft.courseId} onChange={event => setAddDraft(current => ({ ...current, courseId: event.target.value }))}>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className="field"><span>节次</span><select name="add-task-slot" value={addDraft.slotId} onChange={event => setAddDraft(current => ({ ...current, slotId: event.target.value }))}>{data.schedule.timeSlots.filter(slot => slot.enabled).map(slot => <option key={slot.id} value={slot.id}>{slot.label} · {slot.start}</option>)}</select></label><label className="field"><span>任务名称</span><input name="add-task-title" autoComplete="off" value={addDraft.title} onChange={event => setAddDraft(current => ({ ...current, title: event.target.value }))} /></label><label className="field"><span>知识点</span><input name="add-task-knowledge" autoComplete="off" value={addDraft.knowledgePoint} onChange={event => setAddDraft(current => ({ ...current, knowledgePoint: event.target.value }))} /></label><label className="field"><span>预计分钟</span><input name="add-task-minutes" type="number" min="5" max={data.schedule.maxFocusMinutes} value={addDraft.estimatedMinutes} onChange={event => setAddDraft(current => ({ ...current, estimatedMinutes: event.target.value }))} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    <Link className="visually-hidden" to="/plan">查看完整学习计划</Link>
    {recoveryOpen && recoveryProposal && <Modal title="恢复学习计划" description="系统只根据已记录的执行证据提出方案。不会删除已完成任务，也不会替你直接选择。" onClose={() => setRecoveryOpen(false)} footer={<button className="button secondary" onClick={() => setRecoveryOpen(false)}>稍后处理</button>}><ul className="clean-list">{recoverySignals.map(item => <li key={item.id}>{item.explanation}</li>)}</ul><div className="recovery-option-list">{recoveryProposal.options.map(option => <article key={option.id}><div><strong>{option.title}</strong><p>{option.explanation}</p><small>预计影响：{option.impact.summary}</small>{option.impact.shiftedTaskCount > 0 && <small>涉及 {option.impact.shiftedTaskCount} 项任务{option.impact.nextWeekMinutes > 0 ? ` · 下周约 ${option.impact.nextWeekMinutes} 分钟` : ''}</small>}</div><button className={option.type === 'keep_plan' ? 'button secondary' : 'button primary'} onClick={() => applyRecovery(option.id)}>{option.type === 'keep_plan' ? '保留现有计划' : '确认此方案'}</button></article>)}</div></Modal>}
  </div>
}
