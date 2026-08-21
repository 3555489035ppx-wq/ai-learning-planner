import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components.tsx'
import { StoreProvider, useStore } from './store.tsx'
import Landing from './pages/Landing.tsx'

const Onboarding = lazy(() => import('./pages/PlanningSetup.tsx'))
const Today = lazy(() => import('./pages/TodayV4.tsx'))
const Diagnosis = lazy(() => import('./pages/Diagnosis.tsx'))
const Plan = lazy(() => import('./pages/PlanV4.tsx'))
const Resources = lazy(() => import('./pages/Resources.tsx'))
const Progress = lazy(() => import('./pages/ProgressV4.tsx'))
const WeeklyReview = lazy(() => import('./pages/WeeklyReview.tsx'))
const Coaching = lazy(() => import('./pages/Coaching.tsx'))
const Settings = lazy(() => import('./pages/SettingsV4.tsx'))
const Privacy = lazy(() => import('./pages/Legal.tsx').then(module => ({ default: module.Privacy })))
const Terms = lazy(() => import('./pages/Legal.tsx').then(module => ({ default: module.Terms })))
const DesignSystem = lazy(() => import('./pages/DesignSystem.tsx'))

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data } = useStore()
  const location = useLocation()
  if (!data.onboardingCompleted) return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
  return children
}

function RouteFocus() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true }))
  }, [location.pathname])
  return null
}

function RoutedApp() {
  return <AppLayout><RouteFocus /><Suspense fallback={<div className="route-loading" role="status">正在打开页面…</div>}><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/onboarding" element={<Onboarding />} />
    <Route path="/today" element={<ProtectedRoute><Today /></ProtectedRoute>} />
    <Route path="/diagnosis" element={<ProtectedRoute><Diagnosis /></ProtectedRoute>} />
    <Route path="/plan" element={<ProtectedRoute><Plan /></ProtectedRoute>} />
    <Route path="/resources" element={<ProtectedRoute><Resources /></ProtectedRoute>} />
    <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
    <Route path="/weekly-review" element={<ProtectedRoute><WeeklyReview /></ProtectedRoute>} />
    <Route path="/coaching" element={<ProtectedRoute><Coaching /></ProtectedRoute>} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/design-system" element={<DesignSystem />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></AppLayout>
}

export default function App() {
  return <StoreProvider><RoutedApp /></StoreProvider>
}
