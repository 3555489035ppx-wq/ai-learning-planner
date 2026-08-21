import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { revertChangeSet } from './changeSets.ts'
import { localTimestamp } from './dateUtils.ts'
import { localPlanningProvider } from './providers.ts'
import { stableCourseOrder } from './courseOrder.ts'
import { useStore } from './store.tsx'
import type { Course, PlanAdjustment } from './types.ts'

const icons: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5v7A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-7Z M9 21v-6h6v6',
  diagnosis: 'M5 4h14v16H5z M8 8h8M8 12h5M8 16h3',
  plan: 'M5 4h14M5 10h14M5 16h9 M3.5 3.5h17v17h-17z',
  resources: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z M4 5.5v16',
  progress: 'M4 19V12m5 7V5m5 14v-9m5 9V7',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13.5l1.2 1.4-2 3.4-1.9-.5a8 8 0 0 1-2.2 1.3L14 21h-4l-.5-1.9a8 8 0 0 1-2.2-1.3l-1.9.5-2-3.4 1.2-1.4a8 8 0 0 1 0-2.6L3.4 9.5l2-3.4 1.9.5a8 8 0 0 1 2.2-1.3l.5-2.3h4l.5 2.3a8 8 0 0 1 2.2 1.3l1.9-.5 2 3.4-1.2 1.4a8 8 0 0 1 0 2.6Z',
  coach: 'M4 5.5h16v11H9l-5 4z M8 9h8M8 13h5',
  mentor: 'M12 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM5 20a7 7 0 0 1 14 0M18 8.5h3M19.5 7v3',
  plus: 'M12 5v14M5 12h14',
  arrow: 'm9 18 6-6-6-6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4 10-10',
  clock: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  external: 'M14 4h6v6M20 4l-9 9M19 13v6H5V5h6',
  trash: 'M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6',
  edit: 'm4 16-.8 4 4-.8L18 8.4 14.6 5 4 16Z M13.8 5.8l3.4 3.4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  undo: 'M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6',
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name] || icons.plan} /></svg>
}

export function Logo() {
  return <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5.5 18h4v-4h4v-4h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.5 6.5h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg></span><span>假期跃迁</span></Link>
}

const primaryNavItems = [
  { to: '/today', label: '今日', icon: 'home' },
  { to: '/plan', label: '假期计划', icon: 'plan' },
  { to: '/coaching', label: '1 对 1 辅导', icon: 'mentor' },
  { to: '/weekly-review', label: '周复盘', icon: 'undo' },
  { to: '/settings', label: '设置', icon: 'settings' },
]

const secondaryNavItems = [
  { to: '/diagnosis', label: '课程诊断', icon: 'diagnosis', description: '补充证据，提高计划置信度' },
  { to: '/coaching', label: '1 对 1 辅导', icon: 'mentor', description: '把具体学习卡点带到一次有结果的会话' },
  { to: '/resources', label: '学习资源', icon: 'resources' },
  { to: '/progress', label: '学习进展', icon: 'progress', description: '查看真实任务、测验和时长证据' },
  { to: '/progress?view=trend', label: '课程趋势', icon: 'progress', description: '按课程查看可比较的真实时间点' },
]

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1 data-page-title tabIndex={-1}>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="plan" /></div><h2>{title}</h2><p>{description}</p>{action}</div>
}

