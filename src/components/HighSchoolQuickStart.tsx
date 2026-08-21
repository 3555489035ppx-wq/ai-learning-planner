import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { applyNormalizationToCourse } from '../courseCatalog.ts'
import { createCourse } from '../data.ts'
import { addDays, localDateISO, localTimestamp } from '../dateUtils.ts'
import { buildGlobalPlanDraft } from '../globalPlanner.ts'
import { useStore } from '../store.tsx'
import { Icon, InlineNotice, Logo } from '../components.tsx'
import type { Course, GoalType } from '../types.ts'

const subjects = [
  { id: 'high.chinese', name: '高中语文', max: 150, target: 120, difficulty: '现代文阅读证据定位和作文段落表达需要稳定练习。' },
  { id: 'high.math', name: '高中数学', max: 150, target: 105, difficulty: '函数基础、几何条件转化和错题复盘需要优先处理。' },
  { id: 'high.english', name: '高中英语', max: 150, target: 128, difficulty: '阅读定位效率和写作表达可以继续提升。' },
  { id: 'high.politics', name: '高中思想政治', max: 100, target: 82, difficulty: '知识框架与材料题规范表达需要整理。' },
  { id: 'high.physics', name: '高中物理', max: 100, target: 78, difficulty: '概念理解和基础模型训练需要优先处理。' },
  { id: 'high.chemistry', name: '高中化学', max: 100, target: 88, difficulty: '反应原理连接和实验现象分析需要练习。' },
]

const goalToType: Record<string, GoalType> = { 提升成绩: '拔高', 巩固基础: '巩固', 考试冲刺: '拔高' }

