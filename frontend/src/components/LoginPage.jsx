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
      backgroundImage: 'radial-gradient(ellipse at 25% 35%, rgba(29,78,216,0.07), transparent 55%), radial-gradient(ellipse at 75% 70%, rgba(5,150,105,0.05), transparent 50%)',
    }}>
      <div style={{ width: '100%', maxWidth: 380, animation: 'fadeUp 0.5s ease' }}>

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* AİİИDUCTION Logo */}
          <div style={{ marginBottom: 22, display: 'inline-block' }}>
            <svg width="220" height="56" viewBox="0 0 220 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="lg1" x1="0" y1="0" x2="220" y2="56" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="var(--primary)"/>
                  <stop offset="60%" stopColor="#a78bfa"/>
                  <stop offset="100%" stopColor="#38bdf8"/>
                </linearGradient>
                <linearGradient id="lg2" x1="0" y1="0" x2="220" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15"/>
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05"/>
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2.5" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* Background pill */}
              <rect x="1" y="1" width="218" height="54" rx="12" fill="url(#lg2)" stroke="url(#lg1)" strokeWidth="1.2" strokeOpacity="0.4"/>

              {/* Decorative left circuit lines */}
              <line x1="10" y1="28" x2="18" y2="28" stroke="url(#lg1)" strokeWidth="1" strokeOpacity="0.6"/>
              <circle cx="10" cy="28" r="1.5" fill="var(--primary)" fillOpacity="0.8"/>
              <line x1="14" y1="20" x2="14" y2="36" stroke="url(#lg1)" strokeWidth="0.7" strokeOpacity="0.3"/>

              {/* Decorative right circuit lines */}
              <line x1="202" y1="28" x2="210" y2="28" stroke="url(#lg1)" strokeWidth="1" strokeOpacity="0.6"/>
              <circle cx="210" cy="28" r="1.5" fill="#38bdf8" fillOpacity="0.8"/>
              <line x1="206" y1="20" x2="206" y2="36" stroke="url(#lg1)" strokeWidth="0.7" strokeOpacity="0.3"/>

              {/* Top micro-label */}
              <text x="110" y="13" textAnchor="middle" fontFamily="'Courier New', monospace" fontSize="6.5" letterSpacing="4" fill="url(#lg1)" fillOpacity="0.7" fontWeight="600">WORKFORCE</text>

              {/* Main logo text */}
              <text
                x="110" y="37"
                textAnchor="middle"
                fontFamily="'Georgia', serif"
                fontSize="19"
                fontWeight="700"
                fontStyle="italic"
                letterSpacing="3.5"
                filter="url(#glow)"
                fill="url(#lg1)"
              >AİİИDUCTION</text>

              {/* Bottom tagline */}
              <text x="110" y="50" textAnchor="middle" fontFamily="'Courier New', monospace" fontSize="6" letterSpacing="2.5" fill="url(#lg1)" fillOpacity="0.5">POWERED BY NEURAL</text>

              {/* Corner accents */}
              <path d="M1 14 L1 2 L13 2" stroke="url(#lg1)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" fill="none"/>
              <path d="M207 2 L219 2 L219 14" stroke="url(#lg1)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" fill="none"/>
              <path d="M1 42 L1 54 L13 54" stroke="url(#lg1)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" fill="none"/>
              <path d="M207 54 L219 54 L219 42" stroke="url(#lg1)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" fill="none"/>
            </svg>
          </div>
          <div style={{ fontSize: 34, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.2 }}>
            Track work.<br />Verify results.<br /><em style={{ color: 'var(--primary)' }}>Powered by Neural.</em>
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

          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textAlign: 'center', lineHeight: 1.7 }}>
            Contact your admin for login credentials
          </div>
        </div>
      </div>
    </div>
  )
}
