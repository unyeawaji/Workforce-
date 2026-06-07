import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Spinner } from './ui'

export function ProtectedRoute({ children, role }) {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return }
    if (role && user.role !== role) {
      navigate(user.role === 'admin' ? '/admin' : '/worker', { replace: true })
    }
  }, [user, role])

  if (!user) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={28} />
    </div>
  )

  return children
}
