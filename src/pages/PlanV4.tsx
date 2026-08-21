import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { CourseSwitcher, EmptyState, Icon, InlineNotice, Modal, PageHeader, WeekNavigator } from '../components.tsx'
import { PlanDraftSummary } from '../components/PlanDraftSummary.tsx'
import { CourseManager } from '../components/CourseManager.tsx'
import { createTaskChangeSet, revertChangeSet } from '../changeSets.ts'
import { createTask } from '../data.ts'
import { addDays, dayName, localDateISO, mondayOfWeek } from '../dateUtils.ts'
import { activateGlobalPlanDraft, buildGlobalPlanDraft, restoreGlobalPlanVersion, validateGlobalPlanDraft } from '../globalPlanner.ts'
import { getCourseIntelligence } from '../courseIntelligence.ts'
import { isHighSchoolDemo } from '../demoData.ts'
import { localPlanningProvider, matchingResources, planDiff, recordTaskEvent } from '../providers.ts'
import { capacityForDate, validateScheduleChange } from '../scheduler.ts'
import { useStore } from '../store.tsx'
import { periodLabels, slotDuration } from '../timetable.ts'
import type { LearningTask, PlanAdjustment, TaskStatus } from '../types.ts'

const dateLabel = (date: string) => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T12:00:00`))
const taskCardStatus = (task: LearningTask, draft: boolean) => draft ? '草案' : task.status === '已完成' ? '已完成' : task.status === '已跳过' ? '已跳过' : task.status === '进行中' ? '进行中' : '已安排'
const taskCardAction = (task: LearningTask) => {
  if (/小测|测试/.test(task.action || task.quizTask || '')) return '完成小测'
  if (/练习|习题/.test(task.action || '')) return '完成练习'
  if (/复习|回顾/.test(task.action || '')) return '复习巩固'
  if (/作品|产出|项目/.test(task.action || task.taskType || '')) return '完成成果输出'
  return task.materialLabel ? '学习材料' : '完成学习任务'
}

export default function PlanV4() {
  const { data, updateData, notify } = useStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [focusDate, setFocusDate] = useState(localDateISO())
  const [monthOffset, setMonthOffset] = useState(0)
  const [courseId, setCourseId] = useState('')
  const [selected, setSelected] = useState<LearningTask | null>(null)
  const [editing, setEditing] = useState<LearningTask | null>(null)
  const [moving, setMoving] = useState<LearningTask | null>(null)
  const [moveTarget, setMoveTarget] = useState({ date: '', slotId: '' })
  const [deleting, setDeleting] = useState<LearningTask | null>(null)
  const [skipping, setSkipping] = useState<LearningTask | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [completing, setCompleting] = useState<LearningTask | null>(null)
  const [actualMinutes, setActualMinutes] = useState('')
  const [dragId, setDragId] = useState('')
  const [dragTarget, setDragTarget] = useState('')
  const [lastChangeSetId, setLastChangeSetId] = useState('')
  const [adjustment, setAdjustment] = useState<PlanAdjustment | null>(null)
  const [draftDiff, setDraftDiff] = useState<ReturnType<typeof planDiff> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const start = addDays(mondayOfWeek(), weekOffset * 7)
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(start, index)), [start])
  const slots = useMemo(() => data.schedule.timeSlots.filter(slot => slot.enabled).sort((a, b) => a.order - b.order), [data.schedule.timeSlots])
  const draftPlan = data.globalPlanDraft && data.globalPlanDraft.status !== 'activated' && data.globalPlanDraft.status !== 'archived' ? data.globalPlanDraft : null
  const draftValidation = useMemo(() => draftPlan ? validateGlobalPlanDraft(data, draftPlan) : null, [data, draftPlan])
  const validatedDraft = useMemo(() => draftPlan && draftValidation ? { ...draftPlan, validation: draftValidation, status: draftValidation.valid ? 'valid' as const : 'needs_adjustment' as const } : null, [draftPlan, draftValidation])
  const displaySource = useMemo(() => draftPlan ? [...data.tasks.filter(task => task.status === '已完成' || task.status === '进行中'), ...draftPlan.tasks] : data.tasks, [data.tasks, draftPlan])
  const tasks = useMemo(() => displaySource.filter(task => task.date && days.includes(task.date) && (!courseId || task.courseId === courseId)), [courseId, days, displaySource])
  const focusTasks = useMemo(() => displaySource.filter(task => task.date === focusDate && (!courseId || task.courseId === courseId)).sort((left, right) => left.time.localeCompare(right.time)), [courseId, displaySource, focusDate])
  const monthDays = useMemo(() => {
    const base = new Date(`${localDateISO()}T12:00:00`)
    const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1)
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const prefix = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`
    return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`)
  }, [monthOffset])
  const monthLabel = monthDays[0] ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(`${monthDays[0]}T12:00:00`)) : ''
  const pending = (draftPlan?.tasks ?? data.tasks).filter(task => task.scheduleStatus !== 'scheduled' && task.status !== '已完成' && (!courseId || task.courseId === courseId))
  const courseMap = useMemo(() => new Map(data.courses.map(course => [course.id, course])), [data.courses])
  const draftTaskIds = useMemo(() => new Set(draftPlan?.tasks.map(task => task.id) ?? []), [draftPlan])
  const demoMode = isHighSchoolDemo(data)

  const openNew = (date = days[0], slotId = slots[0]?.id ?? '') => {
    const slot = slots.find(item => item.id === slotId)
    const preferredCourse = data.courses.find(course => course.id === courseId) ?? data.courses.find(course => course.priority) ?? data.courses[0]
    setEditing(createTask({
      date,
      originalPlannedDate: date,
      slotId,
      time: slot?.start ?? '',
      courseId: preferredCourse?.id ?? '',
      title: '',
      knowledgePoint: '',
      unitId: '',
      estimatedMinutes: Math.min(slot ? slotDuration(slot) : 45, data.schedule.maxFocusMinutes),
      practiceMinutes: 30,
      quizMinutes: 5,
      completionCriteria: '',
      arrangementReason: '用户主动加入本周课表。',
      status: '待完成',
      scheduleStatus: 'scheduled',
    }))
    setError('')
  }

  const commitTasks = (nextTasks: LearningTask[], reason: string, event?: { task: LearningTask; type: Parameters<typeof recordTaskEvent>[1]; detail: string }) => {
    const changeSet = createTaskChangeSet(data.tasks, nextTasks, reason, { scope: 'task', courseId: event?.task.courseId })
    updateData(current => ({
      ...current,
      tasks: nextTasks,
      changeSets: changeSet.changes.length ? [...current.changeSets, changeSet] : current.changeSets,
      taskEvents: event ? [...current.taskEvents, recordTaskEvent(event.task, event.type, event.detail)] : current.taskEvents,
      planChanges: [reason, ...current.planChanges].slice(0, 50),
    }))
    if (changeSet.changes.length) setLastChangeSetId(changeSet.id)
  }

  const saveTask = () => {
    if (!editing) return
    const slot = slots.find(item => item.id === editing.slotId)
    if (!editing.courseId || !editing.title.trim() || !editing.knowledgePoint.trim() || !editing.completionCriteria.trim()) return setError('请填写课程、任务名称、知识点和完成标准。')
    if (!slot) return setError('请选择有效节次。')
    const saved = { ...editing, time: slot.start, scheduleStatus: 'scheduled' as const, scheduleIssue: '', originalPlannedDate: editing.originalPlannedDate || editing.date }
    const validation = validateScheduleChange(saved, { date: saved.date, slotId: saved.slotId, time: slot.start, estimatedMinutes: saved.estimatedMinutes }, data.tasks, data.schedule)
    if (!validation.valid) return setError(validation.reasons.join(' '))
    const exists = data.tasks.some(task => task.id === saved.id)
    const next = exists ? data.tasks.map(task => task.id === saved.id ? saved : task) : [...data.tasks, saved]
    commitTasks(next, `${exists ? '编辑' : '添加'}任务「${saved.title}」`, { task: saved, type: exists ? 'edited' : 'created', detail: exists ? '用户编辑课表任务' : '用户添加课表任务' })
    setEditing(null); setSelected(null); setError(''); notify('任务已保存到指定节次。')
  }

  const moveTask = (task: LearningTask, date: string, slotId: string, status: TaskStatus = '待完成') => {
    const slot = slots.find(item => item.id === slotId)
    if (!slot) return setError('请选择有效节次。')
    const validation = validateScheduleChange(task, { date, slotId, time: slot.start }, data.tasks, data.schedule)
    if (!validation.valid) { setError(`${validation.reasons.join(' ')}${validation.alternatives.length ? ` 可选：${validation.alternatives.map(item => `${item.date} ${item.time}`).join('、')}` : ''}`); setDragId(''); setDragTarget(''); return }
    const moved = { ...task, date, slotId, time: slot.start, status, scheduleStatus: 'scheduled' as const, scheduleIssue: '', changeNote: `移动到 ${date} ${slot.label}` }
    commitTasks(data.tasks.map(item => item.id === task.id ? moved : item), `将「${task.title}」移动到 ${date} ${slot.label}`, { task, type: status === '已延期' ? 'delayed' : 'moved', detail: `${task.date} ${task.time} → ${date} ${slot.start}` })
    setMoving(null); setMoveTarget({ date: '', slotId: '' }); setSelected(null); setDragId(''); setDragTarget(''); setError(''); notify(`已安排到${dateLabel(date)} ${slot.label}。`)
  }

  const openMove = (task: LearningTask, date = task.date, slotId = task.slotId) => {
    setMoving(task); setMoveTarget({ date, slotId }); setSelected(null); setError('')
  }

  const moveTaskByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, task: LearningTask) => {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    moveTask(task, addDays(task.date, event.key === 'ArrowLeft' ? -1 : 1), task.slotId)
  }

  const setTaskStatus = (task: LearningTask, status: TaskStatus, detail: string) => {
    const changed = { ...task, status, changeNote: detail }
    commitTasks(data.tasks.map(item => item.id === task.id ? changed : item), `${detail}「${task.title}」`, { task, type: status === '进行中' ? 'started' : 'restored', detail })
    setSelected(null); notify(`${task.title}：${detail}`)
  }

  const completeTask = () => {
    if (!completing) return
    const minutes = Number(actualMinutes)
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 720) return setError('实际学习时间应为 0–720 分钟。')
    const changed = { ...completing, status: '已完成' as const, changeNote: '记录实际完成' }
    const changeSet = createTaskChangeSet(data.tasks, data.tasks.map(item => item.id === completing.id ? changed : item), `完成任务「${completing.title}」`, { scope: 'task', courseId: completing.courseId })
    updateData(current => ({ ...current, tasks: current.tasks.map(item => item.id === completing.id ? changed : item), changeSets: [...current.changeSets, changeSet], taskEvents: [...current.taskEvents, recordTaskEvent(completing, 'completed', '从计划页记录完成', minutes, { completionDegree: '全部完成' })] }))
    setCompleting(null); setSelected(null); setError(''); notify('完成记录与实际学习时长已保存。')
  }

  const skipTask = () => {
    if (!skipping || !skipReason.trim()) return setError('请填写跳过原因。')
    const changed = { ...skipping, status: '已跳过' as const, skipReason: skipReason.trim(), changeNote: '记录跳过原因' }
    commitTasks(data.tasks.map(item => item.id === skipping.id ? changed : item), `跳过任务「${skipping.title}」`, { task: skipping, type: 'skipped', detail: skipReason.trim() })
    setSkipping(null); setSelected(null); setSkipReason(''); setError(''); notify('任务已跳过，原因会进入周复盘。')
  }

  const deleteTask = () => {
    if (!deleting) return
    if (deleting.status === '已完成') return setError('已完成任务受保护，不能删除。')
    commitTasks(data.tasks.filter(task => task.id !== deleting.id), `删除任务「${deleting.title}」`, { task: deleting, type: 'deleted', detail: '用户从课表删除任务' })
    setDeleting(null); setSelected(null); notify('任务已删除，可撤销最近一次变更。')
  }

  const undo = () => {
    if (!lastChangeSetId) return
    updateData(current => revertChangeSet(current, lastChangeSetId))
    setLastChangeSetId(''); notify('最近一次课表变更已撤销。')
  }

  const previewAdjustment = async (prompt: string) => {
    if (loading) return
    setLoading(true); setError('')
    try { setAdjustment((await localPlanningProvider.adjustPlan(prompt, data)).data) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '调整预览失败。') }
    finally { setLoading(false) }
  }

  const applyAdjustment = () => {
    if (!adjustment) return
    const changeSet = adjustment.changeSet ?? createTaskChangeSet(data.tasks, adjustment.tasks, adjustment.changeNote, { scope: 'plan' })
    updateData(current => ({ ...current, tasks: adjustment.tasks, schedule: { ...current.schedule, ...adjustment.schedulePatch }, changeSets: [...current.changeSets, changeSet], planChanges: [adjustment.changeNote, ...current.planChanges] }))
    setLastChangeSetId(changeSet.id); setAdjustment(null); notify('调整已应用，可撤销。')
  }

  const generateGlobalDraft = (compare = false) => {
    if (loading) return
    setLoading(true); setError('')
    try {
      const result = buildGlobalPlanDraft(data)
      if (compare) setDraftDiff(planDiff(draftPlan?.tasks ?? data.tasks.filter(task => task.status !== '已完成' && task.status !== '进行中'), result.tasks))
      else setDraftDiff(null)
      updateData(current => ({ ...current, globalPlanDraft: result, planDrafts: {}, plans: current.plans.filter(plan => plan.status !== 'draft') }))
      setCourseId('')
      notify(result.validation.valid ? `已生成覆盖 ${result.courseIds.length} 门课程的总课表草案。` : '总课表草案已生成，请先处理校验提示。', result.validation.valid ? 'success' : 'info')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '全部课程计划生成失败。') }
    finally { setLoading(false) }
  }

  const activateDraft = () => {
    if (!validatedDraft || loading) return
    setLoading(true); setError('')
    try {
      const next = activateGlobalPlanDraft(data, validatedDraft)
      const changeSetId = next.changeSets[next.changeSets.length - 1]?.id ?? ''
      updateData(() => next)
      setLastChangeSetId(changeSetId); setDraftDiff(null)
      notify(`已一次性启用第 ${validatedDraft.version} 版全部课程计划。`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '总课表草案未能启用。') }
    finally { setLoading(false) }
  }

  const restoreVersion = (draftId: string) => {
    try {
      const next = restoreGlobalPlanVersion(data, draftId)
      const changeSetId = next.changeSets[next.changeSets.length - 1]?.id ?? ''
      updateData(() => next); setLastChangeSetId(changeSetId); setError('')
      notify('上一版总课表已恢复，已完成和进行中任务保持不变。')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '总课表版本恢复失败。') }
  }

  const editingCourse = editing ? courseMap.get(editing.courseId) : undefined
  const knowledgeOptions = editingCourse ? (data.diagnoses[editingCourse.id]?.weakKnowledgePoints ?? getCourseIntelligence(editingCourse, data.schedule).competencyDimensions) : []
  const resourceOptions = editing ? matchingResources(data, editing.courseId, editing.knowledgePoint) : []

  return <div className="page wide-page plan-page timetable-plan">
    <PageHeader eyebrow={demoMode ? '高中生 Demo · 30 天学习计划' : '学习计划 · 4＋4＋2 课表'} title={demoMode ? '六门课程，每天都有推进' : '先生成总课表，再执行每一天'} description={demoMode ? `从 ${data.schedule.holidayStart} 到 ${data.schedule.holidayEnd}，每天安排 6 项 45 分钟任务：上午建立理解，下午练习与复盘；六门课程按天轮换进入课表，点击任务可查看安排原因。` : '系统综合全部课程分配时间，再用同一套日期、节次、容量、冲突和资源规则完成校验。'} actions={<div className="page-action-group"><CourseManager /><button className="button primary" disabled={loading || !data.courses.length} onClick={() => generateGlobalDraft(Boolean(draftPlan))}>{loading ? '正在生成总课表…' : draftPlan || data.globalPlanHistory.length ? '重新生成总课表' : '生成全部课程计划'}</button></div>} />
    <CourseSwitcher courses={data.courses} value={courseId} onChange={setCourseId} includeAll />
    {demoMode && <section className="demo-plan-summary" aria-label="Demo 计划说明"><div><span className="section-kicker">个性化依据</span><strong>数学 82/150、物理 63/100：优先安排基础模型与错题复盘</strong><p>典型体验顺序：08:00 数学函数基础 → 10:00 英语阅读训练 → 14:00 物理力学专题 → 晚间错题整理。实际课表会根据六门课的优先级和可用时间按天轮换，点击“月”可查看完整 30 天分布。</p></div><Link className="button secondary" to="/coaching">查看一对一辅导建议</Link></section>}
    {validatedDraft && <PlanDraftSummary courses={data.courses} schedule={data.schedule} draft={validatedDraft} diff={draftDiff ? { added: draftDiff.added.length, removed: draftDiff.removed.length, moved: draftDiff.moved.length, shortened: draftDiff.shortened.length, extended: draftDiff.extended.length, resourceChanged: draftDiff.resourceChanged.length } : null} loading={loading} onRegenerate={() => generateGlobalDraft(true)} onActivate={activateDraft} />}
    {!draftPlan && !data.tasks.length && data.courses.length > 0 && <section className="draft-entry"><div><span className="section-kicker">从全部课程统一取舍</span><h2>还没有启用的总课表</h2><p>系统会先使用成绩或自评形成基线规划依据；精细诊断可以稍后完成，用于提高置信度并预览调整差异。</p></div><button className="button primary" disabled={loading} onClick={() => generateGlobalDraft(false)}>一键生成总课表</button></section>}
    {data.globalPlanHistory.length > 0 && <details className="plan-version-history"><summary>总课表版本与恢复</summary><div>{[...data.globalPlanHistory].sort((a, b) => b.version - a.version).map(plan => <article key={plan.id}><span><strong>第 {plan.version} 版 · {plan.courseIds.length} 门课程</strong><small>{data.globalPlanDraft?.id === plan.id && data.globalPlanDraft.status === 'activated' ? '当前启用' : '历史版本'} · {plan.activatedAt ? new Date(plan.activatedAt).toLocaleString('zh-CN') : '未启用'}</small></span><button className="button secondary" disabled={data.globalPlanDraft?.id === plan.id || !data.planTaskArchive[plan.id]?.length} onClick={() => restoreVersion(plan.id)}>{data.globalPlanDraft?.id === plan.id ? '当前版本' : '恢复此版本'}</button></article>)}</div></details>}
    <div className="plan-view-tabs" role="tablist" aria-label="计划时间范围">{([['day', '日'], ['week', '周'], ['month', '月']] as const).map(([mode, label]) => <button type="button" role="tab" aria-selected={viewMode === mode} className={viewMode === mode ? 'active' : ''} key={mode} onClick={() => setViewMode(mode)}>{label}</button>)}</div>
    <section className="plan-toolbar">{viewMode === 'week' ? <WeekNavigator label={`${dateLabel(days[0])} — ${dateLabel(days[6])}`} isCurrent={weekOffset === 0} onPrevious={() => setWeekOffset(value => value - 1)} onNext={() => setWeekOffset(value => value + 1)} onCurrent={() => setWeekOffset(0)} /> : viewMode === 'day' ? <div className="range-navigator"><button className="icon-button" aria-label="前一天" onClick={() => setFocusDate(value => addDays(value, -1))}><Icon name="chevron-left" /></button><strong>{dateLabel(focusDate)}</strong><button className="icon-button" aria-label="后一天" onClick={() => setFocusDate(value => addDays(value, 1))}><Icon name="chevron-right" /></button><button className="text-button" hidden={focusDate === localDateISO()} onClick={() => setFocusDate(localDateISO())}>回到今天</button></div> : <div className="range-navigator"><button className="icon-button" aria-label="上个月" onClick={() => setMonthOffset(value => value - 1)}><Icon name="chevron-left" /></button><strong>{monthLabel}</strong><button className="icon-button" aria-label="下个月" onClick={() => setMonthOffset(value => value + 1)}><Icon name="chevron-right" /></button><button className="text-button" hidden={monthOffset === 0} onClick={() => setMonthOffset(0)}>回到本月</button></div>}<div className="quick-adjust"><button className="button secondary" onClick={() => openNew(viewMode === 'day' ? focusDate : undefined)}><Icon name="plus" /> 添加任务</button><Link className="button secondary" to="/settings?section=time">调整每周学习量</Link></div></section>
    {lastChangeSetId && <InlineNotice tone="success">课表已更新。<button className="inline-action" onClick={undo}>撤销</button></InlineNotice>}
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {pending.length > 0 && <InlineNotice tone="info">当前周已安排 {tasks.length} 项任务，另有 {pending.length} 项保留在任务池，系统会在下一周继续安排。{draftPlan ? <Link className="inline-action" to="/settings?section=time">查看可选时间约束</Link> : <button className="inline-action" onClick={() => { const task = pending[0]; setEditing({ ...task, date: days[0], slotId: slots[0]?.id ?? '', time: slots[0]?.start ?? '' }) }}>手动安排第一项</button>}</InlineNotice>}
    {!tasks.length && !pending.length && <EmptyState title="本周还没有任务" description="先生成全部课程计划；临时需要时，可使用上方次要入口添加任务。" />}

    {viewMode === 'week' && <><div className="weekly-timetable" role="grid" aria-label="本周 4＋4＋2 学习课表">
      <div className="timetable-corner" aria-hidden="true">节次</div>
      {days.map(day => <div className="timetable-day" role="columnheader" key={day}><strong>{dateLabel(day)}</strong><span>{tasks.filter(task => task.date === day).reduce((sum, task) => sum + task.estimatedMinutes, 0)} 分钟</span></div>)}
      {slots.map(slot => <div className="timetable-row" role="row" key={slot.id}>
        <div className="timetable-slot-label" role="rowheader"><strong>{periodLabels[slot.period]} · {slot.label.split(' ')[1]}</strong><span>{slot.start}–{slot.end}</span></div>
        {days.map(day => {
          const task = tasks.find(item => item.date === day && item.slotId === slot.id)
          const target = `${day}|${slot.id}`
          const moved = dragId ? data.tasks.find(item => item.id === dragId) : undefined
          const dropValidation = moved ? validateScheduleChange(moved, { date: day, slotId: slot.id, time: slot.start }, data.tasks, data.schedule) : null
          const activeTarget = dragTarget === target
          const capacity = capacityForDate(day, data.schedule)
          const emptyLabel = capacity > 0 ? '添加任务' : data.schedule.restDays.includes(dayName(day)) ? '休息' : '不可用'
          const targetClass = activeTarget ? dropValidation?.valid ? 'drop-ready' : 'drop-conflict' : ''
          return <div role="gridcell" key={target} title={activeTarget && dropValidation && !dropValidation.valid ? dropValidation.reasons.join(' ') : undefined} className={`timetable-cell ${task ? 'occupied' : ''} ${targetClass}`} onDragOver={event => { event.preventDefault(); if (dragId) setDragTarget(target) }} onDragLeave={() => setDragTarget('')} onDrop={() => { if (moved) moveTask(moved, day, slot.id) }}>
            {task ? <button className={`timetable-task ${draftTaskIds.has(task.id) ? 'draft' : ''} ${dragId === task.id ? 'dragging' : ''} ${task.status === '已完成' ? 'completed' : task.status === '已跳过' ? 'skipped' : ''}`} draggable={!draftTaskIds.has(task.id) && task.status !== '已完成' && task.status !== '进行中'} onDragStart={() => setDragId(task.id)} onDragEnd={() => { setDragId(''); setDragTarget('') }} onKeyDown={event => !draftTaskIds.has(task.id) && moveTaskByKeyboard(event, task)} onClick={() => setSelected(task)} title={draftTaskIds.has(task.id) ? '总课表草案' : '按 Alt + 左右方向键可移动到前一天或后一天'} aria-label={`${courseMap.get(task.courseId)?.canonicalName || courseMap.get(task.courseId)?.name}，${task.knowledgePoint}，${taskCardStatus(task, draftTaskIds.has(task.id))}`}><span>{courseMap.get(task.courseId)?.canonicalName || courseMap.get(task.courseId)?.name} · {taskCardStatus(task, draftTaskIds.has(task.id))}</span><strong>{task.knowledgePoint || task.title}</strong><small>{taskCardAction(task)} · {task.estimatedMinutes} 分钟</small></button> : <button className={`empty-slot ${capacity <= 0 ? 'unavailable' : ''}`} disabled={capacity <= 0 && !dragId} onClick={() => openNew(day, slot.id)} aria-label={`${dateLabel(day)} ${slot.label}：${capacity > 0 ? '空闲节次，添加任务' : emptyLabel}`}>{activeTarget ? dropValidation?.valid ? `松开：${dateLabel(day)} ${slot.label}` : `冲突：${dropValidation?.reasons[0] ?? '不可放置'}` : capacity > 0 ? <><span aria-hidden="true">＋</span><span className="empty-slot-label">添加任务</span></> : emptyLabel}</button>}
          </div>
        })}
      </div>)}
    </div>

    <div className="mobile-week-list" aria-label="移动端本周课表">{days.map(day => <details key={day} open={day === localDateISO()}><summary><strong>{dateLabel(day)}</strong><span>{tasks.filter(task => task.date === day).reduce((sum, task) => sum + task.estimatedMinutes, 0)} 分钟</span></summary>{(['morning', 'afternoon', 'evening'] as const).map(period => { const periodSlots = slots.filter(slot => slot.period === period); return periodSlots.length ? <div className="mobile-period" key={period}><h3>{periodLabels[period]}</h3>{periodSlots.map(slot => { const task = tasks.find(item => item.date === day && item.slotId === slot.id); const available = capacityForDate(day, data.schedule) > 0; return <div className="mobile-slot" key={slot.id}><span>{slot.label.split(' ')[1]}<small>{slot.start}</small></span>{task ? <button onClick={() => setSelected(task)}><strong>{task.title}</strong><small>{courseMap.get(task.courseId)?.canonicalName || courseMap.get(task.courseId)?.name} · {task.estimatedMinutes} 分钟</small></button> : <button className="mobile-empty-slot" disabled={!available} onClick={() => openNew(day, slot.id)}>{available ? '＋ 添加任务' : data.schedule.restDays.includes(dayName(day)) ? '休息' : '不可用'}</button>}</div> })}</div> : null })}</details>)}</div></>}
    {viewMode === 'day' && <section className="plan-day-view" aria-label={`${dateLabel(focusDate)}任务`}>{focusTasks.length ? focusTasks.map(task => <button type="button" key={task.id} onClick={() => setSelected(task)}><span>{task.time} · {courseMap.get(task.courseId)?.canonicalName || courseMap.get(task.courseId)?.name}</span><strong>{task.title}</strong><small>{task.knowledgePoint} · {task.estimatedMinutes} 分钟 · {task.status}</small></button>) : <EmptyState title="这一天没有任务" description={data.globalPlanDraft?.dayReasons[focusDate] || '可保留为缓冲，也可以添加自己的任务。'} action={<button className="button secondary" onClick={() => openNew(focusDate)}>添加任务</button>} />}</section>}
    {viewMode === 'month' && <section className="plan-month-grid" aria-label={`${monthLabel}计划`}>{monthDays.map(day => { const dayTasks = displaySource.filter(task => task.date === day && (!courseId || task.courseId === courseId)); const minutes = dayTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0); return <button type="button" key={day} className={day === localDateISO() ? 'today' : ''} onClick={() => { setFocusDate(day); setViewMode('day') }}><span>{Number(day.slice(-2))}</span><strong>{minutes ? `${minutes} 分钟` : '缓冲'}</strong><small>{dayTasks.length ? `${dayTasks.length} 项任务` : data.globalPlanDraft?.dayReasons[day] || '未安排'}</small></button> })}</section>}

    {selected && <Modal title={selected.title} description={`${courseMap.get(selected.courseId)?.name} · ${selected.stageLabel || '自定义阶段'} · ${draftTaskIds.has(selected.id) ? '草案预览' : selected.status}`} onClose={() => setSelected(null)} footer={draftTaskIds.has(selected.id) ? <button className="button primary" onClick={() => setSelected(null)}>查看完成</button> : <><button className="button secondary" onClick={() => openMove(selected)}>移动到…</button>{selected.status === '进行中' ? <button className="button primary" onClick={() => { setCompleting(selected); setActualMinutes(String(selected.estimatedMinutes)); setSelected(null) }}>记录完成</button> : selected.status === '已完成' ? <button className="button secondary" onClick={() => setTaskStatus(selected, '待完成', '恢复为待完成')}>恢复任务</button> : <button className="button primary" onClick={() => setTaskStatus(selected, '进行中', '开始任务')}>开始任务</button>}</>}><div className="task-detail-grid"><div><span>章节 / 知识点</span><strong>{selected.stageLabel || '自定义'} · {selected.knowledgePoint}</strong></div><div><span>学习动作</span><strong>{selected.action || (selected.materialLabel ? `学习“${selected.materialLabel}”` : '完成练习或成果任务')}</strong></div><div><span>练习 / 小测</span><strong>{selected.practiceCount || 1} 项 · {selected.quizTask || '记录学习结果'}</strong></div><div><span>完成标准</span><strong>{selected.completionCriteria}</strong></div><div><span>预计时长</span><strong>{selected.estimatedMinutes} 分钟</strong></div><div><span>安排原因</span><strong>{selected.arrangementReason || selected.changeNote}</strong></div></div>{draftTaskIds.has(selected.id) ? <InlineNotice>这是尚未启用的总课表草案。确认启用前不会写入今日任务，也不能单独编辑。</InlineNotice> : <div className="modal-link-actions"><button onClick={() => { setEditing({ ...selected }); setSelected(null) }}>编辑</button><button onClick={() => moveTask(selected, addDays(selected.date, 1), selected.slotId, '已延期')}>延期一天</button><button onClick={() => { setSkipping(selected); setSkipReason(''); setSelected(null) }}>跳过</button><Link to={`/resources?course=${selected.courseId}&knowledge=${encodeURIComponent(selected.knowledgePoint)}`}>更换资源</Link><button className="danger-text" disabled={selected.status === '已完成'} onClick={() => { setDeleting(selected); setSelected(null) }}>删除</button></div>}</Modal>}

    {editing && <Modal title={data.tasks.some(task => task.id === editing.id) ? '编辑课表任务' : '添加课表任务'} description="任务必须绑定课程、知识点、完成标准和一个具体节次。" onClose={() => setEditing(null)} footer={<><button className="button secondary" onClick={() => setEditing(null)}>取消</button><button className="button primary" onClick={saveTask}>保存任务</button></>}><div className="form-grid two"><label className="field"><span>课程</span><select name="task-course" value={editing.courseId} onChange={event => setEditing({ ...editing, courseId: event.target.value, knowledgePoint: '', resourceId: '', materialLabel: '' })}><option value="">请选择</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className="field"><span>任务名称</span><input name="task-title" value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label><label className="field"><span>日期</span><input name="task-date" type="date" value={editing.date} onChange={event => setEditing({ ...editing, date: event.target.value })} /></label><label className="field"><span>节次</span><select name="task-slot" value={editing.slotId} onChange={event => setEditing({ ...editing, slotId: event.target.value })}>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.label} · {slot.start}–{slot.end}</option>)}</select></label><label className="field"><span>知识点</span><input name="task-knowledge" list="knowledge-options" value={editing.knowledgePoint} onChange={event => setEditing({ ...editing, knowledgePoint: event.target.value })} /><datalist id="knowledge-options">{knowledgeOptions.map(point => <option key={point} value={point} />)}</datalist></label><label className="field"><span>对应资源</span><select name="task-resource" value={editing.resourceId} onChange={event => { const resource = data.resources.find(item => item.id === event.target.value); setEditing({ ...editing, resourceId: event.target.value, materialLabel: resource?.title ?? '', watchMinutes: resource?.durationMin ?? 0 }) }}><option value="">不使用资源</option>{resourceOptions.map(resource => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select></label><label className="field"><span>预计分钟</span><input name="task-minutes" type="number" min="5" max={data.schedule.maxFocusMinutes} value={editing.estimatedMinutes} onChange={event => setEditing({ ...editing, estimatedMinutes: Number(event.target.value) })} /></label><label className="field"><span>练习数量</span><input name="task-practice" type="number" min="0" max="200" value={editing.practiceCount} onChange={event => setEditing({ ...editing, practiceCount: Number(event.target.value) })} /></label><label className="field full-span"><span>小测或成果任务</span><input name="task-quiz" value={editing.quizTask} onChange={event => setEditing({ ...editing, quizTask: event.target.value })} /></label><label className="field full-span"><span>完成标准</span><textarea name="task-criteria" rows={3} value={editing.completionCriteria} onChange={event => setEditing({ ...editing, completionCriteria: event.target.value })} /></label><label className="field full-span"><span>安排原因</span><textarea name="task-reason" rows={2} value={editing.arrangementReason} onChange={event => setEditing({ ...editing, arrangementReason: event.target.value })} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}

    {moving && <Modal title="移动到指定日期与节次" description="键盘和移动端可使用这个面板，不依赖拖动。" onClose={() => setMoving(null)} footer={<><button className="button secondary" onClick={() => setMoving(null)}>取消</button><button className="button primary" onClick={() => moveTask(moving, moveTarget.date, moveTarget.slotId)}>确认移动</button></>}><div className="form-grid two"><label className="field"><span>目标日期</span><input name="move-date" type="date" value={moveTarget.date} onChange={event => setMoveTarget(current => ({ ...current, date: event.target.value }))} /></label><label className="field"><span>目标节次</span><select name="move-slot" value={moveTarget.slotId} onChange={event => setMoveTarget(current => ({ ...current, slotId: event.target.value }))}>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.label} · {slot.start}</option>)}</select></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {skipping && <Modal title="跳过这项任务？" description="跳过原因会进入学习进展和周复盘。" onClose={() => setSkipping(null)} footer={<><button className="button secondary" onClick={() => setSkipping(null)}>取消</button><button className="button danger" onClick={skipTask}>确认跳过</button></>}><label className="field"><span>跳过原因</span><textarea name="skip-reason" rows={3} value={skipReason} onChange={event => setSkipReason(event.target.value)} /></label>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {deleting && <Modal title="删除任务？" description="删除事件会保留在进展记录中。" onClose={() => setDeleting(null)} footer={<><button className="button secondary" onClick={() => setDeleting(null)}>取消</button><button className="button danger" onClick={deleteTask}>删除</button></>}><p>确定删除「{deleting.title}」吗？</p>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {completing && <Modal title="记录实际完成情况" description="预计时长不会自动当作实际学习时长。" onClose={() => setCompleting(null)} footer={<><button className="button secondary" onClick={() => setCompleting(null)}>取消</button><button className="button primary" onClick={completeTask}>保存完成记录</button></>}><label className="field"><span>实际学习分钟</span><input name="actual-minutes" type="number" min="0" max="720" value={actualMinutes} onChange={event => setActualMinutes(event.target.value)} /></label>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {adjustment && <Modal title={adjustment.needsClarification ? '需要补充信息' : '确认计划调整'} description="本地规则只生成预览，确认后才会修改。" onClose={() => setAdjustment(null)} footer={adjustment.needsClarification ? <button className="button primary" onClick={() => setAdjustment(null)}>知道了</button> : <><button className="button secondary" onClick={() => setAdjustment(null)}>取消</button><button className="button primary" onClick={applyAdjustment}>确认应用</button></>}><h3>{adjustment.message}</h3>{adjustment.clarificationQuestion && <InlineNotice>{adjustment.clarificationQuestion}</InlineNotice>}<ul className="clean-list">{adjustment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></Modal>}
  </div>
}
