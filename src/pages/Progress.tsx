import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, InlineNotice, PageHeader } from '../components.tsx'
import { applyNextWeekPlan } from '../providers.ts'
import { useStore } from '../store.tsx'

export default function Progress() {
  const { data, updateData, notify } = useStore()
  const [loading, setLoading] = useState(false)
  const [reflection, setReflection] = useState('')
  const progress = data.progress
  const completed = data.tasks.filter(task => task.status === '已完成').length
  const completionRate = data.tasks.length ? Math.round((completed / data.tasks.length) * 100) : 0

  const applyPlan = () => {
    if (loading) return
    setLoading(true)
    window.setTimeout(() => {
      updateData(current => ({ ...current, tasks: applyNextWeekPlan(current.tasks), progress: { ...current.progress, nextWeekAppliedAt: new Date().toISOString() }, planChanges: [`下周计划已应用：${current.progress.nextWeekReason}`, ...current.planChanges] }))
      setLoading(false)
      notify('下周新计划已应用。')
    }, 520)
  }

  const saveReflection = () => {
    if (!reflection.trim()) return notify('请先填写本周观察。', 'error')
    updateData(current => ({ ...current, progress: { ...current.progress, nextWeekReason: reflection.trim() } }))
    setReflection('')
    notify('本周观察已保存为下周调整依据。')
  }

  const metrics = [
    { label: '任务完成率', value: `${completionRate}%`, note: `${completed}/${data.tasks.length} 项任务` },
    { label: '初始诊断正确率', value: `${progress.initialAccuracy}%`, note: '首次基础诊断' },
    { label: '本周测试正确率', value: `${progress.weeklyAccuracy}%`, note: `较初始 ${progress.weeklyAccuracy - progress.initialAccuracy >= 0 ? '+' : ''}${progress.weeklyAccuracy - progress.initialAccuracy}%` },
    { label: '知识点掌握度', value: `${progress.masteryNow}%`, note: `初始 ${progress.masteryBefore}%` },
    { label: '错题数量', value: String(progress.wrongAnswers), note: '包含快速小测' },
    { label: '实际学习时间', value: `${Math.floor(progress.actualStudyMinutes / 60)}h ${progress.actualStudyMinutes % 60}m`, note: '本周累计' },
  ]

  return <div className="page progress-page"><PageHeader eyebrow="学习进展" title="用结果决定下周怎么改" description="周复盘已合并到这里。完成率只是一个信号，正确率、重复错误和实际时长共同决定调整。" actions={<button className="button primary" onClick={applyPlan} disabled={loading}>{loading ? '正在应用…' : '应用下周新计划'} <Icon name="arrow" /></button>} />
    {progress.nextWeekAppliedAt && <InlineNotice tone="success">下周计划已于 {new Date(progress.nextWeekAppliedAt).toLocaleString('zh-CN')} 应用，可在学习计划中继续调整。</InlineNotice>}
    <section className="metric-grid">{metrics.map(metric => <article className="card metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.note}</p></article>)}</section>
    <div className="grid-two progress-details"><section className="card section-card"><span className="section-kicker">知识点掌握度变化</span><h2>{progress.masteryBefore}% → {progress.masteryNow}%</h2><div className="mastery-track" aria-label={`掌握度 ${progress.masteryNow}%`}><i style={{ width: `${progress.masteryNow}%` }} /></div><p>掌握度由诊断测验、任务小测和重复错误共同更新，不代表考试成绩保证。</p><h3>重复错误知识点</h3>{progress.repeatedWeakPoints.length ? <div className="tag-list danger-tags">{progress.repeatedWeakPoints.map(point => <span key={point}>{point}</span>)}</div> : <p>暂未发现重复错误。</p>}</section><section className="card section-card"><span className="section-kicker">资源完成情况</span><h2>{progress.resourceCompleted}/{progress.resourceTotal} 个资源已完成</h2><div className="resource-progress-list">{data.resources.filter(resource => resource.status === '已加入计划').slice(0, 5).map(resource => { const related = data.tasks.filter(task => task.resourceId === resource.id); const done = related.filter(task => task.status === '已完成').length; return <div key={resource.id}><div><strong>{resource.title}</strong><span>{done}/{related.length}</span></div><div className="mini-track"><i style={{ width: `${related.length ? done / related.length * 100 : 0}%` }} /></div></div> })}{!data.resources.some(resource => resource.status === '已加入计划') && <p>还没有加入计划的学习资源。</p>}</div><Link className="text-link" to="/resources">管理学习资源 <Icon name="arrow" /></Link></section></div>
    <section className="card section-card next-week-review"><div><span className="section-kicker">下周调整原因</span><h2>不是增加任务，而是修复重复问题</h2><p>{progress.nextWeekReason}</p><ul><li>优先处理重复错误知识点：{progress.repeatedWeakPoints.join('、') || '暂无'}</li><li>单次任务控制在 {data.schedule.maxFocusMinutes} 分钟以内。</li><li>跳过和延期任务会重新进入可用日期，不复制已完成任务。</li></ul></div><div className="reflection-box"><label className="field"><span>补充本周观察</span><textarea rows={5} value={reflection} onChange={event => setReflection(event.target.value)} placeholder="例如：晚上容易分心，导数规则需要更多基础题" /></label><button className="button secondary" onClick={saveReflection}>保存为调整依据</button></div></section>
    <div className="bottom-cta"><p>应用后会真实修改未完成任务的日期、时长和变化说明。</p><button className="button primary" onClick={applyPlan} disabled={loading}>{loading ? '正在应用…' : '应用下周新计划'}</button></div>
  </div>
}
