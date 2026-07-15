import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Icon, InlineNotice, PageHeader } from '../components.tsx'
import { mockPlanningProvider } from '../providers.ts'
import { useStore } from '../store.tsx'

const quizItems = [
  { id: 'algebra', question: '若 2x + 3 = 11，x 等于？', options: ['2', '4', '7'], answer: '4', point: '先修代数' },
  { id: 'function', question: '函数 y = 1/(x-2) 的定义域应排除？', options: ['0', '1', '2'], answer: '2', point: '函数概念与图像' },
  { id: 'limit', question: '当 x 趋近 0 时，sin x / x 的极限是？', options: ['0', '1', '不存在'], answer: '1', point: '极限基础' },
  { id: 'derivative', question: '函数 x² 的导数是？', options: ['x', '2x', 'x²'], answer: '2x', point: '导数定义' },
]

export default function Diagnosis() {
  const { data, updateData, notify } = useStore()
  const [loading, setLoading] = useState(!data.diagnosis && data.courses.length > 0)
  const [error, setError] = useState('')
  const [quizOpen, setQuizOpen] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [quizResult, setQuizResult] = useState<number | null>(null)

  const generate = async () => {
    if (!data.courses.length) return
    setLoading(true)
    setError('')
    try {
      const result = await mockPlanningProvider.generateDiagnosis(data)
      updateData(current => ({ ...current, diagnosis: result.data }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '诊断生成失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (!data.diagnosis && data.courses.length) void generate() }, [])

  if (!data.courses.length) return <div className="page"><PageHeader eyebrow="课程诊断" title="还没有可诊断的课程" description="先完成学习概况，诊断才会有可信的数据边界。" /><EmptyState title="缺少课程信息" description="课程阶段、满分和考试类型都是必要信息。" action={<Link className="button primary" to="/onboarding">开始规划</Link>} /></div>
  if (loading) return <div className="page"><PageHeader eyebrow="课程诊断" title="正在整理诊断" description="本地 Mock Provider 正在验证字段并生成结构化结果。" /><div className="loading-state"><span className="spinner" /><p>分析成绩边界、现实安排与目标可行性…</p></div></div>
  if (error) return <div className="page"><PageHeader eyebrow="课程诊断" title="诊断暂时未完成" description="你的课程数据仍然保留，可以重试。" /><InlineNotice tone="error">{error}</InlineNotice><button className="button primary" onClick={generate}>重新生成</button></div>
  const diagnosis = data.diagnosis
  if (!diagnosis) return null
  const course = data.courses.find(item => item.id === diagnosis.courseId) ?? data.courses[0]
  const recommended = data.resources.filter(resource => diagnosis.recommendedResourceIds.includes(resource.id))

  const submitQuiz = () => {
    if (Object.keys(answers).length < quizItems.length) return setError('请完成全部诊断题后再提交。')
    const correct = quizItems.filter(item => answers[item.id] === item.answer).length
    const accuracy = Math.round((correct / quizItems.length) * 100)
    const weak = quizItems.filter(item => answers[item.id] !== item.answer).map(item => item.point)
    setQuizResult(accuracy)
    setError('')
    updateData(current => ({ ...current, diagnosis: current.diagnosis ? { ...current.diagnosis, weakKnowledgePoints: weak.length ? weak : ['综合题步骤完整性'], confidence: '高' } : current.diagnosis, progress: { ...current.progress, initialAccuracy: accuracy, repeatedWeakPoints: weak }, planChanges: [`基础诊断正确率 ${accuracy}%，已收窄薄弱知识点。`, ...current.planChanges] }))
    notify('基础诊断结果已写入学习计划。')
  }

  return <div className="page diagnosis-page"><PageHeader eyebrow="课程诊断" title={`${course.name}：先确认问题，再安排学习`} description="诊断结果来自你填写的课程、目标和可用时间；不把单次低分直接等同于某个固定薄弱点。" actions={<button className="button secondary" onClick={generate}><Icon name="diagnosis" /> 重新诊断</button>} />
    <section className="diagnosis-summary grid-two"><article className="card section-card"><span className="section-kicker">成绩评价</span><h2>{course.score}/{course.maxScore} · 目标 {course.targetScore || course.passScore}</h2><p>{diagnosis.scoreEvaluation}</p><div className="confidence-row"><span>数据完整度 <strong>{diagnosis.completeness}%</strong></span><span>诊断置信度 <strong>{diagnosis.confidence}</strong></span></div></article><article className="card section-card"><span className="section-kicker">现实目标</span><h2>先完成基础定位</h2><p>{diagnosis.realisticGoal}</p><InlineNotice>{diagnosis.disclaimer}</InlineNotice></article></section>

    <section id="baseline-quiz" className="card section-card baseline-card"><div><span className="section-kicker">建议完成的基础诊断测验</span><h2>{diagnosis.baselineQuizMinutes} 分钟，区分先修基础与微积分问题</h2><p>覆盖代数、函数、极限与导数。提交后才会把“可能薄弱”更新为更具体的知识点。</p></div><button className="button primary" onClick={() => { setQuizOpen(!quizOpen); setError('') }}>{quizOpen ? '收起测验' : quizResult === null ? '开始基础诊断' : '重新测验'}</button></section>
    {quizOpen && <section className="card quiz-panel"><header><div><span className="section-kicker">快速小测</span><h2>完成全部 4 题</h2></div>{quizResult !== null && <strong className="quiz-score">{quizResult}%</strong>}</header><div className="quiz-list">{quizItems.map((item, index) => <fieldset key={item.id}><legend>{index + 1}. {item.question}</legend><div>{item.options.map(option => <label key={option} className={answers[item.id] === option ? 'selected' : ''}><input type="radio" name={item.id} checked={answers[item.id] === option} onChange={() => setAnswers(current => ({ ...current, [item.id]: option }))} />{option}</label>)}</div></fieldset>)}</div>{error && <InlineNotice tone="error">{error}</InlineNotice>}<button className="button primary" onClick={submitQuiz}>提交诊断测验</button></section>}

    <div className="grid-two diagnosis-details"><section className="card section-card"><span className="section-kicker">可能的薄弱原因</span><h2>当前是待验证假设</h2><ul className="clean-list">{diagnosis.weakReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></section><section className="card section-card"><span className="section-kicker">具体薄弱知识点</span><h2>{quizResult === null ? '完成小测后会更准确' : '已根据小测更新'}</h2><div className="tag-list">{diagnosis.weakKnowledgePoints.map(point => <span key={point}>{point}</span>)}</div></section></div>

    <section className="card section-card"><span className="section-kicker">六周学习阶段</span><h2>从诊断到模拟的分阶段路径</h2><div className="stage-grid">{diagnosis.sixWeekStages.map(stage => <article key={stage.week}><span>{stage.week}</span><h3>{stage.title}</h3><p>{stage.focus}</p></article>)}</div></section>

    <section className="card section-card"><div className="section-heading-row"><div><span className="section-kicker">推荐学习资源</span><h2>只展示已配置来源</h2></div><Link className="text-link" to="/resources">查看全部资源 <Icon name="arrow" /></Link></div><div className="resource-mini-grid">{recommended.map(resource => <article key={resource.id}><span>{resource.platform} · {resource.humanVerified ? '人工验证' : '未验证'}</span><h3>{resource.title}</h3><p>{resource.recommendation}</p><a href={resource.url} target={resource.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer">原始来源 <Icon name="external" size={15} /></a></article>)}</div></section>

    <section className="card section-card rationale-card"><span className="section-kicker">为什么这样安排</span><h2>诊断依据</h2><ol>{diagnosis.rationale.map(reason => <li key={reason}>{reason}</li>)}</ol></section>
    <div className="bottom-cta"><p>完成基础诊断后，计划会根据结果自动收窄知识点。</p><Link className="button primary" to="/plan">查看学习计划 <Icon name="arrow" /></Link></div>
  </div>
}
