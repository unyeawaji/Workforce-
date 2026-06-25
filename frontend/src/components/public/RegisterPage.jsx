import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { invitesApi } from '../../lib/api'
import { useThemeStore } from '../../store/themeStore'

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 7 }}>
        {label}
      </label>
      {children}
      {error && <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 5, fontWeight: 500 }}>{error}</div>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 'var(--r)',
  border: '1.5px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)',
  fontSize: 14, fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.15s',
}

export default function RegisterPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const dark = useThemeStore(s => s.dark)
  const token = params.get('token')

  const [status, setStatus] = useState('validating') // validating | valid | invalid | expired | done
  const [emailHint, setEmailHint] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    invitesApi.validate(token)
      .then(r => {
        setEmailHint(r.data.email_hint || '')
        setForm(f => ({ ...f, email: r.data.email_hint || '' }))
        setStatus('valid')
      })
      .catch(err => {
        const detail = err.response?.data?.detail || ''
        setStatus(detail.includes('expired') ? 'expired' : 'invalid')
      })
  }, [token])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Full name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    return e
  }

  const handleSubmit = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true); setServerError('')
    try {
      await invitesApi.register({ token, name: form.name, email: form.email, password: form.password })
      setStatus('done')
    } catch (err) {
      setServerError(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── States ──────────────────────────────────────────────────────────────────

  if (status === 'validating') return (
    <Shell dark={dark}>
      <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Validating invite...</div>
    </Shell>
  )

  if (status === 'expired') return (
    <Shell dark={dark}>
      <StatusCard
        icon={<ExpiredIcon />}
        title="Invite expired"
        body="This invite link is no longer valid. It was only active for 72 hours. Ask the admin who invited you to generate a new link."
        action={{ label: 'Go to sign in', onClick: () => nav('/login') }}
      />
    </Shell>
  )

  if (status === 'invalid') return (
    <Shell dark={dark}>
      <StatusCard
        icon={<InvalidIcon />}
        title="Invalid invite"
        body="This invite link is not recognised or has already been used. Contact the admin who sent it."
        action={{ label: 'Go to sign in', onClick: () => nav('/login') }}
      />
    </Shell>
  )

  if (status === 'done') return (
    <Shell dark={dark}>
      <StatusCard
        icon={<SuccessIcon />}
        title="Account created"
        body="Your admin account is ready. Sign in to access your dashboard."
        action={{ label: 'Sign in', onClick: () => nav('/login') }}
        success
      />
    </Shell>
  )

  return (
    <Shell dark={dark}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', padding: '36px 32px',
        boxShadow: 'var(--shadow)', width: '100%', maxWidth: 440,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--primary-s)', color: 'var(--primary)',
            border: '1px solid var(--primary-b)',
            borderRadius: 'var(--r-full)', padding: '4px 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: 'uppercase', marginBottom: 16,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} />
            Admin Invite
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, marginBottom: 6, color: 'var(--text)' }}>
            Create your admin account
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
            You've been invited to join AI Induction as an administrator.
            {emailHint && <> This invite was sent to <strong style={{ color: 'var(--text2)' }}>{emailHint}</strong>.</>}
          </div>
        </div>

        {serverError && (
          <div style={{
            background: 'var(--rose-s)', border: '1px solid var(--rose-b)',
            color: 'var(--rose)', borderRadius: 'var(--r)', padding: '11px 14px',
            marginBottom: 18, fontSize: 13, fontWeight: 500,
          }}>{serverError}</div>
        )}

        <Field label="Full Name" error={errors.name}>
          <input style={inputStyle} value={form.name} onChange={set('name')} placeholder="Jane Smith"
            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
            onBlur={e => e.target.style.borderColor = errors.name ? 'var(--rose)' : 'var(--border)'} />
        </Field>

        <Field label="Email Address" error={errors.email}>
          <input style={inputStyle} type="email" value={form.email} onChange={set('email')}
            placeholder="jane@company.com"
            readOnly={!!emailHint}
            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
            onBlur={e => e.target.style.borderColor = errors.email ? 'var(--rose)' : 'var(--border)'}
            style={{ ...inputStyle, background: emailHint ? 'var(--surface2)' : 'var(--surface)', cursor: emailHint ? 'not-allowed' : 'text' }} />
        </Field>

        <Field label="Password" error={errors.password}>
          <input style={inputStyle} type="password" value={form.password} onChange={set('password')}
            placeholder="Min. 8 characters"
            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
            onBlur={e => e.target.style.borderColor = errors.password ? 'var(--rose)' : 'var(--border)'} />
        </Field>

        <Field label="Confirm Password" error={errors.confirm}>
          <input style={inputStyle} type="password" value={form.confirm} onChange={set('confirm')}
            placeholder="Repeat your password"
            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
            onBlur={e => e.target.style.borderColor = errors.confirm ? 'var(--rose)' : 'var(--border)'} />
        </Field>

        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', background: loading ? 'var(--primary-b)' : 'var(--primary)',
          border: 'none', color: '#fff', padding: '13px',
          borderRadius: 'var(--r-lg)', cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-sans)',
          marginTop: 4, transition: 'background 0.15s',
        }}>
          {loading ? 'Creating account...' : 'Create Admin Account'}
        </button>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Sign in</a>
        </div>
      </div>
    </Shell>
  )
}

// ── Shared layout shell ────────────────────────────────────────────────────────
function Shell({ dark, children }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px', fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#fff',
        }}>A</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.4, color: 'var(--text)' }}>AI Induction</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
            Powered by Neural
          </span>
        </div>
      </div>
      {children}
    </div>
  )
}

function StatusCard({ icon, title, body, action, success }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 400 }}>
      <div style={{ margin: '0 auto 20px' }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 10, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.75, marginBottom: 28 }}>{body}</div>
      <button onClick={action.onClick} style={{
        background: 'var(--primary)', border: 'none', color: '#fff',
        padding: '11px 28px', borderRadius: 'var(--r-lg)',
        cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-sans)',
      }}>{action.label}</button>
    </div>
  )
}

function SuccessIcon() {
  return (
    <div style={{
      width: 56, height: 56, borderRadius: '50%', margin: '0 auto',
      background: 'var(--emerald-s)', border: '1px solid var(--emerald-b)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  )
}

function ExpiredIcon() {
  return (
    <div style={{
      width: 56, height: 56, borderRadius: '50%', margin: '0 auto',
      background: 'var(--amber-s)', border: '1px solid var(--amber-b)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    </div>
  )
}

function InvalidIcon() {
  return (
    <div style={{
      width: 56, height: 56, borderRadius: '50%', margin: '0 auto',
      background: 'var(--rose-s)', border: '1px solid var(--rose-b)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </div>
  )
}
