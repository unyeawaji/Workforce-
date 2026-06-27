import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PublicNav } from './PublicNav'
import { useThemeStore } from '../../store/themeStore'
import { applicationsApi } from '../../lib/api'

// ── Shared input style ────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 'var(--r)',
  border: '1.5px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)',
  fontSize: 14, fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.15s',
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 7, letterSpacing: -0.1 }}>{label}</label>
      {children}
      {error && <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 5, fontWeight: 500 }}>{error}</div>}
    </div>
  )
}

// ── Position types ────────────────────────────────────────────────────────────
const POSITIONS = [
  {
    id: 'tasker',
    label: 'Tasker',
    emoji: '✅',
    platform: 'AI training platforms',
    desc: 'Complete AI training tasks and data annotation assignments.',
  },
  {
    id: 'onboarding_assessment',
    label: 'Onboarding & Assessment',
    emoji: '📝',
    platform: 'AI training platforms',
    desc: 'Conduct onboarding evaluations and quality assessments for new contractors.',
  },
]

// ── Service tag chip ──────────────────────────────────────────────────────────
const SERVICE_META = {
  account_recovery: { label: 'Account Recovery', emoji: '🔓', color: '#7c3aed' },
  assessment:       { label: 'Assessment',        emoji: '📝', color: '#0891b2' },
  tasker:           { label: 'Tasker',            emoji: '✅', color: '#059669' },
  onboarding:       { label: 'Onboarding',        emoji: '🚀', color: '#d97706' },
}

function ServiceTag({ serviceKey }) {
  const meta = SERVICE_META[serviceKey] || { label: serviceKey, emoji: '🔧', color: 'var(--text3)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: meta.color + '1a', color: meta.color,
      border: `1px solid ${meta.color}33`,
    }}>
      {meta.emoji} {meta.label}
    </span>
  )
}

// ── Admin team card ───────────────────────────────────────────────────────────
function AdminCard({ admin, selected, onSelect }) {
  return (
    <div
      onClick={() => onSelect(admin.id)}
      style={{
        border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--r-xl)', padding: '16px 18px', cursor: 'pointer',
        background: selected ? 'var(--primary-s, rgba(99,102,241,.06))' : 'var(--surface)',
        transition: 'all .15s', marginBottom: 10,
        boxShadow: selected ? '0 0 0 3px var(--primary-b, rgba(99,102,241,.15))' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: admin.services?.length ? 10 : 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'var(--primary)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700,
        }}>{admin.name.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{admin.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Team Manager</div>
        </div>
        {selected && (
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        )}
      </div>
      {admin.services?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {admin.services.map(s => <ServiceTag key={s} serviceKey={s} />)}
        </div>
      )}
      {!admin.services?.length && (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>General team</div>
      )}
    </div>
  )
}

