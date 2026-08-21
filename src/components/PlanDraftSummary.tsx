import { useState } from 'react'
import { Link } from 'react-router-dom'
import { daysBetween } from '../dateUtils.ts'
import { planValidationLabel } from '../globalPlanner.ts'
import type { Course, GlobalPlanDraft, ScheduleProfile } from '../types.ts'
import { InlineNotice } from '../components.tsx'

type DiffSummary = { added: number; removed: number; moved: number; shortened: number; extended: number; resourceChanged: number }

export function PlanDraftSummary({ courses, schedule, draft, diff, loading, onRegenerate, onActivate }: {
  courses: Course[]
  schedule: ScheduleProfile
  draft: GlobalPlanDraft
  diff: DiffSummary | null
  loading: boolean
  onRegenerate: () => void
  onActivate: () => void
}) {
  const [basisOpen, setBasisOpen] = useState(false)
  const courseMap = new Map(courses.map(course => [course.id, course]))
  const validation = draft.validation
  const failures = Object.entries(validation.failuresByReason).filter(([, count]) => count > 0) as Array<[keyof typeof validation.failuresByReason, number]>
  const unresolved = validation.failedTaskIds.length
  const recoverable = validation.confirmationTaskIds.length

  return <section className="plan-draft-summary" role="region" aria-labelledby="plan-draft-title">
    <header>
      <div><span className="section-kicker">第 {draft.version} 版总课表草案 · 本地规划引擎</span><h2 id="plan-draft-title">全部课程计划预览</h2><p>草案任务已经放入下方课表。确认后才会一次性替换未完成计划；已完成任务不会被覆盖。</p></div>
      <span className={`status-pill ${validation.valid ? 'success' : 'warning'}`}>{validation.valid ? '可以启用' : '需要处理'}</span>
    </header>
    <div className="draft-facts global-draft-facts">
      <article><span>计划课程</span><strong>{draft.courseIds.length} 门</strong><small>{draft.courseIds.map(id => courseMap.get(id)?.name).filter(Boolean).join('、')}</small></article>
      <article><span>计划范围</span><strong>{draft.dateRange.start} — {draft.dateRange.end}</strong><small>共 {daysBetween(draft.dateRange.start, draft.dateRange.end) + 1} 天</small></article>
      <article><span>计划内已安排</span><strong>{validation.scheduledTaskIds.length} 项</strong><small>日期、节次、容量与冲突均通过校验</small></article>
      <article><span>等待后续安排</span><strong>{recoverable} 项</strong><small>不会阻止已生成的草案，系统会在下一周继续安排</small></article>
      <article><span>需要补充</span><strong>{unresolved} 项</strong><small>{unresolved ? '请查看下方安排详情' : '当前没有必须处理的问题'}</small></article>
      <article><span>每周可用时间</span><strong>{((schedule.weekdayMinutes * 5 + schedule.weekendMinutes * 2) / 60).toFixed(1)} 小时</strong><small>保留空节，不要求填满 10 节</small></article>
    </div>
    <section className="plan-quality-summary" aria-label="计划质量">
      <span className={`status-pill ${validation.quality.executable ? 'success' : 'warning'}`}>{validation.quality.executable ? '可执行' : '需要调整'}</span>
      <p>结构 {validation.quality.structureValid ? '完整' : '待补充'} · 容量 {validation.quality.capacityValid ? '可用' : '不足'} · 语义 {validation.quality.semanticValid ? '可解释' : '缺少依据'}</p>
      <small>未排入本周的任务会保留在任务池并进入下一周；这不是失败，也不等同于计划无法启用。</small>
    </section>
    <div className="draft-allocation" aria-label="各课程每周时间分配">
      {draft.courseIds.map(courseId => <div key={courseId} title={draft.allocationReasons[courseId]}><span>{courseMap.get(courseId)?.name ?? '课程已移除'}</span><strong>{draft.allocationByCourse[courseId] ?? 0} 分钟/周</strong><small>{draft.planningBases[courseId]?.source === 'completed-diagnosis' ? '精细诊断依据' : draft.planningBases[courseId]?.source === 'score-baseline' ? '成绩基线依据' : '自评/作品基线依据'} · 置信度 {draft.planningBases[courseId]?.confidence ?? 'low'}</small></div>)}
    </div>
    {diff && <div className="draft-diff" role="status" aria-label="重新生成前后差异"><span>与上一份总课表相比</span><strong>新增 {diff.added}</strong><strong>移除 {diff.removed}</strong><strong>移动 {diff.moved}</strong><strong>缩短 {diff.shortened}</strong><strong>延长 {diff.extended}</strong><strong>更换资源 {diff.resourceChanged}</strong></div>}
    {unresolved > 0 && <InlineNotice tone="error"><strong>有 {unresolved} 项任务需要补充或调整，暂时不会影响已经排入课表的草案。</strong><p>补充后可以重新预览；等待下一周的任务无需处理。</p><details><summary>查看安排详情</summary><ul>{failures.map(([code, count]) => <li key={code}>{planValidationLabel(code)}：{count} 项</li>)}</ul></details></InlineNotice>}
    {basisOpen && <div className="draft-basis"><h3>生成依据</h3><ul className="clean-list"><li>每门课程优先选择可追溯依据：已完成诊断优先，其次是成绩基线或自评/作品基线。</li><li>低分、先修依赖、临近截止与用户优先目标获得更多时间。</li><li>统一读取旅行、休息、每日容量与 4+4+2 节次后再排程。</li><li>精细诊断会提高置信度并生成差异预览，但不是开始执行的门槛。</li><li>草案来自本地规则，不保证成绩或作品结果。</li></ul></div>}
    <footer>
      <div><button className="button secondary" onClick={() => setBasisOpen(value => !value)} aria-expanded={basisOpen}>{basisOpen ? '收起生成依据' : '查看生成依据'}</button><Link className="button secondary" to="/settings?section=time">编辑时间约束</Link></div>
      <div><button className="button secondary" disabled={loading} onClick={onRegenerate}>{loading ? '正在重新生成…' : '预览重新生成变化'}</button><button className="button primary" disabled={!validation.valid || loading} aria-describedby={!validation.valid ? 'plan-validation-help' : undefined} onClick={onActivate}>{loading ? '正在处理…' : '确认并启用全部课程'}</button></div>
    </footer>
    {!validation.valid && <small id="plan-validation-help">请查看“安排详情”并补充必要信息；不影响已安排任务，也不会把等待下一周的任务视为错误。</small>}
  </section>
}
