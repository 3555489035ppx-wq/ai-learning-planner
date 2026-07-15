import { useMemo, useState } from 'react'
import { EmptyState, Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { addDays, createTask, todayISO } from '../data.ts'
import { mockPlanningProvider } from '../providers.ts'
import { useStore } from '../store.tsx'
import type { LearningTask } from '../types.ts'

const dayLabel = (date: string) => new Intl.DateTimeFormat('zh-CN', { weekday: 'short', month: 'numeric', day: 'numeric' }).format(new Date(`${date}T12:00:00`))

export default function Plan() {
  const { data, updateData, notify } = useStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [dragId, setDragId] = useState('')
  const [editing, setEditing] = useState<LearningTask | null>(null)
  const [deleteId, setDeleteId] = useState('')
  const [skipId, setSkipId] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const weekStart = addDays(todayISO(), weekOffset * 7)
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const weekTasks = data.tasks.filter(task => days.includes(task.date)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.order - b.order)

  const saveTask = () => {
    if (!editing) return
    if (!editing.title.trim() || !editing.knowledgePoint.trim() || !editing.completionCriteria.trim()) return setError('任务名称、知识点和完成标准不能为空。')
    updateData(current => ({ ...current, tasks: current.tasks.some(task => task.id === editing.id) ? current.tasks.map(task => task.id === editing.id ? editing : task) : [...current.tasks, editing], planChanges: [`已保存任务「${editing.title}」。`, ...current.planChanges] }))
    setEditing(null); setError(''); notify('学习任务已保存。')
  }

  const updateTask = (id: string, patch: Partial<LearningTask>) => updateData(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? { ...task, ...patch } : task) }))

  const delayTask = (task: LearningTask) => {
    updateTask(task.id, { date: addDays(task.date, 1), status: '已延期', changeNote: '手动延后 1 天' })
    updateData(current => ({ ...current, planChanges: [`「${task.title}」已延后 1 天。`, ...current.planChanges] }))
    notify('任务已延后 1 天。')
  }

  const cycleResource = (task: LearningTask) => {
    const available = data.resources.filter(resource => resource.status !== '不感兴趣' && resource.id !== task.resourceId)
    const next = available.find(resource => resource.knowledgePoints.includes(task.knowledgePoint)) || available[0]
    if (!next) return notify('没有可替换的学习资源。', 'error')
    updateTask(task.id, { resourceId: next.id, materialLabel: next.title, watchMinutes: next.durationMin, changeNote: '手动更换学习资源' })
    notify(`已更换为「${next.title}」。`)
  }

  const autoReplan = async (prompt: string) => {
    if (loading) return
    setLoading(true); setError('')
    try {
      const result = await mockPlanningProvider.adjustPlan(prompt, data)
      updateData(current => ({ ...current, tasks: result.data.tasks, planChanges: [result.data.changeNote, ...current.planChanges] }))
      notify(result.data.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '自动重排失败。')
    } finally { setLoading(false) }
  }

  const moveTask = (date: string) => {
    if (!dragId) return
    updateTask(dragId, { date, status: '待完成', changeNote: `拖动到 ${date}` })
    setDragId(''); notify('任务日期已更新。')
  }

  return <div className="page plan-page"><PageHeader eyebrow="学习计划" title="每项任务都必须可执行" description="按周查看和拖动任务。资源、练习、小测、完成标准与预计时间都可以修改。" actions={<button className="button primary" onClick={() => setEditing(createTask({ date: days[0], courseId: data.courses[0]?.id || '', title: '', knowledgePoint: '', materialLabel: '', resourceId: '', quizTask: '', completionCriteria: '', order: data.tasks.length }))}><Icon name="plus" /> 添加任务</button>} />
    <section className="plan-toolbar card"><div className="week-switcher"><button className="icon-button" onClick={() => setWeekOffset(value => value - 1)} aria-label="上一周"><Icon name="arrow" /></button><strong>{dayLabel(days[0])} — {dayLabel(days[6])}</strong><button className="icon-button next" onClick={() => setWeekOffset(value => value + 1)} aria-label="下一周"><Icon name="arrow" /></button><button className="text-button" onClick={() => setWeekOffset(0)}>回到本周</button></div><div className="quick-adjust"><button onClick={() => autoReplan('我下周有3天旅行')} disabled={loading}>下周旅行 3 天</button><button onClick={() => autoReplan('我每天最多学习2小时')} disabled={loading}>每天最多 2 小时</button><button className="button secondary" onClick={() => autoReplan(`我每天最多学习${Math.max(1, Math.round(data.schedule.weekdayMinutes / 60))}小时，请自动重排剩余任务`)} disabled={loading}>{loading ? '正在重排…' : '自动重排剩余任务'}</button></div></section>
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {weekTasks.length === 0 && <EmptyState title="本周还没有任务" description="可以添加自己的任务，或切换到其他周查看六周计划。" action={<button className="button primary" onClick={() => setEditing(createTask({ date: days[0], courseId: data.courses[0]?.id || '', title: '', knowledgePoint: '', completionCriteria: '', order: data.tasks.length }))}>添加本周任务</button>} />}
    <div className="week-board">{days.map(date => { const tasks = weekTasks.filter(task => task.date === date); return <section className="day-column" key={date} onDragOver={event => event.preventDefault()} onDrop={() => moveTask(date)}><header><strong>{dayLabel(date)}</strong><span>{tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)} 分钟</span></header><div className="day-task-list">{tasks.length === 0 && <div className="drop-placeholder">拖动任务到这里</div>}{tasks.map(task => <article key={task.id} className={`plan-task ${task.status === '已完成' ? 'completed' : task.status === '已跳过' ? 'skipped' : ''}`} draggable onDragStart={() => setDragId(task.id)}><div className="task-topline"><span>{task.time}</span><span>{task.status}</span></div><h3>{task.title}</h3><p className="knowledge-point">{task.knowledgePoint}</p><dl><div><dt>材料</dt><dd>{task.materialLabel || '待选择资源'}</dd></div><div><dt>观看 / 练习</dt><dd>{task.watchMinutes} 分钟 · {task.practiceCount} 题</dd></div><div><dt>小测</dt><dd>{task.quizTask || '无'}</dd></div><div><dt>完成标准</dt><dd>{task.completionCriteria}</dd></div></dl><div className="task-meta"><label>时间 <input type="time" value={task.time} onChange={event => updateTask(task.id, { time: event.target.value, changeNote: '修改任务时间' })} /></label><span><Icon name="clock" size={14} /> {task.estimatedMinutes} 分钟</span></div>{task.status === '已跳过' && <p className="skip-reason">跳过原因：{task.skipReason}</p>}<div className="task-actions"><button onClick={() => setEditing({ ...task })}>调整</button><button onClick={() => delayTask(task)}>延后</button><button onClick={() => { setSkipId(task.id); setSkipReason(task.skipReason) }}>跳过</button><button onClick={() => updateTask(task.id, { status: task.status === '已完成' ? '待完成' : '已完成', changeNote: task.status === '已完成' ? '恢复为待完成' : '手动完成' })}>{task.status === '已完成' ? '恢复' : '完成'}</button></div><div className="task-actions secondary"><button onClick={() => cycleResource(task)}>更换资源</button><button className="danger-text" onClick={() => setDeleteId(task.id)}>删除</button></div></article>)}</div></section> })}</div>

    {editing && <Modal title={data.tasks.some(task => task.id === editing.id) ? '调整学习任务' : '添加学习任务'} description="任务字段会同步到今日页和学习进展。" onClose={() => { setEditing(null); setError('') }} footer={<><button className="button secondary" onClick={() => setEditing(null)}>取消</button><button className="button primary" onClick={saveTask}>保存任务</button></>}><div className="form-grid two"><label className="field"><span>任务名称</span><input value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label><label className="field"><span>学习知识点</span><input value={editing.knowledgePoint} onChange={event => setEditing({ ...editing, knowledgePoint: event.target.value })} /></label><label className="field"><span>日期</span><input type="date" value={editing.date} onChange={event => setEditing({ ...editing, date: event.target.value })} /></label><label className="field"><span>时间</span><input type="time" value={editing.time} onChange={event => setEditing({ ...editing, time: event.target.value })} /></label><label className="field"><span>推荐视频或材料</span><select value={editing.resourceId} onChange={event => { const resource = data.resources.find(item => item.id === event.target.value); setEditing({ ...editing, resourceId: event.target.value, materialLabel: resource?.title || '', watchMinutes: resource?.durationMin || 0 }) }}><option value="">暂不选择</option>{data.resources.filter(resource => resource.status !== '不感兴趣').map(resource => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select></label><label className="field"><span>观看时长（分钟）</span><input type="number" min="0" max="600" value={editing.watchMinutes} onChange={event => setEditing({ ...editing, watchMinutes: Number(event.target.value) })} /></label><label className="field"><span>练习数量</span><input type="number" min="0" max="200" value={editing.practiceCount} onChange={event => setEditing({ ...editing, practiceCount: Number(event.target.value) })} /></label><label className="field"><span>预计时间（分钟）</span><input type="number" min="5" max="360" value={editing.estimatedMinutes} onChange={event => setEditing({ ...editing, estimatedMinutes: Number(event.target.value) })} /></label><label className="field"><span>小测任务</span><input value={editing.quizTask} onChange={event => setEditing({ ...editing, quizTask: event.target.value })} /></label><label className="field"><span>完成标准</span><textarea rows={3} value={editing.completionCriteria} onChange={event => setEditing({ ...editing, completionCriteria: event.target.value })} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {skipId && <Modal title="填写跳过原因" description="原因会进入学习进展，用于下周调整。" onClose={() => setSkipId('')} footer={<><button className="button secondary" onClick={() => setSkipId('')}>取消</button><button className="button primary" onClick={() => { if (!skipReason.trim()) return setError('请填写跳过原因。'); updateTask(skipId, { status: '已跳过', skipReason: skipReason.trim(), changeNote: '记录跳过原因' }); setSkipId(''); setSkipReason(''); notify('任务已跳过并记录原因。') }}>确认跳过</button></>}><label className="field"><span>为什么跳过？</span><textarea rows={4} value={skipReason} onChange={event => { setSkipReason(event.target.value); setError('') }} placeholder="例如：前置知识不足，需要先完成函数基础" /></label>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {deleteId && <Modal title="删除任务？" description="删除后不会计入学习进展。" onClose={() => setDeleteId('')} footer={<><button className="button secondary" onClick={() => setDeleteId('')}>取消</button><button className="button danger" onClick={() => { updateData(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== deleteId) })); setDeleteId(''); notify('任务已删除。') }}>删除</button></>}><p>确认删除「{data.tasks.find(task => task.id === deleteId)?.title}」吗？</p></Modal>}
  </div>
}
