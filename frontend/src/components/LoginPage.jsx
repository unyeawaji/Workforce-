import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getErrorMessage } from '../lib/utils'
import { Button, Input, Alert, Spinner } from './ui'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (!email || !password) { setError('Enter your email and password'); return }
    setLoading(true); setError('')
    try {
      const user = await login(email, password)
      navigate(user.role === 'admin' ? '/admin' : '/worker', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20,
      backgroundImage: 'radial-gradient(ellipse at 25% 35%, color-mix(in srgb, var(--primary) 7%, transparent), transparent 55%), radial-gradient(ellipse at 75% 70%, color-mix(in srgb, var(--emerald) 5%, transparent), transparent 50%)',
    }}>
      <div style={{ width: '100%', maxWidth: 380, animation: 'fadeUp 0.5s ease' }}>

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
            borderRadius: 'var(--r-full)', background: 'var(--primary-s)', border: '1px solid var(--primary-b)',
            marginBottom: 18,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              AİİИDUCTION
            </span>
          </div>
          <div style={{ fontSize: 34, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.2 }}>
            Track work.<br />Verify results.<br /><em style={{ color: 'var(--primary)' }}>Powered by AİİИDUCTION.</em>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 28, boxShadow: 'var(--shadow-lg)',
        }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <Alert message={error} type="error" onClose={() => setError('')} />}
            <Input
              label="Email" type="email" value={email} required
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.io" autoFocus autoComplete="email"
            />
            <Input
              label="Password" type="password" value={password} required
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password"
            />
            <Button variant="primary" size="lg" fullWidth disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <><Spinner size={14} color="#fff" /> Signing in…</> : 'Sign In'}
            </Button>
          </form>

          <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>demo</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textAlign: 'center', lineHeight: 1.7 }}>
            Contact your admin for login credentials
          </div>
        </div>
      </div>
    </div>
  )
}
