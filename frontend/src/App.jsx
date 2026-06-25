import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import { ProtectedRoute } from './components/ProtectedRoute'
import HomePage from './components/public/HomePage'
import ApplyPage from './components/public/ApplyPage'
import AboutPage from './components/public/AboutPage'
import RegisterPage from './components/public/RegisterPage'
import LoginPage from './components/LoginPage'
import WorkerDashboard from './components/worker/WorkerDashboard'
import AdminDashboard from './components/admin/AdminDashboard'
import ClientDashboard from './components/client/ClientDashboard'

export default function App() {
  const fetchMe = useAuthStore(s => s.fetchMe)
  const user = useAuthStore(s => s.user)
  const initTheme = useThemeStore(s => s.init)

  useEffect(() => {
    initTheme()
    fetchMe()
  }, [])

  const roleHome = user
    ? user.role === 'admin' ? '/admin'
    : user.role === 'client' ? '/client'
    : '/worker'
    : null

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Protected */}
        <Route path="/worker" element={
          <ProtectedRoute role="worker"><WorkerDashboard /></ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/client" element={
          <ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>
        } />

        {/* Dashboard shortcut */}
        <Route path="/dashboard" element={
          roleHome ? <Navigate to={roleHome} replace /> : <Navigate to="/login" replace />
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
