import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components.tsx'
import { StoreProvider } from './store.tsx'
import Diagnosis from './pages/Diagnosis.tsx'
import Landing from './pages/Landing.tsx'
import Onboarding from './pages/Onboarding.tsx'
import Plan from './pages/Plan.tsx'
import Progress from './pages/Progress.tsx'
import Resources from './pages/Resources.tsx'
import Settings from './pages/Settings.tsx'
import Today from './pages/Today.tsx'

export default function App() {
  return <StoreProvider><AppLayout><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/onboarding" element={<Onboarding />} />
    <Route path="/today" element={<Today />} />
    <Route path="/diagnosis" element={<Diagnosis />} />
    <Route path="/plan" element={<Plan />} />
    <Route path="/resources" element={<Resources />} />
    <Route path="/progress" element={<Progress />} />
    <Route path="/weekly-review" element={<Navigate to="/progress" replace />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppLayout></StoreProvider>
}