// ── Main Apply Page ────────────────────────────────────────────────────────────
export default function ApplyPage() {
  const nav = useNavigate()
  const dark = useThemeStore(s => s.dark)
  const [admins, setAdmins] = useState([])
  const [step, setStep] = useState(1)   // 1=position, 2=team, 3=details
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '',
    cover_letter: '', admin_id: '', position_type: '',
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    applicationsApi.listAdmins()
      .then(r => {
        // Extra guard: never show system admin / general team even if backend slips one through
        const hireable = (r.data || []).filter(a => !a.is_system_admin)
        setAdmins(hireable)
      })
      .catch(() => {})
  }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const validateStep3 = () => {
    const e = {}
    if (!form.full_name.trim()) e.full_name = 'Name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    return e
  }

  const handleSubmit = async () => {
    const e = validateStep3()
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true); setServerError('')
    try {
      await applicationsApi.submit({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        cover_letter: form.cover_letter || undefined,
        admin_id: parseInt(form.admin_id),
        position_type: form.position_type,
      })
      setSubmitted(true)
    } catch (err) {
      setServerError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const selectedPosition = POSITIONS.find(p => p.id === form.position_type)
  const selectedAdmin    = admins.find(a => a.id === parseInt(form.admin_id))

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ textAlign: 'center', maxWidth: 440, padding: '0 24px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 28px' }}>✓</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.8, marginBottom: 12, color: 'var(--text)' }}>Application submitted!</h2>
        <p style={{ color: 'var(--text3)', lineHeight: 1.75, marginBottom: 12, fontSize: 15 }}>
          You applied for <strong style={{ color: 'var(--text)' }}>{selectedPosition?.label}</strong> on the <strong style={{ color: 'var(--text)' }}>{selectedAdmin?.name}</strong> team.
        </p>
        <p style={{ color: 'var(--text3)', lineHeight: 1.75, marginBottom: 36, fontSize: 14 }}>
          Your account is pending review. You'll be able to sign in once your manager activates it.
        </p>
        <button onClick={() => nav('/login')} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '13px 36px', borderRadius: 'var(--r-lg)', cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-sans)' }}>
          Go to sign in
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
      <PublicNav dark={dark} />

      {/* Hero */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 24px 0', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary-s, rgba(99,102,241,.08))', color: 'var(--primary)', border: '1px solid var(--primary-b, rgba(99,102,241,.2))', borderRadius: 999, padding: '4px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 20 }}>
          We're hiring
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.1, marginBottom: 16 }}>
          Join a team on AI Induction
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text3)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 40px' }}>
          We offer positions in AI task work and contractor assessment. Select a role, pick a team, and apply in minutes.
        </p>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 40 }}>
          {['Choose role', 'Select team', 'Your details'].map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? 'var(--emerald)' : active ? 'var(--primary)' : 'var(--surface)',
                    border: `2px solid ${done ? 'var(--emerald)' : active ? 'var(--primary)' : 'var(--border)'}`,
                    color: done || active ? '#fff' : 'var(--text3)',
                  }}>{done ? '✓' : n}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--primary)' : 'var(--text3)', whiteSpace: 'nowrap' }}>{label}</div>
                </div>
                {i < 2 && <div style={{ width: 48, height: 2, background: step > n ? 'var(--emerald)' : 'var(--border)', margin: '0 6px', marginBottom: 16 }} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step content */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* ── Step 1: Choose position ── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>What type of role are you applying for?</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Both roles are remote and flexible.</div>
            {POSITIONS.map(pos => (
              <div
                key={pos.id}
                onClick={() => setForm(f => ({ ...f, position_type: pos.id }))}
                style={{
                  border: `2px solid ${form.position_type === pos.id ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-xl)', padding: '20px 22px', cursor: 'pointer', marginBottom: 12,
                  background: form.position_type === pos.id ? 'var(--primary-s, rgba(99,102,241,.06))' : 'var(--surface)',
                  boxShadow: form.position_type === pos.id ? '0 0 0 3px var(--primary-b, rgba(99,102,241,.15))' : 'none',
                  transition: 'all .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{pos.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{pos.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginBottom: 6 }}>{pos.platform}</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.55 }}>{pos.desc}</div>
                  </div>
                  {form.position_type === pos.id && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Platform overview */}
            <div style={{ marginTop: 28, marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 14 }}>What you'll be doing</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { emoji: '🔓', title: 'Account Recovery', desc: 'Help suspended or banned contractors restore access to their accounts.' },
                  { emoji: '📝', title: 'Assessment', desc: 'Evaluate and score contractor submissions.' },
                  { emoji: '✅', title: 'Task Completion', desc: 'Complete AI training data tasks — annotation, ranking, and generation.' },
                  { emoji: '🚀', title: 'Onboarding', desc: 'Guide new contractors through platform setup and first tasks.' },
                ].map(({ emoji, title, desc }) => (
                  <div key={title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px' }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{emoji}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => { if (form.position_type) setStep(2) }}
              disabled={!form.position_type}
              style={{ width: '100%', background: form.position_type ? 'var(--primary)' : 'var(--surface)', border: `1.5px solid ${form.position_type ? 'var(--primary)' : 'var(--border)'}`, color: form.position_type ? '#fff' : 'var(--text3)', padding: '13px', borderRadius: 'var(--r-lg)', cursor: form.position_type ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-sans)', transition: 'all .15s' }}>
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Select team ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Which team do you want to join?</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
              Each team is managed by a different manager. The services tags show what that team specialises in.
            </div>

            {admins.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 14 }}>Loading teams…</div>
            ) : admins.map(admin => (
              <AdminCard
                key={admin.id}
                admin={admin}
                selected={form.admin_id === String(admin.id)}
                onSelect={id => setForm(f => ({ ...f, admin_id: String(id) }))}
              />
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', padding: '12px', borderRadius: 'var(--r-lg)', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-sans)' }}>← Back</button>
              <button
                onClick={() => { if (form.admin_id) setStep(3) }}
                disabled={!form.admin_id}
                style={{ flex: 2, background: form.admin_id ? 'var(--primary)' : 'var(--surface)', border: `1.5px solid ${form.admin_id ? 'var(--primary)' : 'var(--border)'}`, color: form.admin_id ? '#fff' : 'var(--text3)', padding: '12px', borderRadius: 'var(--r-lg)', cursor: form.admin_id ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-sans)', transition: 'all .15s' }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Personal details ── */}
        {step === 3 && (
          <div>
            {/* Application summary */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', marginBottom: 2 }}>Position</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedPosition?.emoji} {selectedPosition?.label}</div>
              </div>
              <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', marginBottom: 2 }}>Team</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedAdmin?.name}</div>
              </div>
              {selectedAdmin?.services?.length > 0 && (
                <>
                  <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {selectedAdmin.services.map(s => <ServiceTag key={s} serviceKey={s} />)}
                  </div>
                </>
              )}
            </div>

            {serverError && (
              <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'var(--rose)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 500 }}>{serverError}</div>
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

            <Field label="Why do you want to join this team? (optional)">
              <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                value={form.cover_letter} onChange={set('cover_letter')}
                placeholder="Tell us a bit about your relevant experience, and why you're a good fit…"
                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </Field>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)', padding: '12px', borderRadius: 'var(--r-lg)', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-sans)' }}>← Back</button>
              <button onClick={handleSubmit} disabled={loading} style={{ flex: 2, background: loading ? 'var(--primary-b, rgba(99,102,241,.5))' : 'var(--primary)', border: 'none', color: '#fff', padding: '13px', borderRadius: 'var(--r-lg)', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-sans)', transition: 'background 0.15s' }}>
                {loading ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
