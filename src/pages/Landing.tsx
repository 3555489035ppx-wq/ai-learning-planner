import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, Logo } from '../components.tsx'
import { createHighSchoolDemoData } from '../demoData.ts'
import { useStore } from '../store.tsx'

export default function Landing() {
  const { data, replaceData, notify } = useStore()
  const navigate = useNavigate()
  const [demoLoading, setDemoLoading] = useState(false)
  const destination = data.onboardingCompleted ? '/today' : '/onboarding'
  const action = data.onboardingCompleted ? '继续我的计划' : '开始制定我的计划'
  const activeCourses = data.courses.filter(course => !course.archivedAt)
  const previewCourses = activeCourses.slice(0, 4)
  const nextTask = data.tasks.find(task => task.status !== '已完成')
  const nextTaskCourse = data.courses.find(course => course.id === nextTask?.courseId)
  const startDemo = () => {
    if (demoLoading) return
    setDemoLoading(true)
    try {
      replaceData(createHighSchoolDemoData())
      notify('高中生 Demo 已加载：可以从六科诊断开始查看。')
      navigate('/diagnosis')
    } catch {
      setDemoLoading(false)
      notify('Demo 数据加载失败，请重试。', 'error')
    }
  }
  return <div className="landing landing-v6">
    <header className="landing-nav"><Logo withMark={false} /><nav aria-label="首页导航"><Link to={destination}>开始规划</Link></nav></header>
    <main>
      <section className="landing-hero landing-hero-planner">
        <div className="landing-hero-copy">
          <p className="hero-overline">假期学习规划</p>
          <h1 data-page-title tabIndex={-1}><span>把有限的假期</span><span className="landing-title-accent">留给无限的提升</span></h1>
          <p>不把计划排满，而是根据你的成绩、目标与现实安排，帮你决定这个假期最该先做什么。</p>
          <div className="hero-actions"><Link className="button primary" to={destination}>{action} <Icon name="arrow" size={17} /></Link><button type="button" className="button secondary" onClick={startDemo} disabled={demoLoading}>{demoLoading ? '正在加载…' : '体验高中生 Demo'} <Icon name="arrow" size={17} /></button></div>
          <p className="hero-note">Demo 已预置高二学生的六科成绩、模拟诊断与 30 天计划；不需要登录或填写信息。</p>
        </div>
        <aside className="landing-overview" aria-label="假期计划预览">
          <div className="overview-topline"><span className="section-kicker">计划预览</span><span className="overview-status"><i /> {activeCourses.length ? '已读取你的课程' : '等待你的第一条信息'}</span></div>
          <div className="overview-heading"><div><p>这个假期，先看清楚起点</p><h2>{activeCourses.length ? `${activeCourses.length} 门课程，准备开始安排` : '从一个真实目标开始'}</h2></div><span className="overview-mark">↗</span></div>
          <div className="overview-courses">
            {previewCourses.length ? previewCourses.map(course => {
              const score = typeof course.score === 'number' ? course.score : null
              const target = typeof course.targetScore === 'number' ? course.targetScore : null
              const maxScore = typeof course.maxScore === 'number' && course.maxScore > 0 ? course.maxScore : 100
              const scoreWidth = score === null ? 0 : Math.max(10, Math.min(100, score / maxScore * 100))
              const targetWidth = target === null ? 0 : Math.max(scoreWidth, Math.min(100, target / maxScore * 100))
              return <div className="overview-course" key={course.id}><div className="overview-course-meta"><strong>{course.name}</strong><span>{score === null ? '待录入' : `${score} 分`} <b>→</b> {target === null ? '设定目标' : `${target} 分`}</span></div><div className="overview-track"><span className="overview-score" style={{ width: `${scoreWidth}%` }} /><span className="overview-target" style={{ left: `${targetWidth}%` }} /></div></div>
            }) : <div className="overview-empty"><strong>成绩、目标、时间</strong><span>会一起变成一份可执行的假期计划。</span></div>}
          </div>
          <div className="overview-next"><div><span>下一步会发生什么</span><strong>{nextTaskCourse?.name ?? '输入课程与最近一次成绩'}</strong><p>{nextTask?.title ?? '系统会先找出最值得投入的地方，再安排你的第一周。'}</p></div><Icon name="arrow" size={18} /></div>
        </aside>
      </section>
    </main>
  </div>
}
