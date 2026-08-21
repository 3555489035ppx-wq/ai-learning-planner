import { useState } from 'react'
import { CourseSwitcher, EmptyState, Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { createCourse } from '../data.ts'

const demoCourses = [
  createCourse({ id: 'design-math', name: '高等数学', stage: '大学' }),
  createCourse({ id: 'design-english', name: '大学英语', stage: '大学' }),
  createCourse({ id: 'design-python', name: 'Python', stage: '大学' }),
]

const colors = [
  ['Canvas', '页面底色', 'canvas'],
  ['Surface', '内容面', 'surface'],
  ['Ink', '主文字', 'ink'],
  ['Navy', '结构标题', 'navy'],
  ['Action Blue', '主操作', 'action'],
  ['Blue Tint', '轻量选中', 'tint'],
  ['Success', '完成', 'success'],
  ['Warning', '注意', 'warning'],
  ['Danger', '危险操作', 'danger'],
] as const

export default function DesignSystem() {
  const [course, setCourse] = useState('')
  const [tab, setTab] = useState('计划')
  const [modalOpen, setModalOpen] = useState(false)
  const [feedback, setFeedback] = useState('')

  const showFeedback = () => {
    setFeedback('设置已保存。')
    window.setTimeout(() => setFeedback(''), 1800)
  }

  return <div className="page design-system-page">
    <PageHeader eyebrow="Blue Ink Study System" title="假期跃迁设计系统" description="DESIGN.md 的可视化实现。这里展示真实产品组件及其默认、交互、禁用和反馈状态。" />

    <section className="design-section" aria-labelledby="color-title"><header><span>01</span><div><h2 id="color-title">颜色与角色</h2><p>品牌蓝只用于操作、链接和选中；结构依靠蓝灰文字、细边框与背景层级。</p></div></header><div className="token-grid">{colors.map(([name, role, tone]) => <article key={name}><i className={`token-swatch ${tone}`} /><strong>{name}</strong><span>{role}</span></article>)}</div></section>

    <section className="design-section" aria-labelledby="type-title"><header><span>02</span><div><h2 id="type-title">排版层级</h2><p>中文系统字体栈；标题收紧字距，正文保持自然字距和舒适行高。</p></div></header><div className="type-specimen"><p className="type-display">把有限的假期，留给重要的提升。</p><p className="type-page-title">页面标题 · 今日学习安排</p><h3>区域标题 · 当前最优先任务</h3><p>正文用于解释计划依据、学习动作和完成标准。它需要在桌面和手机上都能快速扫读。</p><small>辅助信息 · 2026 年 7 月 22 日 · 45 分钟</small></div></section>

    <section className="design-section" aria-labelledby="control-title"><header><span>03</span><div><h2 id="control-title">操作与状态</h2><p>所有控件至少 44px；按下立即响应，键盘焦点清晰，禁用状态说明原因。</p></div></header><div className="design-control-groups"><div className="design-control-row"><button className="button primary" onClick={showFeedback}>保存设置</button><button className="button secondary" onClick={() => setModalOpen(true)}>打开对话框</button><button className="button danger">清除数据</button><button className="button primary" disabled title="请先补充必填信息">暂不可用</button><button className="icon-button" aria-label="添加"><Icon name="plus" /></button></div><div className="design-tabs" role="tablist" aria-label="设计系统示例标签">{['计划', '资源', '证据'].map(item => <button role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div><InlineNotice tone={tab === '证据' ? 'success' : 'info'}>{tab === '证据' ? '已有两次可比较测验，可以显示变化。' : `当前查看“${tab}”组件状态。`}</InlineNotice></div></section>

    <section className="design-section" aria-labelledby="form-title"><header><span>04</span><div><h2 id="form-title">表单与课程筛选</h2><p>标签始终位于控件上方；错误信息就地出现，课程标签切换时不重排。</p></div></header><div className="design-form-grid"><label className="field"><span>课程名称</span><input autoComplete="off" defaultValue="高等数学" /></label><label className="field"><span>教育阶段</span><select defaultValue="大学"><option>高中</option><option>大学</option></select></label><label className="field has-error"><span>本次得分</span><input aria-invalid="true" aria-describedby="score-demo-error" type="number" defaultValue="109" /><small className="field-error" id="score-demo-error">得分不能超过试卷满分。</small></label></div><CourseSwitcher courses={demoCourses} value={course} onChange={setCourse} includeAll /></section>

    <section className="design-section" aria-labelledby="schedule-title"><header><span>05</span><div><h2 id="schedule-title">课表单元与空状态</h2><p>任务以时间、课程、动作和完成标准为核心，不用装饰性图表替代信息。</p></div></header><div className="design-schedule-demo"><article><time>08:00</time><span>上午 1</span><strong>高等数学 · 函数与极限</strong><p>完成 3 道基础题，逐步写出定义使用条件。</p><small>完成标准：独立写出步骤并记录 1 个错因</small></article><article className="completed"><time>09:00</time><span>上午 2 · 已完成</span><strong>大学英语 · 阅读定位</strong><p>限时完成 1 篇阅读并核对定位词。</p><small>实际学习 38 分钟</small></article><article className="available"><time>10:00</time><span>上午 3</span><strong>保留恢复时间</strong><p>当前阶段没有足够证据生成新任务。</p></article></div><EmptyState title="还没有学习证据" description="完成第一项任务和 1–3 分钟自检后，这里会显示可追溯的进展。" action={<button className="button secondary">查看今日任务</button>} /></section>

    {feedback && <div className="toast design-toast" role="status">{feedback}</div>}
    {modalOpen && <Modal title="确认计划调整" description="对话框从当前操作进入，退出后焦点会回到触发位置。" onClose={() => setModalOpen(false)} footer={<><button className="button secondary" onClick={() => setModalOpen(false)}>取消</button><button className="button primary" onClick={() => { setModalOpen(false); showFeedback() }}>确认应用</button></>}><p>只会重排未完成任务。已完成任务、实际学习时长和自检记录不会改变。</p></Modal>}
  </div>
}
