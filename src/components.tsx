import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { mockPlanningProvider } from './providers.ts'
import { useStore } from './store.tsx'

const icons: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5v7A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-7Z M9 21v-6h6v6',
  diagnosis: 'M5 4h14v16H5z M8 8h8M8 12h5M8 16h3',
  plan: 'M5 4h14M5 10h14M5 16h9 M3.5 3.5h17v17h-17z',
  resources: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z M4 5.5v16',
  progress: 'M4 19V12m5 7V5m5 14v-9m5 9V7',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13.5l1.2 1.4-2 3.4-1.9-.5a8 8 0 0 1-2.2 1.3L14 21h-4l-.5-1.9a8 8 0 0 1-2.2-1.3l-1.9.5-2-3.4 1.2-1.4a8 8 0 0 1 0-2.6L3.4 9.5l2-3.4 1.9.5a8 8 0 0 1 2.2-1.3L10 3h4l.5 2.3a8 8 0 0 1 2.2 1.3l1.9-.5 2 3.4-1.2 1.4a8 8 0 0 1 0 2.6Z',
  coach: 'M4 5.5h16v11H9l-5 4z M8 9h8M8 13h5',
  plus: 'M12 5v14M5 12h14',
  arrow: 'm9 18 6-6-6-6',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4 10-10',
  clock: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  external: 'M14 4h6v6M20 4l-9 9M19 13v6H5V5h6',
  trash: 'M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6',
  edit: 'm4 16-.8 4 4-.8L18 8.4 14.6 5 4 16Z M13.8 5.8l3.4 3.4',
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name] || icons.plan} /></svg>
}

export function Logo() {
  return <Link to="/" className="brand"><span className="brand-mark"><Icon name="arrow" size={16} /></span><span>假期跃迁</span></Link>
}

const navItems = [
  { to: '/today', label: '今日', icon: 'home' },
  { to: '/diagnosis', label: '课程诊断', icon: 'diagnosis' },
  { to: '/plan', label: '学习计划', icon: 'plan' },
  { to: '/resources', label: '学习资源', icon: 'resources' },
  { to: '/progress', label: '学习进展', icon: 'progress' },
  { to: '/settings', label: '设置', icon: 'settings' },
]

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="plan" /></div><h2>{title}</h2><p>{description}</p>{action}</div>
}

export function InlineNotice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error'; children: ReactNode }) {
  return <div className={`inline-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Modal({ title, description, onClose, children, footer }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header><div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>
}

function CoachPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, updateData, notify } = useStore()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (text = prompt) => {
    if (!text.trim() || loading) return
    setLoading(true)
    setError('')
    const userMessage = { id: crypto.randomUUID(), role: 'user' as const, text: text.trim(), createdAt: new Date().toISOString() }
    updateData(current => ({ ...current, coachMessages: [...current.coachMessages, userMessage] }))
    try {
      const result = await mockPlanningProvider.adjustPlan(text, data)
      updateData(current => ({
        ...current,
        tasks: result.data.tasks,
        coachMessages: [...current.coachMessages, { id: crypto.randomUUID(), role: 'coach', text: result.data.message, createdAt: new Date().toISOString() }],
        planChanges: [result.data.changeNote, ...current.planChanges].slice(0, 8),
      }))
      setPrompt('')
      notify('学习计划已更新。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '调整失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }
  if (!open) return null
  return <aside className="coach-panel" aria-label="学习教练"><header><div><span className="eyebrow">全局入口</span><h2>学习教练</h2><p>本地 Mock Provider · 所有调整会写入计划</p></div><button className="icon-button" onClick={onClose} aria-label="关闭学习教练"><Icon name="close" /></button></header><div className="coach-messages">{data.coachMessages.slice(-6).map(message => <div key={message.id} className={`coach-message ${message.role}`}><span>{message.role === 'coach' ? '教练' : '你'}</span><p>{message.text}</p></div>)}</div><div className="coach-quick"><button onClick={() => submit('我每天最多学习2小时')} disabled={loading}>每天最多 2 小时</button><button onClick={() => submit('我下周有3天旅行')} disabled={loading}>下周旅行 3 天</button><button onClick={() => submit('今天没时间，请延后')} disabled={loading}>延后今天任务</button></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}<label className="field"><span>告诉教练发生了什么</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：周三开始兼职，每晚最多学习 1 小时" rows={3} /></label><button className="button primary full" onClick={() => submit()} disabled={loading || !prompt.trim()}>{loading ? '正在重排…' : '调整我的计划'}</button></aside>
}

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { data, storageError } = useStore()
  const [coachOpen, setCoachOpen] = useState(false)
  const plain = location.pathname === '/' || location.pathname === '/onboarding'
  if (plain) return <>{children}</>
  return <div className="app-shell"><aside className="sidebar"><Logo /><nav aria-label="主导航">{navItems.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav><button className="coach-entry" onClick={() => setCoachOpen(true)}><Icon name="coach" /><span><strong>学习教练</strong><small>用自然语言调整计划</small></span></button><div className="profile-mini"><span>{data.settings.displayName.slice(0, 1)}</span><div><strong>{data.settings.displayName}</strong><small>{data.courses.length} 门关注课程</small></div></div></aside><main className="main-area">{storageError && <div className="storage-error" role="alert">{storageError}</div>}{children}</main><button className="floating-coach" onClick={() => setCoachOpen(true)} aria-label="打开学习教练"><Icon name="coach" /></button><nav className="mobile-nav" aria-label="移动端导航">{navItems.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} size={19} /><span>{item.label}</span></NavLink>)}</nav><CoachPanel open={coachOpen} onClose={() => setCoachOpen(false)} /></div>
}