export function HighSchoolQuickStart({ onUseDetailed }: { onUseDetailed: () => void }) {
  const { data, updateData, notify } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [grade, setGrade] = useState('')
  const [goal, setGoal] = useState('')
  const [scores, setScores] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const allScoresReady = useMemo(() => subjects.every(subject => {
    const value = Number(scores[subject.id])
    return scores[subject.id] !== undefined && Number.isFinite(value) && value >= 0 && value <= subject.max
  }), [scores])

  const continueTo = (next: number) => { setError(''); setStep(next) }
  const generate = () => {
    if (!allScoresReady || !grade || !goal || loading) return
    setLoading(true)
    try {
      const start = localDateISO()
      const courses = subjects.map(subject => {
        const score = Number(scores[subject.id])
        const targetScore = Math.min(subject.max, Math.max(score + 8, subject.target))
        return applyNormalizationToCourse(createCourse({
          id: crypto.randomUUID(), name: subject.name, stage: '高中', courseType: '学科课程', assessmentMode: 'score',
          score, maxScore: subject.max, passScore: Math.round(subject.max * .6), examType: '期末考试',
          mastery: score / subject.max < .7 ? '基础薄弱' : '一般', mainDifficulty: subject.difficulty,
          selfEvidence: '来自首次快速录入，尚未补充错题或诊断测验。', goalType: goalToType[goal], targetScore,
          targetDate: addDays(start, 29), priority: subject.id === 'high.math' || subject.id === 'high.physics', priorityWeight: subject.id === 'high.math' ? 3 : subject.id === 'high.physics' ? 2 : 1,
          desiredResult: `${goal}：在 30 天内完成与当前分数匹配的基础训练和复盘。`,
          curriculum: { ...createCourse().curriculum, stage: '高中', grade, province: '全国通用', examRegion: '全国通用', semester: '上学期', textbookVersion: '待补充', syllabusTitle: `${subject.name}假期学习`, source: 'unknown' },
        }), subject.id)
      })
      const prepared = { ...data, onboardingCompleted: true, onboardingStep: 3, courses, schedule: { ...data.schedule, holidayStart: start, holidayEnd: addDays(start, 29), weekdayMinutes: 150, weekendMinutes: 150, maxAutoTasksPerDay: 3 }, planChanges: [`${localTimestamp()} 已通过高中快速录入生成课程基线。`] }
      const draft = buildGlobalPlanDraft(prepared)
      updateData(() => ({ ...prepared, planningBases: { ...prepared.planningBases, ...draft.planningBases }, globalPlanDraft: draft, globalPlanHistory: [draft] }))
      notify('六门课程已创建。先查看诊断，再确认 30 天计划。')
      navigate('/diagnosis')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '快速规划生成失败，请重试。')
      setLoading(false)
    }
  }

  return <div className="quick-start-page"><header className="onboarding-nav"><Logo /><button className="text-button" type="button" onClick={onUseDetailed}>使用详细录入</button></header><main className="quick-start-content" id="main-content"><div className="quick-start-intro"><span className="eyebrow">首次规划 · 4 步</span><h1 data-page-title tabIndex={-1}>先用成绩，得到第一版学习顺序。</h1><p>只需选择年级、目标并填写六科分数；其他时间与课程细节可在生成后继续调整。</p></div><ol className="quick-stepper" aria-label="快速规划进度">{['身份', '阶段', '目标', '成绩'].map((label, index) => <li className={step === index + 1 ? 'current' : step > index + 1 ? 'completed' : ''} key={label}><span>{index + 1}</span>{label}</li>)}</ol>{error && <InlineNotice tone="error">{error}</InlineNotice>}
    {step === 1 && <section className="quick-start-panel"><span className="section-kicker">Step 1 · 选择身份</span><h2>你现在处于哪个学习阶段？</h2><div className="quick-choice-grid"><button className="selected" onClick={() => continueTo(2)}><strong>高中生</strong><span>根据六门基础学科和分数生成第一版计划。</span></button><button onClick={onUseDetailed}><strong>大学生</strong><span>进入详细录入，按专业课程、技能或考试目标规划。</span></button></div></section>}
    {step === 2 && <section className="quick-start-panel"><span className="section-kicker">Step 2 · 选择阶段</span><h2>你目前在哪个年级？</h2><div className="quick-choice-grid three">{['高一', '高二', '高三'].map(item => <button className={grade === item ? 'selected' : ''} onClick={() => { setGrade(item); continueTo(3) }} key={item}><strong>{item}</strong></button>)}</div><button className="text-button" onClick={() => continueTo(1)}>返回上一步</button></section>}
    {step === 3 && <section className="quick-start-panel"><span className="section-kicker">Step 3 · 选择目标</span><h2>这个假期最希望达成什么？</h2><div className="quick-choice-grid three">{['提升成绩', '巩固基础', '考试冲刺'].map(item => <button className={goal === item ? 'selected' : ''} onClick={() => { setGoal(item); continueTo(4) }} key={item}><strong>{item}</strong></button>)}</div><button className="text-button" onClick={() => continueTo(2)}>返回上一步</button></section>}
    {step === 4 && <section className="quick-start-panel"><span className="section-kicker">Step 4 · 填写成绩</span><h2>只填写最近一次分数。</h2><p>系统会根据分数差异安排课程频率；满分已按高中常见试卷设置。</p><div className="quick-score-grid">{subjects.map(subject => <label className="field" key={subject.id}><span>{subject.name.replace('高中', '')} <small>/ {subject.max}</small></span><input aria-label={`${subject.name}分数`} inputMode="numeric" type="number" min="0" max={subject.max} value={scores[subject.id] ?? ''} onChange={event => setScores(current => ({ ...current, [subject.id]: event.target.value }))} /></label>)}</div><div className="quick-start-actions"><button className="button secondary" onClick={() => continueTo(3)}>返回上一步</button><button className="button primary" onClick={generate} disabled={!allScoresReady || loading}>{loading ? '正在生成…' : '查看学习诊断'} <Icon name="arrow" /></button></div>{!allScoresReady && <small className="validation-hint">请填写 6 门课程的有效分数（0 到对应满分）。</small>}</section>}
    <p className="quick-start-note">不想使用快速方式？可以 <Link to="/">返回首页</Link> 或切换到详细录入。所有结果先以本地规则生成，之后可手动调整。</p></main></div>
}
