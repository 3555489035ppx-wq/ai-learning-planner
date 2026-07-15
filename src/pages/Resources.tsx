import { useMemo, useState } from 'react'
import { EmptyState, Icon, InlineNotice, PageHeader } from '../components.tsx'
import { createTask, todayISO } from '../data.ts'
import { useStore } from '../store.tsx'
import type { LearningResource } from '../types.ts'

const platforms = ['全部', '站内测验', '哔哩哔哩', 'MIT OpenCourseWare', 'Khan Academy', '用户提供']

export default function Resources() {
  const { data, updateData, notify } = useStore()
  const [platform, setPlatform] = useState('全部')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [url, setUrl] = useState('')
  const [duration, setDuration] = useState('30')
  const [error, setError] = useState('')
  const resources = useMemo(() => data.resources.filter(resource => resource.status !== '不感兴趣' && (platform === '全部' || resource.platform === platform)), [data.resources, platform])

  const addToPlan = (resource: LearningResource) => {
    if (data.tasks.some(task => task.resourceId === resource.id && task.status === '待完成')) return notify('该资源已在待完成计划中。', 'info')
    const course = data.courses[0]
    const task = createTask({
      date: todayISO(),
      time: '19:30',
      title: `${course?.name || '自定义课程'} · 资源学习`,
      courseId: course?.id || '',
      knowledgePoint: resource.knowledgePoints[0] || '自定义知识点',
      resourceId: resource.id,
      materialLabel: resource.title,
      watchMinutes: resource.durationMin,
      estimatedMinutes: Math.min(resource.durationMin + 20, 90),
      changeNote: '从学习资源页加入计划',
      order: data.tasks.length,
    })
    updateData(current => ({ ...current, tasks: [...current.tasks, task], resources: current.resources.map(item => item.id === resource.id ? { ...item, status: '已加入计划' } : item), planChanges: [`已将「${resource.title}」加入今日计划。`, ...current.planChanges] }))
    notify('资源已加入今日计划。')
  }

  const replaceResource = (resource: LearningResource) => {
    const candidates = data.resources.filter(item => item.id !== resource.id && item.status !== '不感兴趣' && item.knowledgePoints.some(point => resource.knowledgePoints.includes(point)))
    const replacement = candidates[0]
    if (!replacement) return notify('暂时没有匹配同一知识点的替代资源。', 'error')
    updateData(current => ({ ...current, tasks: current.tasks.map(task => task.resourceId === resource.id ? { ...task, resourceId: replacement.id, materialLabel: replacement.title, watchMinutes: replacement.durationMin, changeNote: `学习资源已从「${resource.title}」更换` } : task), planChanges: [`已用「${replacement.title}」替换同知识点资源。`, ...current.planChanges] }))
    notify(`已更换为「${replacement.title}」。`)
  }

  const dismissResource = (resource: LearningResource) => {
    updateData(current => ({ ...current, resources: current.resources.map(item => item.id === resource.id ? { ...item, status: '不感兴趣' } : item), tasks: current.tasks.map(task => task.resourceId === resource.id ? { ...task, resourceId: '', materialLabel: '需要重新选择资源', changeNote: '原资源已标记为不感兴趣' } : task) }))
    notify('已减少类似资源推荐。')
  }

  const saveOwnResource = () => {
    setError('')
    if (!title.trim() || !author.trim() || !url.trim()) return setError('请填写标题、来源作者和原始链接。')
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    } catch {
      return setError('请输入以 http:// 或 https:// 开头的有效链接。')
    }
    const resource: LearningResource = {
      id: crypto.randomUUID(), title: title.trim(), platform: '用户提供', author: author.trim(), durationMin: Math.max(1, Number(duration) || 30), suitableStage: '由用户自行判断', knowledgePoints: ['用户自定义'], recommendation: '这是你添加的资源，平台未验证其内容与适用性。', humanVerified: false, url: url.trim(), status: '可用', userProvided: true,
    }
    updateData(current => ({ ...current, resources: [...current.resources, resource] }))
    setTitle(''); setAuthor(''); setUrl(''); setDuration('30'); setShowForm(false)
    notify('个人课程链接已保存。')
  }

  return <div className="page resources-page"><PageHeader eyebrow="学习资源" title="来源清楚，才值得加入计划" description="第一版只使用可配置的人工审核清单和你主动粘贴的链接；视频始终回到原平台打开。" actions={<button className="button primary" onClick={() => setShowForm(!showForm)}><Icon name="plus" /> {showForm ? '收起表单' : '添加我的课程链接'}</button>} />
    <InlineNotice>不会抓取、下载或重新托管哔哩哔哩、抖音等平台视频。外部内容的版权、可用性与隐私政策由原平台负责。</InlineNotice>
    {showForm && <section className="card section-card resource-form"><div className="form-grid two"><label className="field"><span>资源标题</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="使用原页面标题" /></label><label className="field"><span>平台或作者</span><input value={author} onChange={event => setAuthor(event.target.value)} placeholder="例如：课程作者 / 上传者" /></label><label className="field"><span>原始链接</span><input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></label><label className="field"><span>预计时长（分钟）</span><input type="number" min="1" max="600" value={duration} onChange={event => setDuration(event.target.value)} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-inline-actions"><button className="button secondary" onClick={() => { setShowForm(false); setError('') }}>取消</button><button className="button primary" onClick={saveOwnResource}>保存资源</button></div></section>}
    <div className="filter-bar" aria-label="资源平台筛选">{platforms.map(item => <button key={item} className={platform === item ? 'active' : ''} onClick={() => setPlatform(item)}>{item}</button>)}</div>
    {resources.length === 0 ? <EmptyState title="这个筛选下没有可用资源" description="可以切换平台，或添加自己的合法课程链接。" action={<button className="button secondary" onClick={() => setPlatform('全部')}>查看全部</button>} /> : <div className="resource-grid">{resources.map(resource => { const inPlan = resource.status === '已加入计划' || data.tasks.some(task => task.resourceId === resource.id && task.status === '待完成'); return <article className="card resource-card" key={resource.id}><header><span className="platform-badge">{resource.platform}</span><span className={resource.humanVerified ? 'verified' : 'unverified'}>{resource.humanVerified ? '人工验证' : '用户提供 · 未验证'}</span></header><h2>{resource.title}</h2><p className="resource-author">{resource.author} · {resource.durationMin} 分钟</p><dl><div><dt>适合阶段</dt><dd>{resource.suitableStage}</dd></div><div><dt>对应知识点</dt><dd>{resource.knowledgePoints.join('、')}</dd></div><div><dt>推荐理由</dt><dd>{resource.recommendation}</dd></div></dl><div className="resource-actions"><a className="button secondary" href={resource.url} target={resource.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer">原始链接 <Icon name="external" size={15} /></a><button className="button primary" onClick={() => addToPlan(resource)} disabled={inPlan}>{inPlan ? '已加入计划' : '加入计划'}</button></div><div className="resource-secondary-actions"><button onClick={() => replaceResource(resource)}>更换资源</button><button onClick={() => dismissResource(resource)}>不感兴趣</button></div></article> })}</div>}
  </div>
}
