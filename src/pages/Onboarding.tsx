import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, InlineNotice, Logo, Modal } from '../components.tsx'
import { createCourse } from '../data.ts'
import { buildSixWeekPlan, mockPlanningProvider, validateCourse, validateGoal } from '../providers.ts'
import { useStore } from '../store.tsx'
import type { Course, CourseType, EducationStage, ExamType, GoalType, MasteryLevel, ScheduleProfile } from '../types.ts'

const stages: EducationStage[] = ['高中', '大学', '其他']
const courseTypes: CourseType[] = ['必修课', '选修课', '语言考试', '专业考试', '技能课程']
const examTypes: ExamType[] = ['期末考试', '补考', '模拟考试', '资格考试', '自测']
const masteryLevels: MasteryLevel[] = ['几乎不会', '基础薄弱', '一般', '较熟练', '熟练']
const goalTypes: GoalType[] = ['补弱', '补考', '四六级', '考研', '考证', '技能提升']
const preferredTimes = ['上午', '下午', '晚上']
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

const numberFromInput = (value: string) => value === '' ? '' : Number(value)

export default function Onboarding() {
  const { data, updateData, notify } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleteId, setDeleteId] = useState('')

  const updateCourse = (id: string, patch: Partial<Course>) => updateData(current => ({ ...current, courses: current.courses.map(course => course.id === id ? { ...course, ...patch } : course) }))
  const updateSchedule = (patch: Partial<ScheduleProfile>) => updateData(current => ({ ...current, schedule: { ...current.schedule, ...patch } }))
  const currentErrors = useMemo(() => data.courses.flatMap(course => step === 1 ? validateCourse(course) : validateGoal(course)), [data.courses, step])

  const next = async () => {
    if (loading) return
    setError('')
    if (!data.courses.length) return setError('请至少添加一门需要关注的课程。')
    if (step === 1) {
      const invalid = data.courses.map(course => ({ name: course.name || '未命名课程', fields: validateCourse(course) })).filter(item => item.fields.length)
      if (invalid.length) return setError(`${invalid[0].name}还需要补充：${invalid[0].fields.join('、')}。`)
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (step === 2) {
      const invalid = data.courses.map(course => ({ name: course.name, fields: validateGoal(course) })).filter(item => item.fields.length)
      if (invalid.length) return setError(`${invalid[0].name}还需要补充：${invalid[0].fields.join('、')}。`)
      if (!data.courses.some(course => course.priority)) return setError('请选择一个希望优先处理的目标。')
      setStep(3)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const schedule = data.schedule
    if (!schedule.holidayStart || !schedule.holidayEnd) return setError('请填写完整的假期开始和结束日期。')
    if (schedule.holidayEnd < schedule.holidayStart) return setError('假期结束日期不能早于开始日期。')
    if (!schedule.preferredTimes.length) return setError('请至少选择一个偏好的学习时段。')
    if (!schedule.restDays.length) return setError('请至少选择一个每周休息日。')
    if (!schedule.interruptionReason.trim()) return setError('请填写最容易中断学习的原因。')
    setLoading(true)
    try {
      const result = await mockPlanningProvider.generateDiagnosis(data)
      const tasks = buildSixWeekPlan(data, result.data)
      updateData(current => ({ ...current, onboardingCompleted: true, diagnosis: result.data, tasks, planChanges: ['首次六周计划已根据完整学习概况生成。', ...current.planChanges] }))
      notify('学习概况已保存，诊断已生成。')
      navigate('/diagnosis')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成诊断失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  const removeCourse = () => {
    updateData(current => ({ ...current, courses: current.courses.filter(course => course.id !== deleteId) }))
    setDeleteId('')
    notify('课程已移除。')
  }

  return <div className="onboarding-page"><header className="onboarding-nav"><Logo /><div><span>第 {step} / 3 步</span><div className="progress-track"><i style={{ width: `${step * 33.333}%` }} /></div></div></header><main className="onboarding-content"><header className="onboarding-intro"><span className="eyebrow">{step === 1 ? '第一步 · 学习概况' : step === 2 ? '第二步 · 目标' : '第三步 · 现实安排'}</span><h1>{step === 1 ? '建立可信的课程信息。' : step === 2 ? '确定你真正想达到的结果。' : '让计划服从真实生活。'}</h1><p>{step === 1 ? '成绩需要结合满分、阶段、考试类型和自评理解；缺少关键信息时不会生成诊断。' : step === 2 ? '目标分数只是边界，我们还需要日期、优先级和你对结果的具体描述。' : '旅行、兼职、休息日和专注上限都会影响任务密度。所有信息会自动保存。'}</p></header>

    {step === 1 && <div className="course-editor-list">{data.courses.length === 0 && <div className="empty-state compact"><h2>还没有课程</h2><p>添加一门需要补弱或提升的课程后再继续。</p></div>}{data.courses.map((course, index) => <section className="form-section" key={course.id}><header><div><span className="item-index">课程 {String(index + 1).padStart(2, '0')}</span><h2>{course.name || '未命名课程'}</h2></div><button className="danger-text" onClick={() => setDeleteId(course.id)} aria-label={`删除课程 ${course.name || index + 1}`}><Icon name="trash" /> 删除</button></header><div className="form-grid three"><Field label="课程名称"><input value={course.name} onChange={event => updateCourse(course.id, { name: event.target.value })} placeholder="例如：高等数学" /></Field><Field label="教育阶段"><select value={course.stage} onChange={event => updateCourse(course.id, { stage: event.target.value as EducationStage })}><option value="">请选择</option>{stages.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="课程类型"><select value={course.courseType} onChange={event => updateCourse(course.id, { courseType: event.target.value as CourseType })}><option value="">请选择</option>{courseTypes.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="本次得分"><input type="number" min="0" max={course.maxScore || 1000} value={course.score} onChange={event => updateCourse(course.id, { score: numberFromInput(event.target.value) })} /></Field><Field label="试卷满分"><input type="number" min="1" max="1000" value={course.maxScore} onChange={event => updateCourse(course.id, { maxScore: numberFromInput(event.target.value) })} /></Field><Field label="及格线"><input type="number" min="0" max={course.maxScore || 1000} value={course.passScore} onChange={event => updateCourse(course.id, { passScore: numberFromInput(event.target.value) })} /></Field><Field label="考试类型"><select value={course.examType} onChange={event => updateCourse(course.id, { examType: event.target.value as ExamType })}><option value="">请选择</option>{examTypes.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="自评掌握程度"><select value={course.mastery} onChange={event => updateCourse(course.id, { mastery: event.target.value as MasteryLevel })}><option value="">请选择</option>{masteryLevels.map(value => <option key={value}>{value}</option>)}</select></Field><label className="check-field"><input type="checkbox" checked={course.incomplete} onChange={event => updateCourse(course.id, { incomplete: event.target.checked })} /><span><strong>缺考或未完成试卷</strong><small>勾选后诊断会降低对分数的依赖。</small></span></label></div>{validateCourse(course).length > 0 && <p className="validation-hint">待补充：{validateCourse(course).join('、')}</p>}</section>)}<button className="add-section-button" onClick={() => updateData(current => ({ ...current, courses: [...current.courses, createCourse()] }))}><Icon name="plus" /> 添加课程</button></div>}

    {step === 2 && <div className="course-editor-list">{data.courses.map(course => <section className="form-section" key={course.id}><header><div><span className="item-index">目标设置</span><h2>{course.name}</h2></div><label className="priority-check"><input type="radio" name="priority-course" checked={course.priority} onChange={() => updateData(current => ({ ...current, courses: current.courses.map(item => ({ ...item, priority: item.id === course.id })) }))} /> 优先处理</label></header><div className="form-grid two"><Field label="当前目标"><select value={course.goalType} onChange={event => updateCourse(course.id, { goalType: event.target.value as GoalType })}><option value="">请选择</option>{goalTypes.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="目标分数" hint={`试卷满分 ${course.maxScore}`}><input type="number" min="0" max={course.maxScore || 1000} value={course.targetScore} onChange={event => updateCourse(course.id, { targetScore: numberFromInput(event.target.value) })} /></Field><Field label="目标日期或考试日期"><input type="date" value={course.targetDate} onChange={event => updateCourse(course.id, { targetDate: event.target.value })} /></Field><Field label="希望达到的学习结果"><textarea rows={3} value={course.desiredResult} onChange={event => updateCourse(course.id, { desiredResult: event.target.value })} placeholder="例如：能独立完成极限和基础导数题" /></Field></div>{validateGoal(course).length > 0 && <p className="validation-hint">待补充：{validateGoal(course).join('、')}</p>}</section>)}</div>}

    {step === 3 && <div className="schedule-layout"><section className="form-section"><header><div><span className="item-index">假期边界</span><h2>可投入时间</h2></div></header><div className="form-grid two"><Field label="假期开始日期"><input type="date" value={data.schedule.holidayStart} onChange={event => updateSchedule({ holidayStart: event.target.value })} /></Field><Field label="假期结束日期"><input type="date" value={data.schedule.holidayEnd} onChange={event => updateSchedule({ holidayEnd: event.target.value })} /></Field><Field label="工作日每日可用时间（分钟）"><input type="number" min="0" max="720" value={data.schedule.weekdayMinutes} onChange={event => updateSchedule({ weekdayMinutes: Number(event.target.value) })} /></Field><Field label="周末每日可用时间（分钟）"><input type="number" min="0" max="720" value={data.schedule.weekendMinutes} onChange={event => updateSchedule({ weekendMinutes: Number(event.target.value) })} /></Field><Field label="单次最长专注时间（分钟）"><input type="number" min="15" max="180" value={data.schedule.maxFocusMinutes} onChange={event => updateSchedule({ maxFocusMinutes: Number(event.target.value) })} /></Field></div></section><section className="form-section"><header><div><span className="item-index">现实限制</span><h2>固定安排与中断</h2></div></header><div className="form-grid two"><Field label="旅行日期" hint="可填写多段，例如：7月22日—24日杭州"><input value={data.schedule.travelDates} onChange={event => updateSchedule({ travelDates: event.target.value })} placeholder="没有可留空" /></Field><Field label="兼职或固定安排"><input value={data.schedule.fixedCommitments} onChange={event => updateSchedule({ fixedCommitments: event.target.value })} placeholder="例如：周二、周四 18:00—21:00 兼职" /></Field><Field label="最容易中断学习的原因"><textarea rows={3} value={data.schedule.interruptionReason} onChange={event => updateSchedule({ interruptionReason: event.target.value })} placeholder="例如：临时出行、手机分心、任务过难" /></Field></div><div className="option-group"><span>偏好的学习时段</span><div>{preferredTimes.map(value => <button key={value} className={data.schedule.preferredTimes.includes(value) ? 'selected' : ''} onClick={() => updateSchedule({ preferredTimes: data.schedule.preferredTimes.includes(value) ? data.schedule.preferredTimes.filter(item => item !== value) : [...data.schedule.preferredTimes, value] })}>{value}</button>)}</div></div><div className="option-group"><span>每周休息日</span><div>{weekDays.map(value => <button key={value} className={data.schedule.restDays.includes(value) ? 'selected' : ''} onClick={() => updateSchedule({ restDays: data.schedule.restDays.includes(value) ? data.schedule.restDays.filter(item => item !== value) : [...data.schedule.restDays, value] })}>{value}</button>)}</div></div></section><InlineNotice>所有数据仅保存在当前浏览器中。正式接入账户与云同步前，请不要在此填写敏感个人信息。</InlineNotice></div>}

    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    <footer className="onboarding-actions">{step > 1 ? <button className="button secondary" onClick={() => { setError(''); setStep(step - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>上一步</button> : <Link className="button secondary" to="/">返回首页</Link>}<div><span>{currentErrors.length ? `当前还有 ${currentErrors.length} 项待补充` : '当前步骤信息完整'}</span><button className="button primary" onClick={next} disabled={loading}>{loading ? '正在生成诊断…' : step === 3 ? '生成课程诊断' : '保存并继续'} {!loading && <Icon name="arrow" />}</button></div></footer>
  </main>{deleteId && <Modal title="移除这门课程？" description="删除后，该课程目标与相关诊断不会保留。" onClose={() => setDeleteId('')} footer={<><button className="button secondary" onClick={() => setDeleteId('')}>取消</button><button className="button danger" onClick={removeCourse}>移除课程</button></>}><p>确定移除「{data.courses.find(course => course.id === deleteId)?.name || '未命名课程'}」吗？</p></Modal>}</div>
}
