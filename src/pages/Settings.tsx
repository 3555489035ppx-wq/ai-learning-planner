import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { useStore } from '../store.tsx'
import type { GoalType } from '../types.ts'

const goalTypes: GoalType[] = ['补弱', '补考', '四六级', '考研', '考证', '技能提升']

export default function Settings() {
  const { data, updateData, resetData, notify } = useStore()
  const navigate = useNavigate()
  const [clearOpen, setClearOpen] = useState(false)
  const priorityCourse = data.courses.find(course => course.priority) ?? data.courses[0]

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `假期跃迁数据-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    notify('数据导出已开始。')
  }

  const save = () => notify('设置已保存到当前浏览器。')

  return <div className="page settings-page"><PageHeader eyebrow="设置" title="让计划持续贴近你的现实" description="学习档案、可用时间、资源偏好和提醒都会自动持久保存。" actions={<button className="button primary" onClick={save}>保存设置</button>} />
    <div className="settings-layout"><section className="card settings-section"><header><div><span className="section-kicker">个人学习档案</span><h2>基本信息与当前目标</h2></div></header><div className="form-grid two"><label className="field"><span>显示名称</span><input value={data.settings.displayName} onChange={event => updateData(current => ({ ...current, settings: { ...current.settings, displayName: event.target.value } }))} /></label><label className="field"><span>当前优先目标</span><select value={priorityCourse?.goalType || ''} disabled={!priorityCourse} onChange={event => priorityCourse && updateData(current => ({ ...current, courses: current.courses.map(course => course.id === priorityCourse.id ? { ...course, goalType: event.target.value as GoalType } : course) }))}><option value="">尚未设置</option>{goalTypes.map(goal => <option key={goal}>{goal}</option>)}</select><small>{priorityCourse ? `对应课程：${priorityCourse.name}` : '请先完成课程规划'}</small></label><label className="field"><span>假期开始日期</span><input type="date" value={data.schedule.holidayStart} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, holidayStart: event.target.value } }))} /></label><label className="field"><span>假期结束日期</span><input type="date" value={data.schedule.holidayEnd} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, holidayEnd: event.target.value } }))} /></label><label className="field"><span>工作日每日可用时间（分钟）</span><input type="number" min="0" max="720" value={data.schedule.weekdayMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, weekdayMinutes: Number(event.target.value) } }))} /></label><label className="field"><span>周末每日可用时间（分钟）</span><input type="number" min="0" max="720" value={data.schedule.weekendMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, weekendMinutes: Number(event.target.value) } }))} /></label></div></section>
      <section className="card settings-section"><header><div><span className="section-kicker">提醒</span><h2>学习与计划变化</h2></div></header><div className="setting-rows"><label className="setting-row"><span><strong>提醒时间</strong><small>仅保存在本地；浏览器通知需后续权限接入。</small></span><input type="time" value={data.settings.reminderTime} onChange={event => updateData(current => ({ ...current, settings: { ...current.settings, reminderTime: event.target.value } }))} /></label><div className="setting-row"><span><strong>每日计划提醒</strong><small>控制应用内提醒状态。</small></span><button className={`switch ${data.settings.dailyReminder ? 'on' : ''}`} role="switch" aria-checked={data.settings.dailyReminder} onClick={() => updateData(current => ({ ...current, settings: { ...current.settings, dailyReminder: !current.settings.dailyReminder } }))}><i /></button></div><div className="setting-row"><span><strong>计划调整提醒</strong><small>重排后展示变化说明。</small></span><button className={`switch ${data.settings.adjustmentReminder ? 'on' : ''}`} role="switch" aria-checked={data.settings.adjustmentReminder} onClick={() => updateData(current => ({ ...current, settings: { ...current.settings, adjustmentReminder: !current.settings.adjustmentReminder } }))}><i /></button></div></div></section>
      <section className="card settings-section"><header><div><span className="section-kicker">学习资源偏好</span><h2>控制推荐范围</h2></div></header><div className="setting-rows"><label className="setting-row"><span><strong>偏好的资源组合</strong><small>用于资源排序，不会抓取外部平台内容。</small></span><select value={data.settings.resourcePreference} onChange={event => updateData(current => ({ ...current, settings: { ...current.settings, resourcePreference: event.target.value } }))}><option>系统课程 + 练习</option><option>短视频 + 练习</option><option>讲义 + 题库</option><option>只看人工验证资源</option></select></label><div className="setting-row"><span><strong>接受短视频资源</strong><small>开启后允许推荐已人工审核的短视频链接。</small></span><button className={`switch ${data.settings.acceptShortVideo ? 'on' : ''}`} role="switch" aria-checked={data.settings.acceptShortVideo} onClick={() => updateData(current => ({ ...current, settings: { ...current.settings, acceptShortVideo: !current.settings.acceptShortVideo } }))}><i /></button></div></div></section>
      <section className="card settings-section data-section"><header><div><span className="section-kicker">数据与隐私</span><h2>掌控本地学习数据</h2></div></header><InlineNotice>当前 MVP 不包含账户与云同步。数据存储在浏览器 localStorage，不会上传 API 密钥或个人数据。</InlineNotice><div className="data-actions"><button className="button secondary" onClick={exportData}><Icon name="external" /> 导出 JSON 数据</button><button className="button secondary" onClick={() => navigate('/onboarding')}>重新规划</button><button className="button danger" onClick={() => setClearOpen(true)}><Icon name="trash" /> 清除数据</button></div><label className="privacy-check"><input type="checkbox" checked={data.settings.privacyAccepted} onChange={event => updateData(current => ({ ...current, settings: { ...current.settings, privacyAccepted: event.target.checked } }))} /><span>我了解当前数据仅保存在本地浏览器，清除缓存后可能无法恢复。</span></label></section>
    </div>
    {clearOpen && <Modal title="清除全部本地数据？" description="课程、诊断、任务、进展、资源偏好都会恢复为初始状态。" onClose={() => setClearOpen(false)} footer={<><button className="button secondary" onClick={() => setClearOpen(false)}>取消</button><button className="button danger" onClick={() => { resetData(); setClearOpen(false); navigate('/') }}>确认清除</button></>}><p>建议先导出 JSON 备份。此操作无法撤销。</p></Modal>}
  </div>
}
