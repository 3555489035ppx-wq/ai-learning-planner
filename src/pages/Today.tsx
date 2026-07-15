import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { addDays, createTask, todayISO } from '../data.ts'
import { useStore } from '../store.tsx'
import type { LearningTask } from '../types.ts'

export default function Today() {
  const { data, updateData, notify } = useStore()
  const [editing, setEditing] = useState<LearningTask | null>(null)
  const [skipId, setSkipId] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [dailyMinutes, setDailyMinutes] = useState(data.schedule.weekdayMinutes)
  const [quizAnswer, setQuizAnswer] = useState('')
  const [quizState, setQuizState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState('')
  const today = todayISO()
  const priorityCourseId = data.courses.find(course => course.priority)?.id
  const todayTasks = useMemo(() => data.tasks.filter(task => task.date === today).sort((a, b) => Number(b.courseId === priorityCourseId) - Number(a.courseId === priorityCourseId) || a.time.localeCompare(b.time)), [data.tasks, priorityCourseId, today])
  const important = todayTasks.filter(task => task.status !== '已跳过').slice(0, 3)
  const completed = todayTasks.filter(task => task.status === '已完成').length

  const updateTask = (id: string, patch: Partial<LearningTask>) => updateData(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? { ...task, ...patch } : task) }))
  const saveTask = () => {
    if (!editing) return
    if (!editing.title.trim() || !editing.knowledgePoint.trim() || !editing.completionCriteria.trim()) return setError('请填写任务名称、知识点和完成标准。')
    updateData(current => ({ ...current, tasks: current.tasks.some(task => task.id === editing.id) ? current.tasks.map(task => task.id === editing.id ? editing : task) : [...current.tasks, editing], planChanges: [`今日任务「${editing.title}」已更新。`, ...current.planChanges] }))
    setEditing(null); setError(''); notify('今日任务已保存。')
  }
  const switchResource = (task: LearningTask) => {
    const candidates = data.resources.filter(resource => resource.status !== '不感兴趣' && resource.id !== task.resourceId)
    const next = candidates.find(resource => resource.knowledgePoints.includes(task.knowledgePoint)) || candidates[0]
    if (!next) return notify('暂无可替换资源。', 'error')
    updateTask(task.id, { resourceId: next.id, materialLabel: next.title, watchMinutes: next.durationMin, changeNote: '今日页切换推荐资源' })
    notify(`已切换为「${next.title}」。`)
  }
  const submitQuiz = () => {
    if (!quizAnswer) return setError('请选择答案后提交。')
    setQuizState('loading'); setError('')
    window.setTimeout(() => {
      const correct = quizAnswer === '1'
      updateData(current => ({ ...current, progress: { ...current.progress, weeklyAccuracy: Math.round((current.progress.weeklyAccuracy * 9 + (correct ? 100 : 0)) / 10), wrongAnswers: current.progress.wrongAnswers + (correct ? 0 : 1) }, planChanges: [correct ? '今日快速小测答对，保持当前节奏。' : '今日快速小测答错，下次计划增加极限基础练习。', ...current.planChanges] }))
      setQuizState('done'); notify(correct ? '回答正确，进展已更新。' : '已记录错题并加入调整依据。', correct ? 'success' : 'info')
    }, 420)
  }

  return <div className="page today-page"><PageHeader eyebrow={new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())} title="今天只推进最重要的三件事" description="任务可以立即编辑、延期、跳过、完成或更换资源，改动会同步到学习计划。" actions={<button className="button primary" onClick={() => setEditing(createTask({ date: today, title: '', courseId: data.courses[0]?.id || '', knowledgePoint: '', completionCriteria: '', quizTask: '', resourceId: '', materialLabel: '', order: data.tasks.length }))}><Icon name="plus" /> 添加任务</button>} />
    <section className="today-overview"><article className="card focus-summary"><span>今日完成</span><strong>{completed}/{todayTasks.length}</strong><p>预计 {todayTasks.filter(task => task.status !== '已完成' && task.status !== '已跳过').reduce((sum, task) => sum + task.estimatedMinutes, 0)} 分钟待完成</p></article><article className="card duration-setting"><div><span>今日学习时长上限</span><strong>{dailyMinutes} 分钟</strong></div><label className="field"><span>分钟</span><input aria-label="今日学习时长" type="number" min="30" max="360" step="15" value={dailyMinutes} onChange={event => setDailyMinutes(Number(event.target.value))} /></label><button className="button secondary" onClick={() => { updateData(current => ({ ...current, schedule: { ...current.schedule, weekdayMinutes: dailyMinutes }, planChanges: [`今日学习时长调整为 ${dailyMinutes} 分钟。`, ...current.planChanges] })); notify('今日时长已保存。') }}>保存时长</button></article></section>
    <div className="today-grid"><section className="today-main"><div className="section-title"><div><span className="section-kicker">今日最重要的 3 个任务</span><h2>按优先级执行</h2></div><Link className="text-link" to="/plan">查看完整计划 <Icon name="arrow" /></Link></div>{important.length === 0 ? <EmptyState title="今天没有待执行任务" description="可以添加一项自己的任务，或让学习教练从剩余计划中重排。" action={<button className="button primary" onClick={() => setEditing(createTask({ date: today, title: '', knowledgePoint: '', completionCriteria: '', courseId: data.courses[0]?.id || '', order: data.tasks.length }))}>添加任务</button>} /> : <div className="today-task-list">{important.map((task, index) => <article className={`card today-task ${task.status === '已完成' ? 'completed' : ''}`} key={task.id}><div className="today-rank">0{index + 1}</div><div className="today-task-copy"><div className="task-topline"><span>{task.time} · {task.estimatedMinutes} 分钟</span><span>{task.status}</span></div><h3>{task.title}</h3><p>{task.knowledgePoint}</p><div className="today-material"><span>学习材料</span><strong>{task.materialLabel || '待选择资源'}</strong><button onClick={() => switchResource(task)}>切换推荐资源</button></div><dl><div><dt>练习</dt><dd>{task.practiceCount} 题</dd></div><div><dt>小测</dt><dd>{task.quizTask || '无'}</dd></div><div><dt>完成标准</dt><dd>{task.completionCriteria}</dd></div></dl>{task.status === '已跳过' && <p className="skip-reason">跳过原因：{task.skipReason}</p>}<div className="today-actions"><button onClick={() => setEditing({ ...task })}><Icon name="edit" size={15} /> 编辑</button><button onClick={() => { updateTask(task.id, { date: addDays(task.date, 1), status: '已延期', changeNote: '从今日页延后 1 天' }); notify('任务已延后到明天。') }}>延后</button><button onClick={() => { setSkipId(task.id); setSkipReason('') }}>跳过</button><button className="complete-button" onClick={() => { updateTask(task.id, { status: task.status === '已完成' ? '待完成' : '已完成', changeNote: task.status === '已完成' ? '恢复今日任务' : '完成今日任务' }); notify(task.status === '已完成' ? '任务已恢复。' : '任务完成，进展已更新。') }}><Icon name="check" size={15} /> {task.status === '已完成' ? '恢复' : '标记完成'}</button></div></div></article>)}</div>}</section><aside className="today-side"><section className="card quick-quiz"><span className="section-kicker">今日快速小测</span><h2>当 x → 0 时，sin x / x 的极限是？</h2><div>{['0', '1', '不存在'].map(option => <label key={option} className={quizAnswer === option ? 'selected' : ''}><input type="radio" name="today-quiz" value={option} checked={quizAnswer === option} onChange={event => { setQuizAnswer(event.target.value); setQuizState('idle'); setError('') }} />{option}</label>)}</div>{error && <InlineNotice tone="error">{error}</InlineNotice>}{quizState === 'done' && <InlineNotice tone={quizAnswer === '1' ? 'success' : 'info'}>{quizAnswer === '1' ? '回答正确。' : '正确答案是 1，已加入错题记录。'}</InlineNotice>}<button className="button primary full" onClick={submitQuiz} disabled={quizState === 'loading'}>{quizState === 'loading' ? '正在提交…' : '提交答案'}</button></section><section className="card change-log"><span className="section-kicker">计划变化说明</span><h2>为什么今天这样安排</h2>{data.planChanges.length ? <ul>{data.planChanges.slice(0, 4).map((change, index) => <li key={`${change}-${index}`}>{change}</li>)}</ul> : <p>今天尚未发生计划调整。</p>}</section></aside></div>

    {editing && <Modal title={data.tasks.some(task => task.id === editing.id) ? '编辑今日任务' : '添加今日任务'} onClose={() => { setEditing(null); setError('') }} footer={<><button className="button secondary" onClick={() => setEditing(null)}>取消</button><button className="button primary" onClick={saveTask}>保存</button></>}><div className="form-grid two"><label className="field"><span>任务名称</span><input value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label><label className="field"><span>知识点</span><input value={editing.knowledgePoint} onChange={event => setEditing({ ...editing, knowledgePoint: event.target.value })} /></label><label className="field"><span>开始时间</span><input type="time" value={editing.time} onChange={event => setEditing({ ...editing, time: event.target.value })} /></label><label className="field"><span>预计时间（分钟）</span><input type="number" min="5" max="360" value={editing.estimatedMinutes} onChange={event => setEditing({ ...editing, estimatedMinutes: Number(event.target.value) })} /></label><label className="field"><span>练习数量</span><input type="number" min="0" max="200" value={editing.practiceCount} onChange={event => setEditing({ ...editing, practiceCount: Number(event.target.value) })} /></label><label className="field"><span>小测任务</span><input value={editing.quizTask} onChange={event => setEditing({ ...editing, quizTask: event.target.value })} /></label><label className="field full-span"><span>完成标准</span><textarea rows={3} value={editing.completionCriteria} onChange={event => setEditing({ ...editing, completionCriteria: event.target.value })} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {skipId && <Modal title="跳过今天的任务？" description="填写原因后，学习进展会把它作为下周调整依据。" onClose={() => setSkipId('')} footer={<><button className="button secondary" onClick={() => setSkipId('')}>取消</button><button className="button primary" onClick={() => { if (!skipReason.trim()) return setError('请填写跳过原因。'); updateTask(skipId, { status: '已跳过', skipReason: skipReason.trim(), changeNote: '今日任务已跳过' }); setSkipId(''); setSkipReason(''); setError(''); notify('跳过原因已记录。') }}>确认跳过</button></>}><label className="field"><span>跳过原因</span><textarea rows={4} value={skipReason} onChange={event => { setSkipReason(event.target.value); setError('') }} /></label>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
  </div>
}
