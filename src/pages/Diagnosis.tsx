import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CourseSwitcher, EmptyState, Icon, InlineNotice, PageHeader } from '../components.tsx'
import { CourseManager } from '../components/CourseManager.tsx'
import { isHighSchoolDemo } from '../demoData.ts'
import { buildGlobalPlanDraft } from '../globalPlanner.ts'
import { completeDiagnosisAttempt, localPlanningProvider } from '../providers.ts'
import { useStore } from '../store.tsx'

const evidenceLabels = {
  objective_quiz: '客观测验',
  self_assessment: '能力自评',
  performance_task: '表现任务',
  exam_score: '考试成绩',
}

export default function Diagnosis() {
  const { data, updateData, notify } = useStore()
  const navigate = useNavigate()
  const priorityId = data.courses.find(course => course.priority)?.id || data.courses[0]?.id || ''
  const [selectedId, setSelectedId] = useState(priorityId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [expandedStage, setExpandedStage] = useState(0)
  const course = data.courses.find(item => item.id === selectedId) ?? data.courses[0]
  const diagnosis = course ? data.diagnoses[course.id] : undefined
  const demoMode = isHighSchoolDemo(data)
  const activePlan = useMemo(() => data.plans.find(plan => plan.courseId === course?.id && (plan.status === 'active' || plan.status === 'stale')), [course?.id, data.plans])

  const generate = async () => {
    if (!course || loading) return
    setLoading(true)
    setError('')
    setAnswers({})
    setExpandedStage(0)
    try {
      const result = await localPlanningProvider.generateDiagnosis(data, course.id)
      updateData(current => ({
        ...current,
        diagnoses: { ...current.diagnoses, [course.id]: result.data },
        diagnosisHistory: [
          ...current.diagnosisHistory.map(item => item.courseId === course.id && item.status !== 'superseded' ? { ...item, status: 'superseded' as const } : item),
          result.data,
        ],
      }))
      notify('已生成新的基础诊断题。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '诊断生成失败。')
    } finally {
      setLoading(false)
    }
  }

  const switchCourse = (id: string) => {
    setSelectedId(id)
    setAnswers({})
    setError('')
  }

  const submitDiagnosis = () => {
    if (!diagnosis || !course) return
    try {
      const completed = completeDiagnosisAttempt(data, diagnosis, answers)
      updateData(current => ({
        ...current,
        diagnoses: { ...current.diagnoses, [course.id]: completed.diagnosis },
        diagnosisHistory: current.diagnosisHistory.map(item => item.id === completed.diagnosis.id ? completed.diagnosis : item),
        quizEvents: [...current.quizEvents, ...completed.events],
        plans: current.plans.map(plan => plan.courseId === course.id && plan.status === 'active' ? { ...plan, status: 'stale' as const, staleReasons: [...plan.staleReasons, '课程诊断已更新。'] } : plan),
        planChanges: [`${course.name}完成第 ${completed.diagnosis.version} 版基础诊断。`, ...current.planChanges],
      }))
      setError('')
      notify('诊断证据已记录，现在可以预览学习计划。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '诊断提交失败。')
    }
  }

  const preview = () => {
    if (!course || loading) return
    setLoading(true)
    try {
      const result = buildGlobalPlanDraft(data)
      updateData(current => ({ ...current, globalPlanDraft: result, planDrafts: {}, plans: current.plans.filter(plan => plan.status !== 'draft') }))
      setError('')
      notify(result.validation.valid ? '全部课程计划草案已生成。' : '总课表已生成，但仍有课程或排程问题需要处理。', result.validation.valid ? 'success' : 'info')
      navigate('/plan')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '总课表预览失败。')
    } finally { setLoading(false) }
  }

  if (!data.courses.length) return <div className="page"><PageHeader eyebrow="课程诊断" title="还没有可诊断的课程" description="先完成学习概况，诊断才会有可信的数据边界。" /><EmptyState title="缺少课程信息" description="课程名称、评估方式和当前能力都是必要信息。" action={<Link className="button primary" to="/onboarding">开始规划</Link>} /></div>
  if (!course) return null
  if (!diagnosis) return <div className="page diagnosis-page"><PageHeader eyebrow="课程诊断" title="用精细诊断提高计划置信度" description="现有成绩或自评已经可以生成基线计划；诊断用于进一步定位薄弱点，并在应用前展示计划差异。" /><CourseSwitcher courses={data.courses} value={course.id} onChange={switchCourse} action={<CourseManager className="course-add-action" />} /><EmptyState title={`${course.name}还没有精细诊断`} description="这不会阻止当前计划执行。需要更准确定位时，可完成一批有版本的诊断题。" action={<button className="button primary" onClick={generate} disabled={loading}>{loading ? '正在生成…' : '开始精细诊断'}</button>} /></div>

  const submitted = diagnosis.status === 'completed'
  const questions = diagnosis.diagnosticQuiz
  const currentTasks = data.tasks.filter(task => task.courseId === course.id)
  const allAnswered = questions.every(item => answers[item.id])
  const objectiveQuestions = questions.filter(item => item.evidenceType === 'objective_quiz')
  const submittedEvents = data.quizEvents.filter(event => event.attemptId === diagnosis.attemptId)
  const objectiveAccuracy = objectiveQuestions.length && submittedEvents.length
    ? Math.round(submittedEvents.filter(event => event.evidenceType === 'objective_quiz').reduce((sum, event) => sum + event.score / Math.max(1, event.maxScore), 0) / objectiveQuestions.length * 100)
    : null
  const completedStageIds = new Set(currentTasks.filter(task => task.status === '已完成').map(task => task.stageLabel))
  const currentStageIndex = Math.max(0, diagnosis.learningStages.findIndex(stage => !completedStageIds.has(stage.week)))
  const openedStage = diagnosis.learningStages[expandedStage] ?? diagnosis.learningStages[currentStageIndex] ?? diagnosis.learningStages[0]

  return <div className="page diagnosis-page">
    <PageHeader eyebrow={demoMode ? '高中生 Demo · 模拟学习诊断' : '课程诊断 · 精细定位'} title={demoMode ? '先看清每门课的起点，再安排 30 天' : submitted ? '诊断完成，先查看计划差异' : '补充证据，提高计划置信度'} description={demoMode ? '基于预置成绩、学习目标和本地模拟规则生成。它用于演示个性化规划流程，不代表真实 AI 判断或学习结果。' : '考试成绩、自评、表现任务和客观测验会分别记录；诊断不是开始计划的前置门槛。'} actions={<button className="button secondary" onClick={generate} disabled={loading}><Icon name="diagnosis" /> {loading ? '正在生成…' : '重新进行精细诊断'}</button>} />
    <CourseSwitcher courses={data.courses} value={course.id} onChange={switchCourse} action={<CourseManager className="course-add-action" />} />
    {demoMode && <InlineNotice tone="info">演示路径：依次查看数学、英语、物理和政治的差异化诊断，再进入 <Link className="inline-action" to="/plan">30 天学习计划</Link>。</InlineNotice>}
    {activePlan?.status === 'stale' && <InlineNotice>现有计划仍可查看；新诊断已提供更高置信度依据，请先预览差异，再决定是否更新。</InlineNotice>}
    {error && <InlineNotice tone="error">{error}</InlineNotice>}

    {!submitted && <>
      <section className="card section-card baseline-card"><div><span className="section-kicker">{evidenceLabels[diagnosis.evidenceType]}</span><h2>{course.name}基础诊断</h2><p>{diagnosis.assessmentSummary}</p></div><span className="status-pill">约 10–15 分钟</span></section>
      <section className="diagnosis-confidence" aria-label="诊断置信度"><div><span>数据完整度</span><strong>{diagnosis.completeness}%</strong></div><div><span>当前诊断置信度</span><strong>{diagnosis.confidence}</strong></div><p>{diagnosis.confidenceBasis} {diagnosis.nextAction}</p></section>
      <section className="card quiz-panel"><header><div><span className="section-kicker">课程知识与学习能力</span><h2>按证据类型完成基础诊断</h2></div></header>{(['objective_quiz', 'self_assessment', 'performance_task'] as const).map(type => { const grouped = questions.filter(item => item.evidenceType === type); return grouped.length ? <section className="quiz-evidence-group" key={type}><div><strong>{evidenceLabels[type]}</strong><span>{type === 'objective_quiz' ? '提交后计入客观正确率' : type === 'self_assessment' ? '只记录自评，不称为正确率' : '用于判断能否独立完成任务'}</span></div><div className="quiz-list">{grouped.map((item, index) => <fieldset key={item.id}><legend>{index + 1}. {item.prompt}</legend><small>{item.point}</small><div>{item.options.map(option => <label key={option} className={answers[item.id] === option ? 'selected' : ''}><input type="radio" name={item.id} checked={answers[item.id] === option} onChange={() => setAnswers(current => ({ ...current, [item.id]: option }))} />{option}</label>)}</div></fieldset>)}</div></section> : null })}<details className="diagnosis-record"><summary>诊断记录</summary><p>诊断版本：{diagnosis.version} · 题目版本：{diagnosis.questionVersion} · 记录编号：{diagnosis.attemptId.slice(0, 8)}</p></details><button className="button primary" onClick={submitDiagnosis} disabled={!allAnswered} aria-describedby={!allAnswered ? 'diagnosis-submit-help' : undefined}>提交诊断</button>{!allAnswered && <small id="diagnosis-submit-help">请完成全部 {questions.length} 题后提交。</small>}</section>
    </>}

    {submitted && <>
      <section className="diagnosis-conclusions" aria-label="诊断核心结论"><article><span>当前水平</span><h2>{diagnosis.currentLevel}</h2><p>{diagnosis.assessmentSummary}</p></article><article><span>最优先问题</span><h2>{diagnosis.priorityProblem}</h2><p>优先处理对后续任务影响最大的断点。</p></article><article><span>下一步行动</span><h2>{diagnosis.nextAction}</h2><p>{diagnosis.feasibilityWarning || '计划会同时遵守假期范围和每日容量。'}</p></article></section>
      <section className="diagnosis-confidence"><div><span>数据完整度</span><strong>{diagnosis.completeness}%</strong></div><div><span>诊断置信度</span><strong>{diagnosis.confidence}</strong></div><p>{diagnosis.confidenceBasis}{objectiveAccuracy !== null ? ` 本批客观题正确率 ${objectiveAccuracy}%。` : ` 本批为${evidenceLabels[diagnosis.evidenceType]}，不计算客观正确率。`}</p></section>
      <section className="diagnosis-stages"><div className="section-title"><div><span className="section-kicker">分阶段建议</span><h2>{diagnosis.learningStages.length} 个学习阶段</h2></div><p>{diagnosis.realisticGoal}</p></div><div className="stage-track" role="tablist" aria-label="学习阶段">{diagnosis.learningStages.map((stage, index) => <button type="button" role="tab" aria-selected={expandedStage === index} className={`${completedStageIds.has(stage.week) ? 'completed' : index === currentStageIndex ? 'current' : ''} ${expandedStage === index ? 'selected' : ''}`} key={`${stage.week}-${stage.title}-${index}`} onClick={() => setExpandedStage(index)}><span>{completedStageIds.has(stage.week) ? '已完成' : index === currentStageIndex ? '当前' : stage.week}</span><strong>{stage.title}</strong></button>)}</div>{openedStage && <article className="stage-detail" role="tabpanel"><div><span>{openedStage.week} · {openedStage.difficulty}</span><h3>{openedStage.title}</h3><p>{openedStage.focus}</p></div><dl><div><dt>练习方式</dt><dd>{openedStage.practice}</dd></div><div><dt>成果物</dt><dd>{openedStage.deliverable}</dd></div></dl></article>}</section>
      <details className="card diagnosis-evidence"><summary>查看详细诊断依据</summary><div className="grid-two"><section><h3>可能原因</h3><ul className="clean-list">{diagnosis.weakReasons.map(reason => <li key={reason}>{reason}</li>)}</ul><h3>具体薄弱知识点</h3><div className="tag-list">{diagnosis.weakKnowledgePoints.map(point => <span key={point}>{point}</span>)}</div></section><section><h3>为什么这样安排</h3><ol>{diagnosis.rationale.map(reason => <li key={reason}>{reason}</li>)}</ol><InlineNotice>{diagnosis.disclaimer}</InlineNotice></section></div></details>
      <section className="bottom-cta"><div><strong>{activePlan ? '用新诊断重新生成总课表' : '生成全部课程计划'}</strong><p>系统会汇总所有课程统一分配时间；确认总课表前不会覆盖当前计划。</p></div><button className="button primary" disabled={loading} onClick={preview}>{loading ? '正在生成总课表…' : activePlan ? '预览总课表变化' : '生成全部课程计划'} <Icon name="arrow" /></button></section>
    </>}
  </div>
}
