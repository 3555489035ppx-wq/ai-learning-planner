import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CourseSwitcher, Icon, InlineNotice, Modal, PageHeader, WeekNavigator } from '../components.tsx'
import { addDays, mondayOfWeek } from '../dateUtils.ts'
import { deriveProgress, deriveProgressTrend, recordAssessment, type ProgressTrendPoint } from '../providers.ts'
import { useStore } from '../store.tsx'
import type { AssessmentEvent, Course } from '../types.ts'

const weekLabel = (start: string) => `${start} — ${addDays(start, 6)}`
const shortWeek = (start: string) => `${start.slice(5).replace('-', '/')} 周`

function PointMetrics({ point }: { point: ProgressTrendPoint }) {
  return <dl className="trend-point-metrics">
    <div><dt>完成任务</dt><dd>{point.completed}/{point.planned}</dd></div>
    <div><dt>实际学习</dt><dd>{point.actualMinutes} 分钟</dd></div>
    <div><dt>{point.objectiveLabel}</dt><dd>{point.objectiveRate === null ? '不足以判断' : `${point.objectiveRate}%`}</dd></div>
    <div><dt>延期 / 跳过</dt><dd>{point.delayed} / {point.skipped}</dd></div>
    <div><dt>重复薄弱点</dt><dd>{point.repeatedWeakPoints.length ? point.repeatedWeakPoints.join('、') : '未形成重复证据'}</dd></div>
  </dl>
}

function CourseTrendCard({ course, data, weekStart, onRecord }: { course: Course; data: ReturnType<typeof useStore>['data']; weekStart: string; onRecord: (courseId: string) => void }) {
  const trend = useMemo(() => deriveProgressTrend(data, course.id, weekStart), [course.id, data, weekStart])
  const maxMinutes = Math.max(1, ...trend.points.map(point => point.actualMinutes))

  return <article className="course-trend-card" data-trend-state={trend.state}>
    <header><div><strong>{course.name}</strong><span>{course.stage || '教育阶段待确认'} · {course.goalType || '目标待补充'}</span></div><span>{trend.state === 'trend' ? `${trend.points.length} 个真实时间点` : trend.state === 'current' ? '本周记录' : '等待数据'}</span></header>
    {trend.state === 'empty' && <div className="trend-empty-state">
      <div><h3>还没有可用于趋势判断的数据</h3><p>完成或调整任务会记录实际事件；同课程测验或成果量表用于判断学习效果。</p></div>
      <div className="trend-empty-actions"><Link className="button primary" to="/today">开始今日任务</Link><button className="button secondary" onClick={() => onRecord(course.id)}>录入测验或成果</button></div>
    </div>}
    {trend.state === 'current' && <div className="current-week-record"><div><span className="section-kicker">{shortWeek(trend.points[0].weekStart)}</span><h3>已有一周记录，暂不绘制趋势</h3><p>至少还需要一个同课程时间点。测验变化只比较相近知识点、难度与同一量表。</p></div><PointMetrics point={trend.points[0]} /></div>}
    {trend.state === 'trend' && <>
      <div className="real-trend" role="img" aria-label={`${course.name} 最近 ${trend.points.length} 个有记录周的实际学习分钟和客观测验趋势`}>
        {trend.points.map(point => <div className="trend-column" key={point.weekStart}>
          <div className="trend-bars" aria-hidden="true">
            <span className="minutes-bar" style={{ height: `${Math.round(point.actualMinutes / maxMinutes * 100)}%` }} />
            <span className="assessment-bar" style={{ height: `${point.objectiveRate ?? 0}%` }} />
          </div>
          <strong>{shortWeek(point.weekStart)}</strong>
          <span>{point.actualMinutes} 分钟</span>
          <span>{point.objectiveRate === null ? '测验不足' : `测验 ${point.objectiveRate}%`}</span>
        </div>)}
      </div>
      <div className="trend-legend"><span><i className="minutes-key" />实际学习分钟（相对本课程最高周）</span><span><i className="assessment-key" />客观测验 / 成果量表</span></div>
      <PointMetrics point={trend.points[trend.points.length - 1]} />
      <p className="comparison-note">{trend.comparableChange ? `${trend.comparableChange.knowledgePoint}（${trend.comparableChange.difficulty}，${trend.comparableChange.type}）从 ${trend.comparableChange.beforeRate}% 变为 ${trend.comparableChange.afterRate}%，变化 ${trend.comparableChange.change >= 0 ? '+' : ''}${trend.comparableChange.change} 个百分点。` : '测验变化：不足以判断。只有同课程、相近知识点与难度、同一量表的前后记录才会比较。'}</p>
    </>}
  </article>
}

