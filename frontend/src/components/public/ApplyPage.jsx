import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { PublicNav } from './PublicNav'
import { useThemeStore } from '../../store/themeStore'
import { applicationsApi } from '../../lib/api'

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 600,
        color: 'var(--text2)', marginBottom: 7, letterSpacing: -0.1,
      }}>{label}</label>
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

export default function ApplyPage() {
  const nav = useNavigate()
  const dark = useThemeStore(s => s.dark)
  const [admins, setAdmins] = useState([])
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '', cover_letter: '', admin_id: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => { applicationsApi.listAdmins().then(r => setAdmins(r.data)).catch(() => {}) }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const validate = () => {
    const e = {}
    if (!form.full_name.trim()) e.full_name = 'Name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (!form.admin_id) e.admin_id = 'Please select a team'
    return e
  }

  const handleSubmit = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true); setServerError('')
    try {
      await applicationsApi.submit({
        full_name: form.full_name, email: form.email, password: form.password,
        phone: form.phone || undefined, cover_letter: form.cover_letter || undefined,
        admin_id: parseInt(form.admin_id),
      })
      setSubmitted(true)
    } catch (err) {
      setServerError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  if (submitted) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--emerald-s)', border: '1px solid var(--emerald-b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, margin: '0 auto 24px',
        }}>✓</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, marginBottom: 12, color: 'var(--text)' }}>
          Application submitted
        </h2>
        <p style={{ color: 'var(--text3)', lineHeight: 1.75, marginBottom: 36, fontSize: 15 }}>
          Your account has been created and is pending review. You'll be able to sign in once your manager activates your account.
        </p>
        <button onClick={() => nav('/login')} style={{
          background: 'var(--primary)', border: 'none', color: '#fff',
          padding: '12px 32px', borderRadius: 'var(--r-lg)', cursor: 'pointer',
          fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-sans)',
        }}>Go to sign in</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
      <PublicNav dark={dark} />

      {/* Two-column layout on wider screens, stacks to one column on mobile */}
      <div className="grid-stack-mobile" style={{
        maxWidth: 1020, margin: '0 auto', padding: '60px 24px 80px',
        gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 64, alignItems: 'start',
      }}>
        {/* Left: context */}
        <div style={{ paddingTop: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--primary-s)', color: 'var(--primary)',
            border: '1px solid var(--primary-b)',
            borderRadius: 'var(--r-full)', padding: '4px 14px',
            fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase', marginBottom: 24,
          }}>We're hiring</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.1, marginBottom: 18, color: 'var(--text)' }}>
            Apply for a position
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text3)', lineHeight: 1.75, marginBottom: 36 }}>
            Fill in the form and select which team you're applying to. Your manager will review and activate your account before you can start.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              ['📋', 'Submit your application', 'Takes less than two minutes.'],
              ['✅', 'Manager reviews',          'Your team lead gets notified and approves your account.'],
              ['🚀', 'Start working',            'Log in, clock in, and get started immediately.'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--r)', flexShrink: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: '36px 32px',
          boxShadow: 'var(--shadow)',
        }}>
          {serverError && (
            <div style={{
              background: 'var(--rose-s)', border: '1px solid var(--rose-b)',
              color: 'var(--rose)', borderRadius: 'var(--r)', padding: '12px 16px',
              marginBottom: 20, fontSize: 14, fontWeight: 500,
            }}>{serverError}</div>
          )}

          <Field label="Full Name" error={errors.full_name}>
            <input style={inputStyle} value={form.full_name} onChange={set('full_name')} placeholder="Jane Doe"
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = errors.full_name ? 'var(--rose)' : 'var(--border)'} />
          </Field>

          <Field label="Email Address" error={errors.email}>
            <input style={inputStyle} type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com"
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = errors.email ? 'var(--rose)' : 'var(--border)'} />
          </Field>

          <Field label="Password" error={errors.password}>
            <input style={inputStyle} type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters"
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = errors.password ? 'var(--rose)' : 'var(--border)'} />
          </Field>

          <Field label="Phone (optional)">
            <input style={inputStyle} value={form.phone} onChange={set('phone')} placeholder="+1 555 000 0000"
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </Field>

          <Field label="Team you're applying to" error={errors.admin_id}>
            <select style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237b8394' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: 36 }}
              value={form.admin_id} onChange={set('admin_id')}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = errors.admin_id ? 'var(--rose)' : 'var(--border)'}>
              <option value="">Select a team...</option>
              {admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <Field label="Cover letter / note (optional)">
            <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
              value={form.cover_letter} onChange={set('cover_letter')}
              placeholder="Tell us a bit about yourself and your experience..."
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </Field>

          <button onClick={handleSubmit} disabled={loading} style={{
            width: '100%', background: loading ? 'var(--primary-b)' : 'var(--primary)',
            border: 'none', color: '#fff', padding: '13px',
            borderRadius: 'var(--r-lg)', cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-sans)',
            transition: 'background 0.15s',
          }}>
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  )
}
