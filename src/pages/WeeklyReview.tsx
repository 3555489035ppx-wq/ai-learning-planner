import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CourseSwitcher, EmptyState, InlineNotice, Modal, PageHeader, WeekNavigator } from '../components.tsx'
import { createTaskChangeSet, revertChangeSet } from '../changeSets.ts'
import { addDays, mondayOfWeek } from '../dateUtils.ts'
import { applyNextWeekPlan, canApplyNextWeekPlan, deriveProgress, nextWeekLockKey, nextWeekRevision } from '../providers.ts'
import { useStore } from '../store.tsx'

const weekLabel = (start: string) => `${start} — ${addDays(start, 6)}`

export default function WeeklyReview() {
  const { data, updateData, notify } = useStore()
  const [courseId, setCourseId] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [answers, setAnswers] = useState({ effective: '', unfinished: '', next: '' })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const weekStart = addDays(mondayOfWeek(), weekOffset * 7)
  const progress = useMemo(() => deriveProgress(data, courseId, weekStart), [courseId, data, weekStart])
  const previewTasks = useMemo(() => applyNextWeekPlan(data.tasks, courseId, data.schedule, data.courses, weekStart), [courseId, data.courses, data.schedule, data.tasks, weekStart])
  const previewMap = useMemo(() => new Map(previewTasks.map(task => [task.id, task])), [previewTasks])
  const changed = useMemo(() => data.tasks.filter(task => {
    const next = previewMap.get(task.id)
    return next && (next.date !== task.date || next.slotId !== task.slotId || next.estimatedMinutes !== task.estimatedMinutes)
  }), [data.tasks, previewMap])
  const alreadyApplied = !canApplyNextWeekPlan(data, courseId, weekStart)
  const lockKey = nextWeekLockKey(courseId, weekStart)
  const reviewState = data.progress.weekReviewStates[lockKey]
  const lastChangeSet = data.changeSets.find(item => item.id === reviewState?.appliedChangeSetId && !item.revertedAt)
    ?? [...data.changeSets].reverse().find(item => !item.revertedAt && item.source === 'weekly_review' && item.weekId === weekStart && (item.courseId ?? '') === courseId)
  const savedReflection = data.progress.weekReflections[lockKey] ?? ''
  const userEvidence = answers.unfinished.trim() || answers.next.trim() || savedReflection.trim()
  const hasAdjustmentEvidence = Boolean(userEvidence || progress.repeatedWeakPoints.length || progress.delayed + progress.skipped >= 3)
  const dynamicPrompt = progress.causes[0] || progress.signals[0] || '本周记录还不多，下周最想先验证哪一项安排？'
  const reason = [answers.unfinished, answers.next, savedReflection, ...progress.causes, ...progress.signals].find(item => item.trim()) || '不足以判断'
  const canPreview = hasAdjustmentEvidence && !alreadyApplied && changed.length > 0

  const closePreview = useCallback(() => setPreviewOpen(false), [])
  const slotLabel = useCallback((slotId: string, fallback: string) => data.schedule.timeSlots.find(slot => slot.id === slotId)?.label || fallback || '待确认', [data.schedule.timeSlots])

  const saveReflection = () => {
    const text = [`最有效：${answers.effective || '未填写'}`, `未完成原因：${answers.unfinished || '未填写'}`, `下周调整：${answers.next || '未填写'}`].join('\n')
    if (!answers.effective.trim() && !answers.unfinished.trim() && !answers.next.trim()) return notify('请至少回答一个复盘问题。', 'error')
    if (alreadyApplied) return notify('已应用的复盘是只读快照。请先创建修订版。', 'error')
    updateData(current => ({ ...current, progress: { ...current.progress, reflection: text, nextWeekReason: reason, weekReflections: { ...current.progress.weekReflections, [lockKey]: text } } }))
    notify('本周复盘已保存。')
  }

  const applyPlan = () => {
    if (loading || !canPreview) return
    setLoading(true)
    const changeSet = createTaskChangeSet(data.tasks, previewTasks, `应用 ${weekStart} 的下周调整：${reason}`, { scope: 'week', courseId: courseId || undefined, weekId: weekStart, source: 'weekly_review' })
    updateData(current => ({
      ...current,
      tasks: previewTasks,
      changeSets: [...current.changeSets, changeSet],
      weekArchives: current.weekArchives.some(item => item.weekStart === weekStart && item.courseId === (courseId || 'all')) ? current.weekArchives : [...current.weekArchives, { id: crypto.randomUUID(), weekStart, weekEnd: addDays(weekStart, 6), courseId: courseId || 'all', planVersionIds: current.plans.filter(plan => (plan.status === 'active' || plan.status === 'stale') && (!courseId || plan.courseId === courseId)).map(plan => plan.id), plannedTaskIds: progress.weeklyTasks.map(task => task.id), plannedTasks: progress.weeklyTasks.map(task => ({ taskId: task.id, courseId: task.courseId })), reflection: current.progress.weekReflections[lockKey] || reason, archivedAt: new Date().toISOString() }],
      progress: { ...current.progress, nextWeekAppliedAt: new Date().toISOString(), nextWeekReason: reason, appliedLocks: { ...current.progress.appliedLocks, [lockKey]: nextWeekRevision(weekStart) }, appliedRevision: courseId ? current.progress.appliedRevision : nextWeekRevision(weekStart), weekReviewStates: { ...current.progress.weekReviewStates, [lockKey]: { key: lockKey, courseId: courseId || 'all', weekStart, version: (current.progress.weekReviewStates[lockKey]?.version ?? 0) + 1, status: 'applied', appliedChangeSetId: changeSet.id, appliedAt: new Date().toISOString() } } },
      planChanges: [`周复盘已应用：${reason}`, ...current.planChanges],
    }))
    setLoading(false); closePreview(); notify('下周调整已应用并保存版本，可在本页撤销。')
  }

  const undo = () => {
    if (!lastChangeSet) return
    updateData(current => {
      const reverted = revertChangeSet(current, lastChangeSet.id)
      const locks = { ...reverted.progress.appliedLocks }
      delete locks[lockKey]
      return { ...reverted, progress: { ...reverted.progress, appliedLocks: locks, appliedRevision: courseId ? reverted.progress.appliedRevision : '', weekReviewStates: { ...reverted.progress.weekReviewStates, [lockKey]: { ...reverted.progress.weekReviewStates[lockKey], status: 'superseded', appliedChangeSetId: '', appliedAt: '' } } }, planChanges: [`已撤销周复盘调整：${lastChangeSet.reason}`, ...reverted.planChanges] }
    })
    notify('下周调整已撤销，其他后续编辑保持不变。')
  }

  const createRevision = () => {
    updateData(current => {
      const locks = { ...current.progress.appliedLocks }
      delete locks[lockKey]
      return { ...current, progress: { ...current.progress, appliedLocks: locks, appliedRevision: courseId ? current.progress.appliedRevision : '', weekReviewStates: { ...current.progress.weekReviewStates, [lockKey]: { ...current.progress.weekReviewStates[lockKey], status: 'superseded' as const } } } }
    })
    notify('已创建复盘修订版；旧版应用记录保持可追溯。')
  }

  return <div className="page wide-page weekly-review-page">
    <PageHeader eyebrow="周复盘" title="把本周证据变成下周调整" description="这里回答“下周怎么改”。规划建议只处理有证据的未完成任务，已完成任务不会被移动或删除。" actions={<Link className="button secondary" to="/progress">查看发生了什么</Link>} />
    <CourseSwitcher courses={data.courses} value={courseId} onChange={setCourseId} includeAll />
    <section className="plan-toolbar"><WeekNavigator label={weekLabel(weekStart)} isCurrent={weekOffset === 0} onPrevious={() => setWeekOffset(value => value - 1)} onNext={() => setWeekOffset(value => value + 1)} onCurrent={() => setWeekOffset(0)} /><span>{data.weekArchives.some(item => item.weekStart === weekStart && item.courseId === (courseId || 'all')) ? '已归档' : weekOffset === 0 ? '当前周' : '历史周'}</span></section>
    {alreadyApplied && <InlineNotice tone="success">本课程与周次的复盘已应用，当前快照只读。{lastChangeSet && <button className="inline-action" onClick={undo}>撤销调整</button>}<button className="inline-action" onClick={createRevision}>创建修订版</button></InlineNotice>}

    {!progress.hasRecords ? <EmptyState title="这一周还没有可复盘的记录" description="开始、完成、延期或跳过任务后，这里才会根据真实事件提出下周调整。" action={<Link className="button primary" to="/today">开始今日任务</Link>} /> : <>
      <div className="review-grid">
        <section className="review-evidence"><div className="section-title"><div><span className="section-kicker">本周证据</span><h2>每天与课程记录</h2><p>按原计划日期保留完成、延期和跳过事实。</p></div></div><div className="review-days">{Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map(date => { const items = progress.weeklyTasks.filter(task => (task.originalPlannedDate || task.date) === date); const completed = items.filter(task => task.status === '已完成').length; return <article key={date}><span>{date.slice(5)}</span><strong>{completed}/{items.length}</strong><small>{items.length ? [...new Set(items.map(task => data.courses.find(course => course.id === task.courseId)?.name).filter(Boolean))].join('、') : '无原计划任务'}</small></article> })}</div><div className="evidence-facts"><p><strong>{progress.actualMinutes}</strong><span>实际学习分钟</span></p><p><strong>{progress.delayed + progress.skipped}</strong><span>延期或跳过任务</span></p><p><strong>{progress.repeatedWeakPoints.length || '暂无'}</strong><span>重复薄弱知识点</span></p></div><h3>可用于调整的原因</h3>{progress.signals.length || progress.causes.length ? <ul className="clean-list">{[...new Set([...progress.signals, ...progress.causes])].map(signal => <li key={signal}>{signal}</li>)}</ul> : <p>目前只有完成记录，尚未发现稳定问题。</p>}<p className="evidence-note">{dynamicPrompt}</p></section>
        <aside className={`review-advice ${hasAdjustmentEvidence ? '' : 'needs-evidence'}`}><span className="section-kicker">下周规划建议</span><h2>{hasAdjustmentEvidence ? '下周先降低失败成本' : '先记录本周，再调整'}</h2>{hasAdjustmentEvidence ? <><p>{reason}</p><ul className="clean-list"><li>只重新安排原计划未完成任务。</li><li>保留已完成任务和实际完成记录。</li><li>应用前重新验证容量、休息日与冲突。</li></ul><button className="button primary" disabled={!canPreview} onClick={() => setPreviewOpen(true)}>{alreadyApplied ? '本周已应用' : changed.length ? '查看计划调整差异' : '没有可调整任务'}</button></> : <div className="compact-empty"><p>目前没有足够的延期、跳过或复盘原因。先保存至少一条真实观察，再生成下周建议。</p></div>}</aside>
      </div>

      <section className="review-questions"><div><span className="section-kicker">你的复盘</span><h2>三句话，决定下周怎么改</h2><p>{savedReflection ? `已保存记录：${savedReflection.replaceAll('\n', '；')}` : '至少填写一项；内容会成为本地规划引擎调整的明确依据。'}</p></div><fieldset disabled={alreadyApplied}><div className="form-grid three"><label className="field"><span>这周哪项任务最有效？</span><textarea name="effective-task" rows={4} value={answers.effective} onChange={event => setAnswers(current => ({ ...current, effective: event.target.value }))} /></label><label className="field"><span>哪项没有完成，主要原因是什么？</span><textarea name="unfinished-reason" rows={4} value={answers.unfinished} onChange={event => setAnswers(current => ({ ...current, unfinished: event.target.value }))} placeholder={progress.causes[0] || ''} /></label><label className="field"><span>下周最希望调整什么？</span><textarea name="next-adjustment" rows={4} value={answers.next} onChange={event => setAnswers(current => ({ ...current, next: event.target.value }))} /></label></div><div className="review-question-actions"><button className="button secondary" onClick={saveReflection}>保存本周复盘</button></div></fieldset></section>

      <section className="review-change-section"><div className="section-title"><div><span className="section-kicker">计划修改前后</span><h2>确认每一项变化，再应用到下周</h2><p>已完成任务已从候选项中排除；资源是否受影响会单独说明。</p></div></div>{changed.length ? <><div className="review-change-list" role="table" aria-label="下周计划调整明细"><div className="change-list-header" role="row"><span role="columnheader">任务</span><span role="columnheader">日期</span><span role="columnheader">节次</span><span role="columnheader">调整原因</span><span role="columnheader">资源影响</span></div>{changed.map(task => { const next = previewMap.get(task.id)!; const course = data.courses.find(item => item.id === task.courseId); const affectsResource = task.resourceId !== next.resourceId; return <div className="change-list-row" role="row" key={task.id}><span role="cell"><strong>{course?.name}</strong>{task.title}</span><span role="cell"><small>旧</small>{task.date}<small>新</small>{next.date || '待确认'}</span><span role="cell"><small>旧</small>{slotLabel(task.slotId, task.time)}<small>新</small>{slotLabel(next.slotId, next.time)}</span><span role="cell">{task.skipReason || reason}</span><span role="cell">{affectsResource ? '是，需要重新确认资源' : task.resourceId ? '否，沿用原资源' : '否，任务未绑定资源'}</span></div> })}</div><div className="review-change-actions"><p>{hasAdjustmentEvidence ? `调整依据：${reason}` : '调整依据：不足以判断。请先填写真实原因。'}</p><button className="button primary" disabled={!canPreview} onClick={() => setPreviewOpen(true)}>{alreadyApplied ? '本周已应用' : hasAdjustmentEvidence ? '确认应用下周计划' : '证据不足，暂不能应用'}</button></div></> : <div className="compact-empty"><p>当前没有需要移动的未完成任务。</p><p>完成任务会保留在原位置；规划系统不会为了制造变化而改动计划。</p></div>}</section>
    </>}

    {previewOpen && <Modal title="确认应用下周计划" description={`将调整 ${changed.length} 项未完成任务；应用后可从本页撤销。`} onClose={closePreview} footer={<><button className="button secondary" onClick={closePreview}>取消</button><button className="button primary" disabled={loading || !canPreview} onClick={applyPlan}>{loading ? '正在应用…' : '应用下周新计划'}</button></>}><InlineNotice>调整依据：{reason}</InlineNotice><ul className="clean-list confirmation-list"><li>已完成任务不会移动或删除。</li><li>日期与节次将重新检查假期边界和容量。</li><li>本次修改会保存可撤销的计划版本和复盘记录。</li></ul></Modal>}
  </div>
}
