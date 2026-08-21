import { useMemo, useState } from 'react'
import { CourseSwitcher, EmptyState, Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { createTaskChangeSet, revertChangeSet } from '../changeSets.ts'
import { addDays, todayISO } from '../data.ts'
import { localTimestamp } from '../dateUtils.ts'
import { getCourseIntelligence } from '../courseIntelligence.ts'
import { bilibiliAlternatives, bilibiliRecommendationScore, createTasksFromResource, recordTaskEvent, resourceMatchesCourse } from '../providers.ts'
import { bilibiliSearchUrl } from '../data/resources.cn.ts'
import { buildBilibiliSearchSuggestions, mockResourceProvider, sortReviewedCatalog } from '../resourceProvider.ts'
import { useStore } from '../store.tsx'
import type { LearningResource, ResourceContentType, ResourceDifficulty, ResourcePlatform, ResourceSort } from '../types.ts'

const contentTypes: ResourceContentType[] = ['系统课程', '视频', '文章/讲义', '练习题', '项目任务', '模板']
const difficulties: ResourceDifficulty[] = ['入门', '基础', '进阶', '综合']

export default function Resources() {
  const { data, updateData, notify } = useStore()
  const priorityId = data.courses.find(course => course.priority)?.id || data.courses[0]?.id || ''
  const [courseId, setCourseId] = useState(priorityId)
  const [knowledge, setKnowledge] = useState('全部')
  const [difficulty, setDifficulty] = useState('全部')
  const [duration, setDuration] = useState('全部')
  const [contentType, setContentType] = useState('全部')
  const [platform, setPlatform] = useState('全部')
  const [verifiedOnly, setVerifiedOnly] = useState(data.settings.onlyHumanVerified)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', author: '', url: '', duration: '30', courseId: priorityId, knowledge: '', contentType: '文章/讲义' as ResourceContentType, language: '中文', difficulty: '基础' as ResourceDifficulty })
  const [addingResource, setAddingResource] = useState<LearningResource | null>(null)
  const [targetCourseId, setTargetCourseId] = useState(priorityId)
  const [targetDate, setTargetDate] = useState(todayISO())
  const [targetSlotId, setTargetSlotId] = useState(data.schedule.timeSlots.find(slot => slot.enabled)?.id ?? '')
  const [targetKnowledge, setTargetKnowledge] = useState('')
  const [practiceTask, setPracticeTask] = useState('完成 4 项练习并记录 1 个疑问')
  const [targetStage, setTargetStage] = useState('')
  const [lastAddedChangeSet, setLastAddedChangeSet] = useState('')
  const [dismissedId, setDismissedId] = useState('')
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [sort, setSort] = useState<ResourceSort>('综合推荐')
  const [externalTarget, setExternalTarget] = useState<{ url: string; label: string; resource?: LearningResource } | null>(null)
  const selectedCourse = data.courses.find(course => course.id === courseId)
  const selectedDiagnosis = selectedCourse ? data.diagnoses[selectedCourse.id] : undefined
  const knowledgeOptions = Array.from(new Set(selectedDiagnosis?.weakKnowledgePoints ?? (selectedCourse ? getCourseIntelligence(selectedCourse, data.schedule).competencyDimensions : [])))
  const platforms = useMemo(() => ['全部', ...new Set(data.resources.map(resource => resource.platform))], [data.resources])

  const resources = useMemo(() => {
    const filtered = data.resources.filter(resource => {
    if (resource.status === '不感兴趣') return false
    if (!data.settings.resourcePlatforms.includes(resource.platform)) return false
    if (!data.settings.resourceContentTypes.includes(resource.contentType)) return false
    if (!data.settings.resourceLanguages.some(language => resource.language.includes(language))) return false
    if (!data.settings.acceptShortVideo && (resource.platform === '抖音' || resource.contentType === '视频' && resource.durationMin <= 10)) return false
    if (resource.durationMin > data.settings.maxResourceMinutes) return false
    const difficultyOrder = ['入门', '基础', '进阶', '综合']
    if (difficultyOrder.indexOf(resource.difficulty) > difficultyOrder.indexOf(data.settings.resourceDifficulty)) return false
    if (selectedCourse && !resourceMatchesCourse(resource, selectedCourse)) return false
    if (knowledge !== '全部' && !resource.knowledgePoints.includes(knowledge)) return false
    if (difficulty !== '全部' && resource.difficulty !== difficulty) return false
    if (contentType !== '全部' && resource.contentType !== contentType) return false
    if (platform !== '全部' && resource.platform !== platform) return false
    if (verifiedOnly && !resource.humanVerified) return false
    if (duration === '短于 15 分钟' && resource.durationMin >= 15) return false
    if (duration === '15–45 分钟' && (resource.durationMin < 15 || resource.durationMin > 45)) return false
    if (duration === '45 分钟以上' && resource.durationMin <= 45) return false
    const keyword = search.trim().toLowerCase()
    if (keyword && !`${resource.title} ${resource.author} ${resource.knowledgePoints.join(' ')}`.toLowerCase().includes(keyword)) return false
      return true
    })
    return sortReviewedCatalog(filtered, sort, resource => {
      if (!selectedCourse) return Number(resource.humanVerified) * 100
      const point = knowledge === '全部' ? selectedDiagnosis?.weakKnowledgePoints[0] ?? '' : knowledge
      return bilibiliRecommendationScore(resource, selectedCourse, point).score
    })
  }, [contentType, data.resources, data.settings, difficulty, duration, knowledge, platform, search, selectedCourse, selectedDiagnosis?.weakKnowledgePoints, sort, verifiedOnly])
  const visibleResources = resources.slice(0, showAll ? 30 : 12)
  const searchSuggestions = useMemo(() => selectedCourse
    ? buildBilibiliSearchSuggestions(selectedCourse, data.schedule, knowledge === '全部' ? '' : knowledge)
    : { suggestions: [], blockedReason: '请先选择课程。' }, [data.schedule, knowledge, selectedCourse])
  const visibleSuggestions = searchSuggestions.suggestions.slice(0, showAllSuggestions ? 30 : 12)

  const openAdd = (resource: LearningResource) => {
    const nextCourseId = courseId || priorityId
    setAddingResource(resource); setTargetCourseId(nextCourseId); setTargetDate(todayISO()); setTargetStage('')
    setTargetSlotId(data.schedule.timeSlots.find(slot => slot.enabled)?.id ?? '')
    setTargetKnowledge(resource.knowledgePoints[0] ?? '')
    setPracticeTask('完成 4 项练习并记录 1 个疑问')
    setError('')
  }

  const addToPlan = () => {
    if (!addingResource || !targetCourseId) return setError('请选择要加入的课程。')
    if (!targetDate && !targetStage) return setError('请选择加入日期或学习阶段。')
    if (targetDate && !targetSlotId) return setError('请选择一个具体节次。')
    if (!targetKnowledge.trim()) return setError('请填写目标章节或知识点。')
    if (!practiceTask.trim()) return setError('请填写观看后的练习或成果任务。')
    const course = data.courses.find(item => item.id === targetCourseId)
    if (!course) return setError('所选课程不存在。')
    if (!resourceMatchesCourse(addingResource, course)) return setError('该资源的稳定课程 ID 或领域与所选课程不匹配，不能加入。请为目标课程选择其他资源。')
    const diagnosis = data.diagnoses[course.id]
    const stageIndex = diagnosis?.learningStages.findIndex(stage => stage.week === targetStage) ?? -1
    const date = targetStage && stageIndex >= 0 ? addDays(data.schedule.holidayStart, stageIndex * 7) : targetDate
    const tasks = createTasksFromResource(data, addingResource, course, date, targetStage, { slotId: targetStage ? '' : targetSlotId, knowledgePoint: targetKnowledge, practiceTask })
    if (!tasks.length) return setError('当前假期范围内没有可用时间。')
    if (targetDate && (tasks[0]?.date !== targetDate || tasks[0]?.slotId !== targetSlotId)) return setError('所选日期和节次当前不可用，请更换节次或先调整已有任务。')
    const changeSet = createTaskChangeSet(data.tasks, [...data.tasks, ...tasks], `从资源页加入「${addingResource.title}」`, { scope: 'task', courseId: course.id })
    updateData(current => {
      const nextTasks = [...current.tasks, ...tasks]
      return { ...current, tasks: nextTasks, changeSets: [...current.changeSets, changeSet], taskEvents: [...current.taskEvents, ...tasks.map(task => recordTaskEvent(task, 'created', `从资源页加入「${addingResource.title}」`))], resources: current.resources.map(item => item.id === addingResource.id ? { ...item, status: '已加入计划' } : item), planChanges: [`已将「${addingResource.title}」拆分并排入 ${course.name}；${tasks.filter(task => task.scheduleStatus !== 'scheduled').length} 项需要重新选择节次。`, ...current.planChanges] }
    })
    setLastAddedChangeSet(changeSet.id)
    setAddingResource(null); notify(tasks.some(task => task.scheduleStatus !== 'scheduled') ? '资源已加入，部分任务会在下一周继续安排。' : '资源任务已保存，可在本页撤销。', tasks.some(task => task.scheduleStatus !== 'scheduled') ? 'info' : 'success')
  }

  const undoAdd = () => {
    if (!lastAddedChangeSet) return
    updateData(current => revertChangeSet(current, lastAddedChangeSet))
    setLastAddedChangeSet('')
    notify('已撤销刚才加入计划的资源任务。')
  }

  const dismissResource = (resource: LearningResource) => {
    const course = data.courses.find(item => item.id === courseId)
    updateData(current => ({ ...current, resources: current.resources.map(item => item.id === resource.id ? { ...item, status: '不感兴趣', dismissedAt: localTimestamp() } : item), resourceDismissals: [...current.resourceDismissals, { id: crypto.randomUUID(), resourceId: resource.id, courseId, subjectDomain: course?.subjectDomain || resource.subjectDomains[0] || '通用技能', platform: resource.platform, reason: '用户选择不感兴趣', createdAt: localTimestamp() }], resourceEvents: [...current.resourceEvents, { id: crypto.randomUUID(), resourceId: resource.id, courseId, type: 'dismissed', occurredAt: localTimestamp(), detail: '用户选择不感兴趣' }] }))
    setDismissedId(resource.id); notify('该资源已隐藏；课程、领域、平台和原因已记录，已有任务不会被修改。')
  }

  const undoDismiss = () => {
    updateData(current => ({ ...current, resources: current.resources.map(item => item.id === dismissedId ? { ...item, status: '可用', dismissedAt: undefined } : item), resourceDismissals: current.resourceDismissals.map(item => item.resourceId === dismissedId && !item.revertedAt ? { ...item, revertedAt: localTimestamp() } : item), resourceEvents: [...current.resourceEvents, { id: crypto.randomUUID(), resourceId: dismissedId, courseId, type: 'restored', occurredAt: localTimestamp(), detail: '撤销不感兴趣' }] }))
    setDismissedId(''); notify('已恢复资源。')
  }

  const recordOpen = (resource: LearningResource) => {
    updateData(current => ({ ...current, resources: current.resources.map(item => item.id === resource.id && item.bilibili ? { ...item, bilibili: { ...item.bilibili, openedAt: localTimestamp() } } : item), resourceEvents: [...current.resourceEvents, { id: crypto.randomUUID(), resourceId: resource.id, courseId, type: 'opened', occurredAt: localTimestamp(), detail: '用户确认离站并打开原始来源' }] }))
    notify('已记录“打开原视频”；这不会自动算作已观看或已完成。', 'info')
  }

  const confirmExternalOpen = () => {
    if (!externalTarget) return
    window.open(externalTarget.url, '_blank', 'noopener,noreferrer')
    if (externalTarget.resource) recordOpen(externalTarget.resource)
    setExternalTarget(null)
  }

  const updateResourceStatus = (resource: LearningResource, status: '稍后学习' | '已完成') => {
    updateData(current => ({
      ...current,
      resources: current.resources.map(item => item.id === resource.id ? { ...item, status } : item),
      resourceEvents: [...current.resourceEvents, { id: crypto.randomUUID(), resourceId: resource.id, courseId, type: status === '已完成' ? 'completed' : 'saved', occurredAt: localTimestamp(), detail: status === '已完成' ? '用户确认完成该资源' : '用户保存为稍后学习' }],
    }))
    notify(status === '已完成' ? '已记录资源完成，学习进展会纳入本周统计。' : '已加入稍后学习。')
  }

  const saveOwnResource = () => {
    setError('')
    if (!form.title.trim() || !form.author.trim() || !form.url.trim() || !form.courseId || !form.knowledge.trim()) return setError('请填写标题、来源、链接、课程和知识点。')
    try { const parsed = new URL(form.url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error() } catch { return setError('请输入以 http:// 或 https:// 开头的有效链接。') }
    const course = data.courses.find(item => item.id === form.courseId)
    if (!course) return setError('请选择有效课程。')
    const intelligence = getCourseIntelligence(course, data.schedule)
    const resource: LearningResource = {
      id: crypto.randomUUID(), title: form.title.trim(), platform: '用户提供', author: form.author.trim(), durationMin: Math.max(1, Number(form.duration) || 30), canonicalCourseIds: course.canonicalId ? [course.canonicalId] : [], courseNames: [course.name], domainCategory: intelligence.domainCategory, subjectDomains: [intelligence.subjectDomain], suitableStage: '由用户自行判断', educationStages: course.stage ? [course.stage] : [], difficulty: form.difficulty, contentType: form.contentType, language: form.language, knowledgePoints: [form.knowledge.trim()], curriculumTags: [course.curriculum.textbookVersion || course.curriculum.syllabusTitle].filter(Boolean), knowledgePointIds: [form.knowledge.trim()], recommendation: '这是你主动添加的链接，内容与适用性尚未人工验证。', humanVerified: false, reviewedAt: '', verificationNote: '用户提供，尚未人工验证。', url: form.url.trim(), status: '可用', userProvided: true, healthStatus: 'unknown', lastCheckedAt: '', originalCourseName: course.name, province: course.curriculum.province, textbookVersion: course.curriculum.textbookVersion, major: course.curriculum.major, chapter: form.knowledge.trim(), officialOrOriginal: null, reposted: null, originalSourceNote: '用户主动提交，等待人工审核来源归属。', publishedAt: '', reviewer: '', suitableTaskTypes: [form.contentType],
    }
    updateData(current => ({ ...current, resources: [...current.resources, resource], resourceEvents: [...current.resourceEvents, { id: crypto.randomUUID(), resourceId: resource.id, courseId: course.id, type: 'saved', occurredAt: localTimestamp(), detail: '用户提交个人资源链接' }] }))
    setForm({ title: '', author: '', url: '', duration: '30', courseId: form.courseId, knowledge: '', contentType: '文章/讲义', language: '中文', difficulty: '基础' }); setShowForm(false)
    notify(data.settings.onlyHumanVerified ? '个人资源已保存；关闭“仅人工审核”即可看到它。' : '个人资源链接已保存。')
  }

  return <div className="page resources-page"><PageHeader eyebrow="学习资源" title="只推荐与当前课程真正相关的内容" description="这里搜索的是人工维护目录和你主动添加的链接，不是全网搜索；外部内容始终回原平台观看。" actions={<button className="button primary" onClick={() => setShowForm(value => !value)}><Icon name="plus" /> {showForm ? '收起表单' : '添加我的资源'}</button>} />
    <CourseSwitcher courses={data.courses} value={courseId} onChange={value => { setCourseId(value); setKnowledge('全部'); setShowAll(false) }} />
    <InlineNotice>不会抓取、下载或重新托管哔哩哔哩、抖音等平台视频。审核日期与来源会明确展示。</InlineNotice>
    {dismissedId && <InlineNotice tone="success">资源已隐藏，已有任务保持不变。<button className="inline-action" onClick={undoDismiss}>撤销</button></InlineNotice>}
    {lastAddedChangeSet && <InlineNotice tone="success">资源任务已加入指定课程与节次。<button className="inline-action" onClick={undoAdd}>撤销</button></InlineNotice>}
    {showForm && <section className="resource-form"><div className="form-grid three"><label className="field"><span>资源标题</span><input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label className="field"><span>平台或作者</span><input value={form.author} onChange={event => setForm({ ...form, author: event.target.value })} /></label><label className="field"><span>原始链接</span><input type="url" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} placeholder="https://" /></label><label className="field"><span>对应课程</span><select value={form.courseId} onChange={event => setForm({ ...form, courseId: event.target.value })}><option value="">请选择</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className="field"><span>知识点</span><input value={form.knowledge} onChange={event => setForm({ ...form, knowledge: event.target.value })} /></label><label className="field"><span>预计时长（分钟）</span><input type="number" min="1" max="600" value={form.duration} onChange={event => setForm({ ...form, duration: event.target.value })} /></label><label className="field"><span>内容类型</span><select value={form.contentType} onChange={event => setForm({ ...form, contentType: event.target.value as ResourceContentType })}>{contentTypes.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>难度</span><select value={form.difficulty} onChange={event => setForm({ ...form, difficulty: event.target.value as ResourceDifficulty })}>{difficulties.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>语言</span><input value={form.language} onChange={event => setForm({ ...form, language: event.target.value })} /></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-inline-actions"><button className="button secondary" onClick={() => { setShowForm(false); setError('') }}>取消</button><button className="button primary" onClick={saveOwnResource}>保存资源</button></div></section>}
    <section className="resource-filters" aria-label="资源筛选"><label className="field search-field"><span>关键词搜索（人工目录）</span><input name="resource-search" autoComplete="off" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="例如：函数极限…" /></label><label className="field"><span>知识点</span><select name="resource-knowledge" value={knowledge} onChange={event => setKnowledge(event.target.value)}><option>全部</option>{knowledgeOptions.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>难度</span><select name="resource-difficulty-filter" value={difficulty} onChange={event => setDifficulty(event.target.value)}><option>全部</option>{difficulties.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>时长</span><select name="resource-duration-filter" value={duration} onChange={event => setDuration(event.target.value)}><option>全部</option><option>短于 15 分钟</option><option>15–45 分钟</option><option>45 分钟以上</option></select></label><label className="field"><span>内容类型</span><select name="resource-content-filter" value={contentType} onChange={event => setContentType(event.target.value)}><option>全部</option>{contentTypes.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>平台</span><select name="resource-platform-filter" value={platform} onChange={event => setPlatform(event.target.value)}><option>全部</option>{platforms.filter(value => value !== '全部').map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>排序</span><select name="resource-sort" value={sort} onChange={event => setSort(event.target.value as ResourceSort)}>{(['综合推荐', '播放最多', '收藏最多', '最新审核'] as ResourceSort[]).map(value => <option key={value}>{value}</option>)}</select></label><button type="button" className={`verified-filter ${verifiedOnly ? 'active' : ''}`} aria-pressed={verifiedOnly} onClick={() => setVerifiedOnly(value => !value)}>仅人工审核</button></section>
    {resources.length === 0 ? <EmptyState title="人工审核目录暂未覆盖当前筛选" description="下方仍提供基于课程事实生成的检索建议；它们不会混入人工审核目录。" action={<div className="empty-actions"><button className="button secondary" onClick={() => { setKnowledge('全部'); setDifficulty('全部'); setDuration('全部'); setContentType('全部'); setPlatform('全部'); setVerifiedOnly(false); setSearch('') }}>清除筛选</button></div>} /> : <>
      <div className="resource-grid">{visibleResources.map(resource => {
        const inPlan = data.tasks.some(task => task.resourceId === resource.id && task.courseId === courseId && task.status !== '已完成')
        const why = selectedDiagnosis ? `适合当前“${selectedDiagnosis.priorityProblem}”问题和 ${selectedDiagnosis.learningStages[0]?.title || '当前阶段'}。${resource.recommendation}` : resource.recommendation
        const bili = resource.bilibili
        const alternative = resource.healthStatus === 'unavailable' ? bilibiliAlternatives(data, resource)[0] : undefined
        const ranking = selectedCourse && bili ? bilibiliRecommendationScore(resource, selectedCourse, knowledge === '全部' ? selectedDiagnosis?.weakKnowledgePoints[0] ?? '' : knowledge) : null
        const statsPending = Boolean(bili && [bili.viewCount, bili.likeCount, bili.favoriteCount].some(value => value === null))
        return <article className={`resource-card ${bili ? 'bilibili-card' : ''}`} key={resource.id}>
          {bili && <div className="bilibili-cover">{bili.coverUrl ? <img src={bili.coverUrl} alt={`${resource.title}视频封面`} /> : <div role="img" aria-label="视频封面尚未纳入人工快照"><span>哔哩哔哩</span><strong>{bili.bvid}</strong><small>封面待人工快照更新</small></div>}</div>}
          <header><span className="platform-badge">{resource.platform}</span><span className={resource.humanVerified ? 'verified' : 'unverified'}>{bili ? `${bili.reviewStatus} · ${bili.reviewedAt}` : resource.humanVerified ? `人工审核 · ${resource.reviewedAt}` : '用户提供 · 未审核'}</span></header>
          <h2>{resource.title}</h2>
          <p className="resource-author">{resource.author} · {bili?.durationText ?? (resource.durationMin > 0 ? `${resource.durationMin} 分钟` : '按课程安排')} · {resource.language}</p>
          <div className="resource-meta"><span>{resource.contentType}</span><span>{resource.difficulty}</span><span>{resource.domainCategory}</span>{ranking && <span>相关度 {ranking.score}</span>}</div>
          {bili && <div className="bilibili-stats" aria-label="平台热度快照">{statsPending ? <span>热度数据待更新</span> : <><span>播放 {bili.viewCount?.toLocaleString('zh-CN')}</span><span>点赞 {bili.likeCount?.toLocaleString('zh-CN')}</span><span>收藏 {bili.favoriteCount?.toLocaleString('zh-CN')}</span></>}<small>{bili.statsSnapshotAt ? `采集于 ${bili.statsSnapshotAt}` : '尚无带日期的统计快照'}</small></div>}
          <dl><div><dt>对应知识点</dt><dd>{resource.knowledgePoints.join('、')}</dd></div><div><dt>适合基础</dt><dd>{bili?.suitableFoundation ?? resource.suitableStage}</dd></div>{bili && <div><dt>任务用途</dt><dd>{bili.taskUse}</dd></div>}<div><dt>为什么适合你</dt><dd>{why}</dd></div><div><dt>来源说明</dt><dd>{resource.verificationNote || '尚无补充说明'}</dd></div></dl>
          {resource.healthStatus === 'unavailable' && <InlineNotice tone="error">原视频已标记失效。{alternative ? `可改用“${alternative.title}”。` : '当前没有同课程替代资源。'}</InlineNotice>}
          <div className="resource-actions">{resource.healthStatus === 'unavailable' ? <button className="button secondary" disabled>原视频不可用</button> : <button type="button" className="button secondary" onClick={() => setExternalTarget({ url: resource.url, label: resource.title, resource })}>{bili ? '查看原视频' : '原始来源'} <Icon name="external" size={15} /></button>}<button className="button primary" onClick={() => alternative ? setSearch(alternative.title) : openAdd(resource)} disabled={inPlan || resource.healthStatus === 'unavailable' && !alternative}>{alternative ? '查看替代资源' : inPlan ? '已在计划中' : '加入计划'}</button></div>
          {bili?.openedAt && <small className="opened-note">已打开于 {new Date(bili.openedAt).toLocaleString('zh-CN')}，不代表已观看</small>}
          <div className="resource-secondary-actions"><button type="button" onClick={() => updateResourceStatus(resource, '稍后学习')} disabled={resource.status === '稍后学习'}>{resource.status === '稍后学习' ? '已稍后学习' : '稍后学习'}</button><button type="button" onClick={() => updateResourceStatus(resource, '已完成')} disabled={resource.status === '已完成'}>{resource.status === '已完成' ? '已完成' : '标记已完成'}</button><button type="button" onClick={() => dismissResource(resource)}>不感兴趣</button></div>
        </article>
      })}</div>
      {resources.length > 12 && <button className="button secondary show-more-resources" onClick={() => setShowAll(value => !value)}>{showAll ? '收起资源' : `加载更多（最多显示 ${Math.min(30, resources.length)} 条）`}</button>}
    </>}
    <section className="resource-suggestions" aria-labelledby="resource-suggestion-title">
      <div className="section-title"><div><span className="section-kicker">未审核检索建议</span><h2 id="resource-suggestion-title">去原平台继续查找</h2></div><p>{mockResourceProvider.available ? '资源服务已连接。' : '当前没有资源后端；这里只生成检索词，不伪造视频标题、作者、链接或热度。'}</p></div>
      {searchSuggestions.blockedReason ? <InlineNotice>{searchSuggestions.blockedReason}</InlineNotice> : <><div className="suggestion-grid">{visibleSuggestions.map(suggestion => <article className="search-suggestion-card" key={suggestion.id}><header><span>哔哩哔哩</span><strong>搜索候选 · 待审核</strong></header><h3>{suggestion.query}</h3><dl><div><dt>适用场景</dt><dd>{suggestion.scene}</dd></div><div><dt>看完后练习</dt><dd>{suggestion.afterWatchPractice}</dd></div></dl><div><button type="button" className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(suggestion.query); notify('检索词已复制。') } catch { notify('复制失败，请手动选择检索词。', 'error') } }}>复制检索词</button><button type="button" className="button primary" onClick={() => setExternalTarget({ url: bilibiliSearchUrl(suggestion.query), label: suggestion.query })}>去 B 站搜索 <Icon name="external" size={15} /></button></div></article>)}</div>{searchSuggestions.suggestions.length > 12 && <button type="button" className="button secondary show-more-resources" onClick={() => setShowAllSuggestions(value => !value)}>{showAllSuggestions ? '收起搜索候选' : `加载更多搜索候选（共 ${searchSuggestions.suggestions.length} 条）`}</button>}</>}
    </section>
    {addingResource && <Modal title="加入学习计划" description={`选择「${addingResource.title}」对应的课程、知识点与具体节次。`} onClose={() => setAddingResource(null)} footer={<><button className="button secondary" onClick={() => setAddingResource(null)}>取消</button><button className="button primary" onClick={addToPlan}>加入计划</button></>}><div className="form-grid two"><label className="field"><span>目标课程</span><select name="target-course" value={targetCourseId} onChange={event => { setTargetCourseId(event.target.value); setTargetStage('') }}><option value="">请选择</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className="field"><span>章节 / 知识点</span><input name="target-knowledge" value={targetKnowledge} onChange={event => setTargetKnowledge(event.target.value)} /></label><label className="field"><span>指定日期</span><input name="target-date" type="date" value={targetDate} onChange={event => { setTargetDate(event.target.value); setTargetStage('') }} /></label><label className="field"><span>具体节次</span><select name="target-slot" value={targetSlotId} disabled={!targetDate} onChange={event => setTargetSlotId(event.target.value)}>{data.schedule.timeSlots.filter(slot => slot.enabled).map(slot => <option key={slot.id} value={slot.id}>{slot.label} · {slot.start}–{slot.end}</option>)}</select></label><label className="field full-span"><span>观看后的练习 / 成果物</span><input name="practice-task" value={practiceTask} onChange={event => setPracticeTask(event.target.value)} /></label><label className="field full-span"><span>或选择学习阶段</span><select name="target-stage" value={targetStage} disabled={!targetCourseId} onChange={event => { setTargetStage(event.target.value); if (event.target.value) setTargetDate('') }}><option value="">不按阶段</option>{(data.diagnoses[targetCourseId]?.learningStages ?? []).map((stage, index) => <option key={`${stage.week}-${stage.title}-${index}`} value={stage.week}>{stage.week} · {stage.title}</option>)}</select></label></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Modal>}
    {externalTarget && <Modal title="即将离开假期跃迁" description="外部内容将在原平台的新标签页中打开。" onClose={() => setExternalTarget(null)} footer={<><button type="button" className="button secondary" onClick={() => setExternalTarget(null)}>取消</button><a className="button primary" href={externalTarget.url} target="_blank" rel="noopener noreferrer" onClick={() => { if (externalTarget.resource) recordOpen(externalTarget.resource); setExternalTarget(null) }}>继续打开</a></>}><p>来源：{externalTarget.resource?.platform ?? '哔哩哔哩搜索'} · {externalTarget.label}</p><InlineNotice>打开链接只记录“已打开原始来源”，不会自动标记为已观看、已完成或计入学习时长。</InlineNotice></Modal>}
  </div>
}
