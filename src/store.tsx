import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { initialData, STORAGE_KEY } from './data.ts'
import type { AppData } from './types.ts'

type ToastKind = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; kind: ToastKind }

interface StoreValue {
  data: AppData
  updateData: (updater: (current: AppData) => AppData) => void
  resetData: () => void
  notify: (message: string, kind?: ToastKind) => void
  storageError: string
}

const StoreContext = createContext<StoreValue | null>(null)

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    if (parsed.version !== 1) return initialData()
    const fallback = initialData()
    return {
      ...fallback,
      ...parsed,
      schedule: { ...fallback.schedule, ...parsed.schedule },
      progress: { ...fallback.progress, ...parsed.progress },
      settings: { ...fallback.settings, ...parsed.settings },
      resources: Array.isArray(parsed.resources) ? parsed.resources : fallback.resources,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
      courses: Array.isArray(parsed.courses) ? parsed.courses : fallback.courses,
      coachMessages: Array.isArray(parsed.coachMessages) ? parsed.coachMessages : fallback.coachMessages,
      planChanges: Array.isArray(parsed.planChanges) ? parsed.planChanges : fallback.planChanges,
    } as AppData
  } catch {
    return initialData()
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [storageError, setStorageError] = useState('')

  const persist = useCallback((next: AppData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageError('')
    } catch {
      setStorageError('浏览器未能保存数据，请检查隐私模式或存储空间。')
    }
  }, [])

  const updateData = useCallback((updater: (current: AppData) => AppData) => {
    setData(current => {
      const next = updater(current)
      queueMicrotask(() => persist(next))
      return next
    })
  }, [persist])

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.round(Math.random() * 1000)
    setToasts(items => [...items, { id, message, kind }])
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 2600)
  }, [])

  const resetData = useCallback(() => {
    const next = initialData()
    setData(next)
    persist(next)
    notify('本地数据已清除。', 'success')
  }, [notify, persist])

  const value = useMemo(() => ({ data, updateData, resetData, notify, storageError }), [data, updateData, resetData, notify, storageError])

  return <StoreContext.Provider value={value}>
    {children}
    <div className="toast-stack" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className={`toast ${toast.kind}`} role="status">{toast.message}</div>)}
    </div>
  </StoreContext.Provider>
}

export const useStore = () => {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore 必须在 StoreProvider 内使用。')
  return value
}
