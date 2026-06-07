import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import { ProtectedRoute } from './components/ProtectedRoute'
import LoginPage from './components/LoginPage'
import WorkerDashboard from './components/worker/WorkerDashboard'
import AdminDashboard from './components/admin/AdminDashboard'

export default function App() {
  const fetchMe = useAuthStore(s => s.fetchMe)
  const user = useAuthStore(s => s.user)
  const initTheme = useThemeStore(s => s.init)

  useEffect(() => {
    initTheme()
    fetchMe()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/worker" element={
          <ProtectedRoute role="worker">
            <WorkerDashboard />
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />

        {/* Root redirect based on role */}
        <Route path="/" element={
          user
            ? <Navigate to={user.role === 'admin' ? '/admin' : '/worker'} replace />
            : <Navigate to="/login" replace />
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
