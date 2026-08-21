import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { applyNormalizationToCourse } from '../courseCatalog.ts'
import { createConstraint, createCourse, reconcileCourseStage } from '../data.ts'
import { getCourseIntelligence } from '../courseIntelligence.ts'
import { localTimestamp } from '../dateUtils.ts'
import { buildGlobalPlanDraft } from '../globalPlanner.ts'
import { courseFieldErrors, goalFieldErrors } from '../providers.ts'
import { useStore } from '../store.tsx'
import { Icon, InlineNotice, Logo, Modal } from '../components.tsx'
import { OnboardingCourseForm } from '../components/OnboardingCourseForm.tsx'
import { HighSchoolQuickStart } from '../components/HighSchoolQuickStart.tsx'
import { slotsForTemplate, templateLabel } from '../timetable.ts'
import type { Course, ScheduleConstraint, ScheduleTemplate, TimeSlot } from '../types.ts'
import { goalTypes } from '../goalTypes.ts'

const dateValue = (value: string) => value.trim().replace(/\//g, '-').slice(0, 10)
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const focusFirstError = () => requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus())

export default function PlanningSetup() {
  const { data, updateData, notify } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(() => Math.min(3, Math.max(1, data.onboardingStep || 1)))
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleteId, setDeleteId] = useState('')
  const [constraintOpen, setConstraintOpen] = useState(false)
  const [constraintError, setConstraintError] = useState('')
  const [constraintDraft, setConstraintDraft] = useState({ type: 'travel' as ScheduleConstraint['type'], startAt: '', endAt: '', capacityMinutes: 0, note: '' })
  const [quickStartOpen, setQuickStartOpen] = useState(() => !new URLSearchParams(location.search).has('mode') && !data.onboardingCompleted && data.courses.length === 0)
  const requestId = useRef(0)
  const activeCourses = data.courses.filter(course => !course.archivedAt)

  const updateCourse = (id: string, patch: Partial<Course>) => updateData(current => ({
    ...current,
    courses: current.courses.map(course => {
      if (course.id !== id) return course
      let next = { ...course, ...patch }
      if ('stage' in patch) {
        const reconciled = reconcileCourseStage(next, patch.stage ?? '')
        next = { ...reconciled.course, curriculum: { ...next.curriculum, stage: patch.stage ?? '' } }
      }
      if ('name' in patch) {
        next = applyNormalizationToCourse({ ...next, canonicalId: '', ambiguityResolved: false }, '')
        const intelligence = getCourseIntelligence(next, current.schedule)
        next = { ...next, goalSuggestions: intelligence.suggestedGoals, suggestionSource: next.name }
        if (!next.desiredResultEdited) next.desiredResult = intelligence.suggestedGoals[0] ?? ''
      }
      return next
    }),
  }))

  const updateCurriculum = (id: string, patch: Partial<Course['curriculum']>) => updateData(current => ({ ...current, courses: current.courses.map(course => course.id === id ? { ...course, curriculum: { ...course.curriculum, ...patch } } : course) }))

  const resolveCourse = (id: string, canonicalId: string) => updateData(current => ({ ...current, courses: current.courses.map(course => course.id === id ? applyNormalizationToCourse(course, canonicalId) : course) }))

  const addCourse = () => {
    const course = createCourse()
    updateData(current => ({ ...current, courses: [...current.courses, course] }))
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-course-id="${course.id}"] input`)?.focus())
  }

  const validateStep = () => {
    if (step === 1) {
      if (!activeCourses.length) return '请至少添加一门课程。'
      const invalid = activeCourses.find(course => Object.keys(courseFieldErrors(course)).length)
      return invalid ? `请补全“${invalid.name || '未命名课程'}”的课程事实。` : ''
    }
    if (step === 2) {
      const invalid = activeCourses.find(course => Object.keys(goalFieldErrors(course)).length)
      return invalid ? `请补全“${invalid.name}”的目标。` : ''
    }
    if (!data.schedule.holidayStart || !data.schedule.holidayEnd) return '请选择假期开始和结束日期。'
    if (data.schedule.holidayEnd < data.schedule.holidayStart) return '假期结束日期不能早于开始日期。'
    if (data.schedule.weekdayMinutes < 0 || data.schedule.weekendMinutes < 0) return '每日可用时间不能小于 0。'
    if (!data.schedule.timeSlots.some(slot => slot.enabled)) return '请至少保留一个可用课表节次。'
    return ''
  }

  const next = () => {
    setShowErrors(true)
    const message = validateStep()
    if (message) { setError(message); focusFirstError(); return }
    const value = Math.min(3, step + 1)
    setStep(value); setShowErrors(false); setError('')
    updateData(current => ({ ...current, onboardingStep: value }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const back = () => {
    const value = Math.max(1, step - 1)
    setStep(value); setShowErrors(false); setError('')
    updateData(current => ({ ...current, onboardingStep: value }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const generatePlan = async () => {
    setShowErrors(true)
    const message = validateStep()
    if (message) { setError(message); focusFirstError(); return }
    const currentRequest = ++requestId.current
    setLoading(true); setError('')
    try {
      await Promise.resolve()
      if (requestId.current !== currentRequest) return
      const draft = buildGlobalPlanDraft(data)
      const prepared = { ...data, onboardingCompleted: true, onboardingStep: 3, planningBases: { ...data.planningBases, ...draft.planningBases }, globalPlanDraft: draft, globalPlanHistory: [...data.globalPlanHistory.filter(item => item.id !== draft.id), draft], planChanges: [`${localTimestamp()} 已根据成绩或自评基线生成全部课程计划草案。`, ...data.planChanges] }
      updateData(() => prepared)
      notify(draft.validation.valid ? '全部课程计划草案已生成并通过校验，请确认后启用。' : '计划草案需要调整，请查看具体修复项。', 'info')
      navigate('/plan')
    } catch (reason) {
      if (requestId.current === currentRequest) setError(reason instanceof Error ? reason.message : '计划生成失败，请重试。')
    } finally {
      if (requestId.current === currentRequest) setLoading(false)
    }
  }

  const addConstraint = () => {
    setConstraintError('')
    if (!constraintDraft.startAt || !constraintDraft.endAt || constraintDraft.endAt < constraintDraft.startAt) return setConstraintError('请选择有效的开始和结束时间。')
    const nextConstraint = createConstraint({ ...constraintDraft, startAt: `${constraintDraft.startAt}:00+08:00`, endAt: `${constraintDraft.endAt}:00+08:00` })
    updateData(current => ({ ...current, schedule: { ...current.schedule, constraints: [...current.schedule.constraints, nextConstraint] } }))
    setConstraintDraft({ type: 'travel', startAt: '', endAt: '', capacityMinutes: 0, note: '' }); setConstraintOpen(false)
    notify('现实安排已加入排程约束。')
  }

  const updateSlot = (id: string, patch: Partial<TimeSlot>) => updateData(current => ({ ...current, schedule: { ...current.schedule, timeSlots: current.schedule.timeSlots.map(slot => slot.id === id ? { ...slot, ...patch } : slot) } }))
  const applyTemplate = (template: Exclude<ScheduleTemplate, 'custom'>) => updateData(current => ({ ...current, schedule: { ...current.schedule, template, timeSlots: slotsForTemplate(template), useDefaultTimetable: true } }))
  const enableCustomSchedule = () => updateData(current => ({ ...current, schedule: { ...current.schedule, template: 'custom', useDefaultTimetable: false } }))

  const intro = step === 1
      ? ['第一步 · 学习背景与课程', '先说明你在学什么。', '课程名称只是起点；教材、目录和评估方式决定计划边界与诊断范围。']
    : step === 2
      ? ['第二步 · 当前水平与目标', '把想达到的结果说具体。', '目标会随课程变化，手动修改后不会被系统建议覆盖。']
      : ['第三步 · 假期与现实安排', '把真正可用的时间留进计划。', '提交后会先按现有成绩或自评生成基线计划；精细诊断不是前置门槛。']

  if (quickStartOpen) return <HighSchoolQuickStart onUseDetailed={() => { setQuickStartOpen(false); navigate('/onboarding?mode=detailed', { replace: true }) }} />

  return <div className="onboarding-page">
    <header className="onboarding-nav"><Logo /><div><span>第 {step} / 3 步</span><span className="progress-track" role="progressbar" aria-label="规划进度" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}><i style={{ width: `${step / 3 * 100}%` }} /></span></div></header>
    <main className="onboarding-content" id="main-content">
      <section className="onboarding-intro"><span className="eyebrow">{intro[0]}</span><h1 data-page-title tabIndex={-1}>{intro[1]}</h1><p>{intro[2]}</p>{!activeCourses.length && <button className="text-button" type="button" onClick={() => { setQuickStartOpen(true); navigate('/onboarding', { replace: true }) }}>切换到高中 4 步快速录入</button>}</section>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}

      {step === 1 && <section className="course-editor-list" aria-label="课程列表">
        {activeCourses.map((course, index) => <OnboardingCourseForm key={course.id} course={course} collapsible={index > 0} errors={courseFieldErrors(course)} showErrors={showErrors} onUpdate={patch => updateCourse(course.id, patch)} onCurriculum={patch => updateCurriculum(course.id, patch)} onResolve={canonicalId => resolveCourse(course.id, canonicalId)} onDelete={() => setDeleteId(course.id)} onArchive={() => { updateData(current => ({ ...current, courses: current.courses.map(item => item.id === course.id ? { ...item, archivedAt: localTimestamp(), priority: false } : item) })); notify('课程已归档，历史诊断、计划和事件保持不变。') }} />)}
        <button type="button" className="add-section-button" onClick={addCourse}><Icon name="plus" /> 添加课程</button>
        {!activeCourses.length && <p className="validation-hint" role="status">请至少添加一门需要关注的课程。</p>}
      </section>}

      {step === 2 && <section className="course-editor-list" aria-label="课程目标">
        {activeCourses.map(course => {
          const errors = goalFieldErrors(course)
          const show = (field: string) => showErrors ? errors[field] : ''
          return <article className="form-section" key={course.id}><header><div><span className="section-kicker">{course.canonicalName || course.name}</span><h2>目标与完成结果</h2></div>{course.priority && <span className="status-pill">优先处理</span>}</header>
            <div className="option-group"><span>当前目标</span><div>{goalTypes.map(goal => <button type="button" key={goal} aria-pressed={course.goalType === goal} className={course.goalType === goal ? 'selected' : ''} onClick={() => updateCourse(course.id, { goalType: goal })}>{goal}</button>)}</div>{show('goalType') && <small className="field-error">{show('goalType')}</small>}</div>
            <div className="form-grid two goal-fields">
              {course.assessmentMode === 'score' && <label className={`field ${show('targetScore') ? 'has-error' : ''}`}><span>目标分数（满分 {course.maxScore}）</span><input name={`course-${course.id}-target-score`} type="number" min="0" max={course.maxScore || undefined} value={course.targetScore} aria-invalid={Boolean(show('targetScore'))} onChange={event => updateCourse(course.id, { targetScore: event.target.value === '' ? '' : Number(event.target.value) })} />{show('targetScore') && <small className="field-error">{show('targetScore')}</small>}</label>}
              <label className={`field ${show('targetDate') ? 'has-error' : ''}`}><span>目标日期或考试日期</span><input name={`course-${course.id}-target-date`} type="date" value={course.targetDate} aria-invalid={Boolean(show('targetDate'))} onInput={event => updateCourse(course.id, { targetDate: dateValue(event.currentTarget.value) })} onChange={event => updateCourse(course.id, { targetDate: dateValue(event.target.value) })} />{show('targetDate') && <small className="field-error">{show('targetDate')}</small>}</label>
              <label className="priority-check"><input name={`course-${course.id}-priority`} type="checkbox" checked={course.priority} onChange={event => updateData(current => ({ ...current, courses: current.courses.map(item => item.id === course.id ? { ...item, priority: event.target.checked, priorityWeight: event.target.checked ? Math.max(2, item.priorityWeight) : 1 } : event.target.checked ? { ...item, priority: false } : item) }))} />希望优先处理这门课程</label>
              <label className={`field full-span ${show('desiredResult') ? 'has-error' : ''}`}><span>希望达到的学习结果</span><textarea name={`course-${course.id}-result`} rows={3} value={course.desiredResult} aria-invalid={Boolean(show('desiredResult'))} onChange={event => updateCourse(course.id, { desiredResult: event.target.value, desiredResultEdited: true })} />{show('desiredResult') && <small className="field-error">{show('desiredResult')}</small>}</label>
            </div>
            {course.goalSuggestions.length > 0 && <div className="goal-suggestions"><span>课程相关建议</span>{course.goalSuggestions.slice(0, 3).map(suggestion => <button type="button" key={suggestion} onClick={() => updateCourse(course.id, { desiredResult: suggestion, desiredResultEdited: false })}>{suggestion}</button>)}</div>}
          </article>
        })}
      </section>}

      {step === 3 && <section className="schedule-layout">
        <article className="form-section"><header><div><span className="section-kicker">假期边界</span><h2>日期与每日容量</h2></div></header><div className="form-grid two">
          <label className="field"><span>假期开始</span><input name="holiday-start" type="date" value={data.schedule.holidayStart} onInput={event => { const value = dateValue(event.currentTarget.value); updateData(current => ({ ...current, schedule: { ...current.schedule, holidayStart: value } })) }} onChange={event => { const value = dateValue(event.target.value); updateData(current => ({ ...current, schedule: { ...current.schedule, holidayStart: value } })) }} /></label>
          <label className="field"><span>假期结束</span><input name="holiday-end" type="date" value={data.schedule.holidayEnd} onInput={event => { const value = dateValue(event.currentTarget.value); updateData(current => ({ ...current, schedule: { ...current.schedule, holidayEnd: value } })) }} onChange={event => { const value = dateValue(event.target.value); updateData(current => ({ ...current, schedule: { ...current.schedule, holidayEnd: value } })) }} /></label>
          <label className="field"><span>工作日每日可用时间（分钟）</span><input name="weekday-minutes" type="number" min="0" max="720" value={data.schedule.weekdayMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, weekdayMinutes: Math.max(0, Number(event.target.value)) } }))} /></label>
          <label className="field"><span>周末每日可用时间（分钟）</span><input name="weekend-minutes" type="number" min="0" max="720" value={data.schedule.weekendMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, weekendMinutes: Math.max(0, Number(event.target.value)) } }))} /></label>
          <label className="field"><span>单次最长专注时间（分钟）</span><input name="max-focus" type="number" min="15" max="180" value={data.schedule.maxFocusMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, maxFocusMinutes: Math.max(15, Number(event.target.value)) } }))} /></label>
          <label className="field"><span>最容易中断学习的原因</span><input name="interruption-reason" value={data.schedule.interruptionReason} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, interruptionReason: event.target.value } }))} placeholder="例如：临时出门、手机消息" /></label>
        </div><div className="option-group"><span>偏好学习时段</span><div>{['上午', '下午', '晚上'].map(value => <button type="button" key={value} aria-pressed={data.schedule.preferredTimes.includes(value)} className={data.schedule.preferredTimes.includes(value) ? 'selected' : ''} onClick={() => updateData(current => ({ ...current, schedule: { ...current.schedule, preferredTimes: current.schedule.preferredTimes.includes(value) ? current.schedule.preferredTimes.filter(item => item !== value) : [...current.schedule.preferredTimes, value] } }))}>{value}</button>)}</div></div><div className="option-group"><span>每周休息日</span><div>{weekDays.map(value => <button type="button" key={value} aria-pressed={data.schedule.restDays.includes(value)} className={data.schedule.restDays.includes(value) ? 'selected' : ''} onClick={() => updateData(current => ({ ...current, schedule: { ...current.schedule, restDays: current.schedule.restDays.includes(value) ? current.schedule.restDays.filter(item => item !== value) : [...current.schedule.restDays, value] } }))}>{value}</button>)}</div></div></article>

        <article className="form-section"><header><div><span className="section-kicker">学习时间表</span><h2>选择能长期执行的节次</h2></div><span className="status-pill">{templateLabel(data.schedule.template)}</span></header><p className="section-help">课表是可用时间的边界，不是每天都要填满的承诺。切换模板会更新可用节次；自定义会保留你手动填写的时间。</p><div className="option-group"><span>课表模板</span><div>{(['light', 'standard', 'sprint'] as const).map(template => <button type="button" key={template} aria-pressed={data.schedule.template === template} className={data.schedule.template === template ? 'selected' : ''} onClick={() => applyTemplate(template)}>{templateLabel(template)}</button>)}<button type="button" aria-pressed={data.schedule.template === 'custom'} className={data.schedule.template === 'custom' ? 'selected' : ''} onClick={enableCustomSchedule}>自定义</button></div></div><div className="slot-editor-list">{data.schedule.timeSlots.map(slot => <div className="slot-editor" key={slot.id}><label className="slot-enabled"><input type="checkbox" checked={slot.enabled} onChange={event => { enableCustomSchedule(); updateSlot(slot.id, { enabled: event.target.checked }) }} /><span>{slot.label}</span></label><label className="visually-hidden" htmlFor={`${slot.id}-start`}>开始时间</label><input id={`${slot.id}-start`} type="time" value={slot.start} onChange={event => { enableCustomSchedule(); updateSlot(slot.id, { start: event.target.value }) }} /><span>—</span><label className="visually-hidden" htmlFor={`${slot.id}-end`}>结束时间</label><input id={`${slot.id}-end`} type="time" value={slot.end} onChange={event => { enableCustomSchedule(); updateSlot(slot.id, { end: event.target.value }) }} /></div>)}</div></article>

        <article className="form-section"><header><div><span className="section-kicker">现实约束</span><h2>旅行、兼职、补课和固定安排</h2></div><button type="button" className="button secondary" onClick={() => setConstraintOpen(true)}><Icon name="plus" /> 添加安排</button></header>{data.schedule.constraints.length ? <div className="constraint-list">{data.schedule.constraints.map(item => <article key={item.id}><div><strong>{item.note || ({ travel: '旅行', class: '补课', part_time: '兼职', rest: '休息', custom: '固定安排' }[item.type])}</strong><span>{item.startAt.slice(0, 16).replace('T', ' ')} — {item.endAt.slice(0, 16).replace('T', ' ')}</span><small>期间每日最多 {item.capacityMinutes} 分钟</small></div><button type="button" className="danger-text" onClick={() => updateData(current => ({ ...current, schedule: { ...current.schedule, constraints: current.schedule.constraints.filter(constraint => constraint.id !== item.id) } }))}>移除</button></article>)}</div> : <InlineNotice>还没有固定安排。没有旅行或兼职时可以直接继续。</InlineNotice>}</article>
      </section>}

      <footer className="onboarding-actions"><div>{step === 1 ? <Link className="text-link" to="/">返回首页</Link> : <button type="button" className="text-button" onClick={back}>返回上一步</button>}</div><div><span>{activeCourses.length ? `已添加 ${activeCourses.length} 门课程，补全后才能继续` : '请先添加课程'}</span>{step < 3 ? <button type="button" className="button primary" onClick={next} disabled={!activeCourses.length}>保存并继续 <Icon name="arrow" /></button> : <button type="button" className="button primary" onClick={generatePlan} disabled={loading || !activeCourses.length}>{loading ? '正在生成并校验计划…' : '生成全部课程计划'} <Icon name="arrow" /></button>}</div></footer>
    </main>

    {deleteId && <Modal title="移除课程？" description="相关诊断和未完成任务也会一并移除。" onClose={() => setDeleteId('')} footer={<><button type="button" className="button secondary" onClick={() => setDeleteId('')}>取消</button><button type="button" className="button danger" onClick={() => { updateData(current => ({ ...current, courses: current.courses.filter(course => course.id !== deleteId), tasks: current.tasks.filter(task => task.courseId !== deleteId), plans: current.plans.filter(plan => plan.courseId !== deleteId), diagnoses: Object.fromEntries(Object.entries(current.diagnoses).filter(([id]) => id !== deleteId)) })); setDeleteId(''); notify('课程已移除。') }}>移除</button></>}><p>确定移除「{data.courses.find(course => course.id === deleteId)?.name || '这门课程'}」吗？</p></Modal>}
    {constraintOpen && <Modal title="添加现实安排" description="排程器会在这段时间内限制每日容量。" onClose={() => setConstraintOpen(false)} footer={<><button type="button" className="button secondary" onClick={() => setConstraintOpen(false)}>取消</button><button type="button" className="button primary" onClick={addConstraint}>加入安排</button></>}><div className="form-grid two"><label className="field"><span>类型</span><select value={constraintDraft.type} onChange={event => setConstraintDraft(current => ({ ...current, type: event.target.value as ScheduleConstraint['type'] }))}><option value="travel">旅行</option><option value="part_time">兼职</option><option value="class">补课</option><option value="rest">休息</option><option value="custom">固定安排</option></select></label><label className="field"><span>说明</span><input value={constraintDraft.note} onChange={event => setConstraintDraft(current => ({ ...current, note: event.target.value }))} /></label><label className="field"><span>开始</span><input type="datetime-local" value={constraintDraft.startAt} onChange={event => setConstraintDraft(current => ({ ...current, startAt: event.target.value }))} /></label><label className="field"><span>结束</span><input type="datetime-local" value={constraintDraft.endAt} onChange={event => setConstraintDraft(current => ({ ...current, endAt: event.target.value }))} /></label><label className="field"><span>期间每日最多学习（分钟）</span><input type="number" min="0" max="720" value={constraintDraft.capacityMinutes} onChange={event => setConstraintDraft(current => ({ ...current, capacityMinutes: Math.max(0, Number(event.target.value)) }))} /></label></div>{constraintError && <InlineNotice tone="error">{constraintError}</InlineNotice>}</Modal>}
  </div>
}
