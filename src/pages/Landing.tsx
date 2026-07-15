import { Link } from 'react-router-dom'
import { Icon, Logo } from '../components.tsx'

export default function Landing() {
  return <div className="landing"><header className="landing-nav"><Logo /><nav aria-label="首页导航"><a href="#philosophy">产品理念</a><Link to="/onboarding">开始规划</Link></nav></header><main className="landing-hero"><p className="hero-overline">假期学习规划</p><h1><span>把有限的假期，</span><span>留给真正重要的提升。</span></h1><p>不把计划排满，而是根据你的成绩、目标与现实安排，<br className="desktop-break" />帮你决定这个假期最该先做什么。</p><div className="hero-actions"><Link className="button primary" to="/onboarding">开始制定我的计划 <Icon name="arrow" size={17} /></Link><a className="text-link" href="#philosophy">查看安排方式 <Icon name="arrow" size={15} /></a></div></main><section id="philosophy" className="landing-capabilities"><article><span>01</span><h2>学习诊断</h2><strong>看见真正问题</strong><p>从成绩、目标与学习状态中找到最该关注的事。</p></article><article><span>02</span><h2>优先级判断</h2><strong>在有限时间里取舍</strong><p>先补弱，再稳步推进你真正想完成的目标。</p></article><article><span>03</span><h2>动态调整</h2><strong>计划被打断后继续前进</strong><p>根据旅行、时间变化与完成情况重新安排任务。</p></article></section></div>
}
