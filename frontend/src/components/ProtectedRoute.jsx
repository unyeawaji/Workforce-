import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export function ProtectedRoute({ children, role }) {
  const user = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)

  if (!token || !user) return <Navigate to="/login" replace />
  if (role && user.role !== role) {
    const dest = user.role === 'admin' ? '/admin' : user.role === 'client' ? '/client' : '/worker'
    return <Navigate to={dest} replace />
  }
  return children
}