export default function ProgressV4() {
  const { data, updateData, notify } = useStore()
  const [searchParams] = useSearchParams()
  const [courseId, setCourseId] = useState(() => searchParams.get('view') === 'trend' ? data.courses.find(course => !course.archivedAt)?.id ?? '' : '')
  const [weekOffset, setWeekOffset] = useState(0)
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [assessment, setAssessment] = useState({ courseId: '', type: '阶段小测' as AssessmentEvent['type'], value: 0, maxValue: 100, knowledgePoint: '', difficulty: '基础' as AssessmentEvent['difficulty'], note: '' })
  const [error, setError] = useState('')
  const weekStart = addDays(mondayOfWeek(), weekOffset * 7)
  const progress = useMemo(() => deriveProgress(data, courseId, weekStart), [courseId, data, weekStart])
  const comparable = progress.assessments.filter(item => item.type !== '自评')
  const visibleCourses = useMemo(() => data.courses.filter(course => !course.archivedAt && (!courseId || course.id === courseId)), [courseId, data.courses])
  const courseOverview = useMemo(() => data.courses.filter(course => !course.archivedAt).map(course => {
    const current = deriveProgress(data, course.id, weekStart)
    const trend = deriveProgressTrend(data, course.id, weekStart)
    return { course, current, trend }
  }), [data, weekStart])
  const selectedAssessmentCourse = data.courses.find(course => course.id === assessment.courseId)
  const usesOutcomeRubric = selectedAssessmentCourse?.assessmentMode === 'project'

  const closeAssessment = useCallback(() => { setAssessmentOpen(false); setError('') }, [])
  const openAssessment = useCallback((targetCourseId = '') => {
    const resolvedId = targetCourseId || courseId || data.courses[0]?.id || ''
    const course = data.courses.find(item => item.id === resolvedId)
    setAssessment(current => ({ ...current, courseId: resolvedId, type: course?.assessmentMode === 'project' ? '作品检查' : current.type === '作品检查' ? '阶段小测' : current.type }))
    setAssessmentOpen(true)
  }, [courseId, data.courses])

  const saveAssessment = () => {
    if (!assessment.courseId || !assessment.knowledgePoint.trim() || assessment.maxValue <= 0 || assessment.value < 0 || assessment.value > assessment.maxValue) return setError('请选择课程、填写知识点，并检查成绩或量表范围。')
    updateData(current => ({ ...current, assessmentEvents: [...current.assessmentEvents, recordAssessment(assessment.courseId, { type: assessment.type, value: assessment.value, maxValue: assessment.maxValue, knowledgePoint: assessment.knowledgePoint.trim(), difficulty: assessment.difficulty, note: assessment.note })] }))
    closeAssessment(); notify('新的学习效果记录已保存。')
  }

  return <div className="page progress-page progress-v4">
    <PageHeader eyebrow="学习进展" title="从完成记录里找到真正的问题" description="这里回答“发生了什么”：区分原计划、实际事件、客观测验和主观自评；证据不足时不会生成趋势结论。" actions={<button className="button primary" onClick={() => openAssessment()}><Icon name="plus" /> 录入测验或成果</button>} />
    <CourseSwitcher courses={data.courses} value={courseId} onChange={setCourseId} includeAll />
    <section className="plan-toolbar"><WeekNavigator label={weekLabel(weekStart)} isCurrent={weekOffset === 0} onPrevious={() => setWeekOffset(value => value - 1)} onNext={() => setWeekOffset(value => value + 1)} onCurrent={() => setWeekOffset(0)} /><Link className="text-button" to="/weekly-review">进入周复盘</Link></section>

    {!courseId ? <section className="progress-sequence course-overview-section"><div className="sequence-heading"><h2>全部课程总览</h2><p>每一行只使用该课程自己的任务、事件和测验分母；选择课程后查看详细证据。</p></div>{courseOverview.length ? <div className="progress-course-table" role="table" aria-label="全部课程学习进展"><div className="progress-course-table-head" role="row"><span role="columnheader">课程</span><span role="columnheader">完成率</span><span role="columnheader">学习时长</span><span role="columnheader">最新测验</span><span role="columnheader">薄弱点</span><span role="columnheader">趋势</span></div>{courseOverview.map(({ course, current, trend }) => <button role="row" key={course.id} onClick={() => setCourseId(course.id)} aria-label={`查看${course.name}详细进展`}><span role="cell"><strong>{course.name}</strong><small>{course.stage} · {course.goalType || '目标待补充'}</small></span><span role="cell">{current.completionRate === null ? '暂无' : `${current.completed}/${current.weeklyTaskIds.size} · ${current.completionRate}%`}</span><span role="cell">{current.actualMinutes} 分钟</span><span role="cell">{current.accuracy === null ? '基线不足' : `${current.accuracy}%`}</span><span role="cell">{current.repeatedWeakPoints.length ? current.repeatedWeakPoints.join('、') : '未形成重复证据'}</span><span role="cell">{trend.state === 'trend' ? `${trend.points.length} 个时间点` : trend.state === 'current' ? '只有基线' : '基线不足'}</span></button>)}</div> : <InlineNotice tone="error">当前没有可用课程，请先到设置中恢复课程或重新规划。</InlineNotice>}</section> : <section className="progress-sequence course-trend-section"><div className="sequence-heading"><h2>{visibleCourses[0]?.name}的详细趋势</h2><p>不足两个真实时间点时只显示本周记录，不绘制假趋势。</p></div><div className="trend-course-list">{visibleCourses.map(course => <CourseTrendCard key={course.id} course={course} data={data} weekStart={weekStart} onRecord={openAssessment} />)}</div></section>}

    {courseId && progress.hasRecords ? <>
      <section className="review-summary" aria-label="本周真实指标"><article><span>完成任务</span><strong>{progress.completed}/{progress.weeklyTaskIds.size}</strong></article><article><span>实际学习</span><strong>{progress.actualMinutes} 分钟</strong></article><article><span>延期 / 跳过</span><strong>{progress.delayed} / {progress.skipped}</strong></article><article><span>客观测验</span><strong>{progress.accuracy === null ? '暂无' : `${progress.accuracy}%`}</strong></article><article><span>资源完成</span><strong>{progress.resourceCompleted}/{progress.resourceTotal}</strong></article></section>
      <section className="progress-sequence"><div className="sequence-heading"><h2>发现的问题</h2><p>结论只来自本周任务事件、测验和用户填写的原因。</p></div>{progress.signals.length ? <ul className="clean-list">{progress.signals.map(signal => <li key={signal}>{signal}</li>)}</ul> : <p>当前没有稳定异常信号，继续积累真实完成记录。</p>}{progress.repeatedWeakPoints.length > 0 && <div className="tag-list danger-tags">{progress.repeatedWeakPoints.map(point => <span key={point}>{point}</span>)}</div>}</section>
      <section className="progress-sequence"><div className="sequence-heading"><h2>原因证据</h2><p>延期和跳过原因不会被“已顺延到下周”覆盖。</p></div>{progress.causes.length ? <ul className="clean-list">{progress.causes.map(cause => <li key={cause}>{cause}</li>)}</ul> : <InlineNotice>尚无明确原因。下次跳过任务时请填写原因，周复盘会据此提出调整。</InlineNotice>}</section>
      <section className="progress-sequence action-sequence"><div className="sequence-heading"><h2>可执行调整</h2><p>周复盘回答“下周怎么改”，确认前不会修改未完成任务。</p></div><Link className="button primary" to="/weekly-review">查看下周调整</Link></section>
      <section className="progress-sequence"><div className="sequence-heading"><h2>调整后的验证</h2><p>只有相同课程、相近知识点、相近难度和评分方式的前后结果才能比较。</p></div><p>{comparable.length >= 2 ? `本周已有 ${comparable.length} 条真实测验记录；系统仍会逐项检查知识点、难度和评分方式是否一致。` : '仍需继续观察：当前没有足够的同条件测验证据。'}</p></section>
    </> : courseId ? <InlineNotice>当前周没有该课程的任务事件或测验记录。课程卡会保留最近六周的真实历史，不用空图表撑开页面。</InlineNotice> : <section className="review-summary" aria-label="全部课程本周汇总"><article><span>完成任务</span><strong>{progress.completed}/{progress.weeklyTaskIds.size}</strong></article><article><span>实际学习</span><strong>{progress.actualMinutes} 分钟</strong></article><article><span>延期 / 跳过</span><strong>{progress.delayed} / {progress.skipped}</strong></article><article><span>客观测验</span><strong>{progress.accuracy === null ? '基线不足' : `${progress.accuracy}%`}</strong></article><article><span>资源完成</span><strong>{progress.resourceCompleted}/{progress.resourceTotal}</strong></article></section>}

    {assessmentOpen && <Modal title="录入测验、考试或成果量表" description="记录来源、知识点、难度与量表，避免把自评误当作客观变化。" onClose={closeAssessment} footer={<><button className="button secondary" onClick={closeAssessment}>取消</button><button className="button primary" onClick={saveAssessment}>保存记录</button></>}><div className="form-grid two"><label className="field"><span>课程</span><select name="assessment-course" value={assessment.courseId} onChange={event => { const nextCourse = data.courses.find(course => course.id === event.target.value); setAssessment(current => ({ ...current, courseId: event.target.value, type: nextCourse?.assessmentMode === 'project' ? '作品检查' : current.type === '作品检查' ? '阶段小测' : current.type })) }}><option value="">请选择</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className="field"><span>记录类型</span><select name="assessment-type" value={assessment.type} onChange={event => setAssessment(current => ({ ...current, type: event.target.value as AssessmentEvent['type'] }))}><option>正式考试</option><option>模拟考试</option><option>阶段小测</option><option>自评</option><option>作品检查</option></select></label><label className="field"><span>{usesOutcomeRubric ? '成果量表得分' : '本次得分'}</span><input name="assessment-score" type="number" min="0" value={assessment.value} onChange={event => setAssessment(current => ({ ...current, value: Number(event.target.value) }))} /></label><label className="field"><span>{usesOutcomeRubric ? '成果量表满分' : '试题满分'}</span><input name="assessment-max" type="number" min="1" value={assessment.maxValue} onChange={event => setAssessment(current => ({ ...current, maxValue: Number(event.target.value) }))} /></label><label className="field"><span>知识点或成果维度</span><input name="assessment-point" value={assessment.knowledgePoint} onChange={event => setAssessment(current => ({ ...current, knowledgePoint: event.target.value }))} /></label><label className="field"><span>难度</span><select name="assessment-difficulty" value={assessment.difficulty} onChange={event => setAssessment(current => ({ ...current, difficulty: event.target.value as AssessmentEvent['difficulty'] }))}><option>基础</option><option>中等</option><option>进阶</option></select></label><label className="field full-span"><span>备注</span><textarea name="assessment-note" rows={3} value={assessment.note} onChange={event => setAssessment(current => ({ ...current, note: event.target.value }))} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
  </div>
}