export function InlineNotice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error'; children: ReactNode }) {
  return <div className={`inline-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function WeekNavigator({ label, isCurrent, onPrevious, onNext, onCurrent }: { label: string; isCurrent: boolean; onPrevious: () => void; onNext: () => void; onCurrent: () => void }) {
  return <nav className="week-switcher" aria-label="周日期导航"><button className="icon-button" aria-label="上一周" onClick={onPrevious}><Icon name="chevron-left" /></button><strong aria-live="polite">{label}</strong><button className="icon-button" aria-label="下一周" onClick={onNext}><Icon name="chevron-right" /></button><button className="text-button" onClick={onCurrent} disabled={isCurrent} hidden={isCurrent}>回到本周</button></nav>
}

const focusableSelector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ title, description, onClose, children, footer }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
    window.requestAnimationFrame(() => focusables()[0]?.focus())
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
      document.body.style.overflow = originalOverflow
      previous?.focus()
    }
  }, [])
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}><header><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header><div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>
}

export function CourseSwitcher({ courses, value, onChange, includeAll = false, label = '选择课程', action }: { courses: Course[]; value: string; onChange: (id: string) => void; includeAll?: boolean; label?: string; action?: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const ordered = stableCourseOrder(courses)
  const filtered = query.trim() ? ordered.filter(course => course.name.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN'))) : ordered
  const visible = courses.length <= 6 || expanded ? filtered : filtered.slice(0, 6)
  return <div className="course-switcher-wrap">{expanded && courses.length > 6 ? <label className="course-switcher-search"><span className="visually-hidden">搜索课程</span><input type="search" name="course-search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索课程…" /></label> : null}<div className="course-switcher-row"><div className="course-switcher" role="group" aria-label={label}>{includeAll && <button type="button" aria-pressed={value === ''} className={value === '' ? 'active' : ''} onClick={() => onChange('')}>全部课程</button>}{visible.map(course => <button type="button" key={course.id} aria-pressed={value === course.id} className={value === course.id ? 'active' : ''} onClick={() => onChange(course.id)}>{course.name || '未命名课程'}</button>)}{courses.length > 6 && <button type="button" className="more-courses" aria-expanded={expanded} onClick={() => { setExpanded(current => !current); setQuery('') }}>{expanded ? '收起课程' : `更多课程（${Math.max(0, courses.length - 6)}）`}</button>}</div>{action}</div></div>
}

function CoachPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, updateData, notify } = useStore()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PlanAdjustment | null>(null)
  const [lastAppliedChangeSetId, setLastAppliedChangeSetId] = useState(() => data.lastCoachChangeSetId)
  const panelRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const items = () => [...(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
    window.requestAnimationFrame(() => items()[0]?.focus())
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const list = items(); if (!list.length) return
      if (event.shiftKey && document.activeElement === list[0]) { event.preventDefault(); list[list.length - 1].focus() }
      if (!event.shiftKey && document.activeElement === list[list.length - 1]) { event.preventDefault(); list[0].focus() }
    }
    window.addEventListener('keydown', handle)
    return () => { window.removeEventListener('keydown', handle); document.body.style.overflow = originalOverflow }
  }, [open])

  const submit = async (text = prompt) => {
    if (!text.trim() || loading) return
    setLoading(true); setError(''); setPreview(null)
    updateData(current => ({ ...current, coachMessages: [...current.coachMessages, { id: crypto.randomUUID(), role: 'user', text: text.trim(), createdAt: localTimestamp() }] }))
    try {
      const result = await localPlanningProvider.adjustPlan(text, data)
      setPreview(result.data)
      setPrompt('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '调整预览生成失败。')
    } finally { setLoading(false) }
  }

  const applyPreview = () => {
    if (!preview) return
    // React may defer a state-updater callback, so derive the id from the
    // immutable preview before scheduling the update. This keeps the visible
    // undo action tied to the ChangeSet that was just applied.
    const appliedId = preview.changeSet?.id ?? ''
    updateData(current => {
      const nextSchedule = { ...current.schedule, ...preview.schedulePatch }
      const changeSet = preview.changeSet ? { ...preview.changeSet, source: 'coach' as const, changes: preview.schedulePatch ? [...preview.changeSet.changes, { entityId: '__schedule', before: { ...current.schedule }, after: { ...nextSchedule } }] : preview.changeSet.changes } : null
      return { ...current, tasks: preview.tasks, schedule: nextSchedule, courses: preview.coursePatches ? current.courses.map(course => ({ ...course, ...preview.coursePatches?.find(item => item.id === course.id) })) : current.courses, changeSets: changeSet ? [...current.changeSets, changeSet] : current.changeSets, lastCoachChangeSetId: appliedId, coachMessages: [...current.coachMessages, { id: crypto.randomUUID(), role: 'coach', text: preview.message, createdAt: localTimestamp() }], planChanges: [`学习教练：${preview.changeNote}`, ...current.planChanges].slice(0, 50) }
    })
    setLastAppliedChangeSetId(appliedId)
    setPreview(null); notify('调整已应用，可在教练中撤销。')
  }

  const undo = () => {
    const changeSet = data.changeSets.find(item => item.id === lastAppliedChangeSetId && item.source === 'coach' && !item.revertedAt)
    if (!changeSet) return
    updateData(current => ({ ...revertChangeSet(current, changeSet.id), lastCoachChangeSetId: '', planChanges: [`已局部撤销：${changeSet.reason}`, ...current.planChanges] }))
    setLastAppliedChangeSetId(''); notify('已精准撤销这次教练调整，其他后续编辑不受影响。')
  }

  if (!open) return null
  const quickPrompts = ['时间变少', '临时旅行 3 天', '任务太难', '调整课程优先级', '连续未完成', '想减少学习量']
  const undoTarget = data.changeSets.find(item => item.id === lastAppliedChangeSetId && item.source === 'coach' && !item.revertedAt)
  return <div className="coach-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><aside ref={panelRef} className="coach-panel" role="dialog" aria-modal="true" aria-label="学习教练"><header><div><span className="eyebrow">本地规划引擎</span><h2>学习教练</h2><p>会读取当前课程、目标、计划和现实安排；确认后才会修改。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭学习教练"><Icon name="close" /></button></header><div className="coach-messages">{data.coachMessages.slice(-6).map(message => <div key={message.id} className={`coach-message ${message.role}`}><span>{message.role === 'coach' ? '教练' : '你'}</span><p>{message.text}</p></div>)}</div><div className="coach-quick">{quickPrompts.map(item => <button key={item} onClick={() => submit(item)} disabled={loading}>{item}</button>)}</div>{preview && <section className="coach-preview"><span className="section-kicker">变更预览</span><h3>{preview.message}</h3><p>影响 {preview.changedTaskIds.length} 项任务</p><ul>{preview.reasons.slice(0, 4).map(reason => <li key={reason}>{reason}</li>)}</ul><div><button className="button secondary" onClick={() => setPreview(null)}>取消</button><button className="button primary" onClick={applyPreview}>确认应用</button></div></section>}{error && <InlineNotice tone="error">{error}</InlineNotice>}<label className="field"><span>告诉教练发生了什么</span><textarea name="coach-adjustment" autoComplete="off" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：这个星期开始兼职，每晚最多学习 1 小时…" rows={3} /></label><div className="coach-footer"><button className="button secondary" onClick={undo} disabled={!undoTarget} title={undoTarget ? undoTarget.reason : '当前没有可撤销的教练调整'}><Icon name="undo" /> {undoTarget ? `撤销：${undoTarget.reason}` : '没有可撤销的教练调整'}</button><button className="button primary" onClick={() => submit()} disabled={loading || !prompt.trim()}>{loading ? '正在生成预览…' : '预览调整'}</button></div></aside></div>
}

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { data, storageError } = useStore()
  const [coachOpen, setCoachOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const lastCoachTrigger = useRef<HTMLButtonElement | null>(null)
  const plain = location.pathname === '/' || location.pathname === '/onboarding'
  const openCoach = (event: React.MouseEvent<HTMLButtonElement>) => { lastCoachTrigger.current = event.currentTarget; setCoachOpen(true) }
  const closeCoach = () => { setCoachOpen(false); window.requestAnimationFrame(() => lastCoachTrigger.current?.focus()) }
  if (plain) return <>{children}</>
  const avatar = data.settings.avatarDataUrl
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="app-topbar"><div className="app-topbar-inner"><Logo /><nav className="desktop-primary-nav" aria-label="主导航">{primaryNavItems.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `top-nav-item ${isActive ? 'active' : ''}`}><span>{item.label}</span></NavLink>)}</nav><div className="topbar-actions"><button className="coach-search-entry" onClick={openCoach}><Icon name="coach" /><span>学习教练</span><small>调整计划</small></button><button className={`icon-button more-trigger ${moreOpen ? 'active' : ''}`} aria-label="更多功能" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}><Icon name="more" /></button><Link className="topbar-profile" to="/settings?section=profile" aria-label="打开个人资料设置">{avatar ? <img src={avatar} width="32" height="32" alt="" /> : <span>{data.settings.displayName.slice(0, 1) || '学'}</span>}</Link></div></div>{moreOpen && <nav className="desktop-more-menu" aria-label="更多功能">{secondaryNavItems.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)}><Icon name={item.icon} /><span><strong>{item.label}</strong><small>{item.description || '按当前课程筛选和使用'}</small></span></NavLink>)}</nav>}</header>
    <main id="main-content" className="main-area">{storageError && <div className="storage-error" role="alert">{storageError}</div>}{children}</main>
    <button className="floating-coach" onClick={openCoach} aria-label="打开学习教练"><Icon name="coach" /></button>
    <nav className="mobile-nav" aria-label="移动端导航">{primaryNavItems.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} size={19} /><span>{item.label === '假期计划' ? '计划' : item.label}</span></NavLink>)}</nav>
    <CoachPanel open={coachOpen} onClose={closeCoach} />
  </div>
}
