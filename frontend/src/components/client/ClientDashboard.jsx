import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { clientsApi, profileApi } from '../../lib/api'
import { fmtTime } from '../../lib/utils'

function Avatar({ name, size = 38 }) {
  const palette = ['#1d4ed8','#7c3aed','#0891b2','#059669','#d97706','#e11d48']
  const color = palette[(name || '?').charCodeAt(0) % palette.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
      letterSpacing: -0.5,
    }}>{(name || '?')[0].toUpperCase()}</div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '20px 22px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6,
        color: 'var(--text3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1, letterSpacing: -1 }}>
        {value}
      </div>
    </div>
  )
}

// Compact relative time ("5m ago", "2h ago") for tight card layouts.
// Deliberately distinct from lib/utils.js's fmtRelative (date-fns,
// produces "5 minutes ago" — too long for this card's stat row).
function fmtCompactAgo(dt) {
  if (!dt) return null
  const diffMs = Date.now() - new Date(dt).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StarRating({ value, onChange, size = 18, readOnly = false }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => !readOnly && onChange?.(n)}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          style={{
            fontSize: size, cursor: readOnly ? 'default' : 'pointer',
            color: n <= (hover || value) ? 'var(--amber)' : 'var(--border)',
            transition: 'color 0.1s', lineHeight: 1,
          }}
        >★</span>
      ))}
    </div>
  )
}

function ReviewModal({ worker, onClose, onSubmitted }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [existingReview, setExistingReview] = useState(null) // null = creating new, object = editing

  // On open, check whether this client already reviewed this worker — if so, pre-fill for editing
  useEffect(() => {
    let cancelled = false
    setLoadingExisting(true)
    clientsApi.myReviews()
      .then(({ data }) => {
        if (cancelled) return
        const existing = data.find(r => r.worker_id === worker.worker_id)
        if (existing) {
          setExistingReview(existing)
          setRating(existing.rating)
          setComment(existing.comment || '')
        }
      })
      .catch(() => { /* if this fails, just fall back to "create new" — not worth blocking on */ })
      .finally(() => { if (!cancelled) setLoadingExisting(false) })
    return () => { cancelled = true }
  }, [worker.worker_id])

  const isEditing = !!existingReview

  const handleSubmit = async () => {
    if (rating < 1) { setError('Please select a star rating'); return }
    setSaving(true); setError('')
    try {
      if (isEditing) {
        await clientsApi.editReview(existingReview.id, rating, comment.trim() || null)
      } else {
        await clientsApi.submitReview(worker.worker_id, rating, comment.trim() || null)
      }
      setSuccess(true)
      onSubmitted?.()
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save review. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', padding: '28px 28px 24px',
        width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-xl)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Avatar name={worker.worker_name} size={36} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.4 }}>
              {isEditing ? `Edit your review of ${worker.worker_name}` : `Rate ${worker.worker_name}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{worker.department || 'Worker'}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          {isEditing ? 'Your admin will see the updated rating.' : 'This goes straight to your admin.'}
        </div>

        {loadingExisting ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <div className="skeleton" style={{ height: 32, width: 160, borderRadius: 'var(--r)' }} />
          </div>
        ) : success ? (
          <div style={{
            background: 'var(--emerald-s)', border: '1px solid var(--emerald-b)',
            color: 'var(--emerald)', borderRadius: 'var(--r)', padding: '12px 16px',
            fontSize: 13, fontWeight: 600, textAlign: 'center',
          }}>{isEditing ? 'Your review was updated.' : 'Thanks — your review was sent.'}</div>
        ) : (
          <>
            {error && (
              <div style={{
                background: 'var(--rose-s)', border: '1px solid var(--rose-b)',
                color: 'var(--rose)', borderRadius: 'var(--r)', padding: '10px 14px',
                fontSize: 13, fontWeight: 500, marginBottom: 16,
              }}>{error}</div>
            )}

            <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'center' }}>
              <StarRating value={rating} onChange={setRating} size={32} />
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
              Comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="What's going well, or what could improve?"
              rows={3}
              maxLength={1000}
              style={{
                width: '100%', padding: '10px 13px', borderRadius: 'var(--r)',
                border: '1.5px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-sans)',
                boxSizing: 'border-box', outline: 'none', resize: 'vertical',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleSubmit} disabled={saving} style={{
                flex: 1, background: saving ? 'var(--primary-b)' : 'var(--primary)',
                border: 'none', color: '#fff', padding: '11px',
                borderRadius: 'var(--r-lg)', cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-sans)',
              }}>
                {saving ? 'Saving...' : isEditing ? 'Update Review' : 'Send Review'}
              </button>
              <button onClick={onClose} style={{
                padding: '11px 18px', background: 'none',
                border: '1px solid var(--border)', color: 'var(--text2)',
                borderRadius: 'var(--r-lg)', cursor: 'pointer',
                fontSize: 14, fontFamily: 'var(--font-sans)',
              }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function WorkerCard({ worker, onRate }) {
  const online = worker.is_online
  const lastActive = fmtCompactAgo(worker.last_active_at)
  // Flag staleness if a worker is marked online but hasn't done anything in 90+ minutes
  const stale = online && worker.last_active_at &&
    (Date.now() - new Date(worker.last_active_at).getTime()) > 90 * 60 * 1000
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${stale ? 'var(--amber-b)' : 'var(--border)'}`,
      borderRadius: 'var(--r-lg)', padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      opacity: online ? 1 : 0.6,
      transition: 'opacity 0.2s',
    }}>
      {/* Avatar + online dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar name={worker.worker_name} size={42} />
        <span style={{
          position: 'absolute', bottom: 1, right: 1,
          width: 10, height: 10, borderRadius: '50%',
          background: online ? 'var(--emerald)' : 'var(--text3)',
          border: '2px solid var(--surface)',
          boxShadow: online ? '0 0 0 2px var(--emerald-b)' : 'none',
        }} />
      </div>

      {/* Name + shift times */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 3 }}>
          {worker.worker_name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{worker.department || 'Worker'}</span>
          {worker.clock_in && (
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              In: {fmtTime(worker.clock_in)}
              {worker.clock_out
                ? ` · Out: ${fmtTime(worker.clock_out)}`
                : online ? ' · Active' : ''}
            </span>
          )}
          {!worker.clock_in && <span>No shift today</span>}
          {lastActive && (
            <span style={{ color: stale ? 'var(--amber)' : 'var(--text3)', fontWeight: stale ? 600 : 400 }}>
              {stale ? '⚠ ' : ''}Last active {lastActive}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexShrink: 0, textAlign: 'right', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--violet)', lineHeight: 1 }}>
            {worker.hours_today != null ? `${worker.hours_today}h` : '--'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 500 }}>hours</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
            {worker.tasks_today}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 500 }}>tasks</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text2)', lineHeight: 1 }}>
            {worker.check_in_count}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 500 }}>check-ins</div>
        </div>
        <button onClick={() => onRate(worker)} title="Rate this worker" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
          background: 'var(--amber-s)', border: '1px solid var(--amber-b)',
          borderRadius: 'var(--r-full)', cursor: 'pointer',
          color: 'var(--amber)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
        }}>★ Rate</button>
      </div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function HistoryView() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState('7') // '7' | '30' | 'custom'
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (range === 'custom') {
        if (customFrom) params.date_from = customFrom
        if (customTo) params.date_to = customTo
      } else {
        const days = parseInt(range, 10)
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - (days - 1))
        params.date_from = from.toISOString().slice(0, 10)
        params.date_to = to.toISOString().slice(0, 10)
      }
      const { data } = await clientsApi.history(params)
      setRows(data)
    } catch {
      setError('Could not load history.')
    } finally {
      setLoading(false)
    }
  }, [range, customFrom, customTo])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // Group rows by date, newest first (API already orders desc, but groups stay clean either way)
  const byDate = {}
  for (const r of rows) {
    if (!byDate[r.date]) byDate[r.date] = []
    byDate[r.date].push(r)
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['7', 'Past 7 days'], ['30', 'Past 30 days'], ['custom', 'Custom range']].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} style={{
            padding: '7px 14px', borderRadius: 'var(--r-full)', border: `1px solid ${range === v ? 'var(--primary)' : 'var(--border)'}`,
            background: range === v ? 'var(--primary-s)' : 'var(--surface)',
            color: range === v ? 'var(--primary)' : 'var(--text2)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
          }}>{l}</button>
        ))}
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{
              padding: '7px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-sans)',
            }} />
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{
              padding: '7px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-sans)',
            }} />
          </div>
        )}
      </div>

      {error && (
        <div style={{
          background: 'var(--amber-s)', border: '1px solid var(--amber-b)', color: 'var(--amber)',
          borderRadius: 'var(--r)', padding: '11px 16px', fontSize: 13, fontWeight: 500, marginBottom: 20,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : dates.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: '48px 32px', textAlign: 'center',
          color: 'var(--text3)', fontSize: 13,
        }}>No activity in this date range.</div>
      ) : dates.map(date => {
        const dayRows = byDate[date]
        const dayHours = dayRows.reduce((s, r) => s + r.hours_total, 0).toFixed(1)
        const dayTasks = dayRows.reduce((s, r) => s + r.tasks_total, 0)
        return (
          <div key={date} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <span>{new Date(date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)', fontWeight: 500 }}>
                {dayHours}h · {dayTasks} tasks
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dayRows.map(r => (
                <div key={`${r.date}-${r.worker_id}`} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                  padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <Avatar name={r.worker_name} size={28} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 }}>{r.worker_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 10 }}>
                    {r.clock_in && <span>{fmtTime(r.clock_in)}–{r.clock_out ? fmtTime(r.clock_out) : '…'}</span>}
                    <span style={{ color: 'var(--violet)' }}>{r.hours_total}h</span>
                    <span style={{ color: 'var(--primary)' }}>{r.tasks_total} tasks</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ClientDashboard() {
  const user    = useAuthStore(s => s.user)
  const logout  = useAuthStore(s => s.logout)
  const dark    = useThemeStore(s => s.dark)
  const toggleDark = useThemeStore(s => s.toggle)

  const [feed, setFeed]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [error, setError]         = useState('')
  const [viewTab, setViewTab]     = useState('live') // 'live' | 'history'
  const [reviewTarget, setReviewTarget] = useState(null) // worker being reviewed, or null
  const [showPwModal, setShowPwModal] = useState(false)
  const [pwForm, setPwForm]           = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError]         = useState('')
  const [pwSuccess, setPwSuccess]     = useState(false)
  const [pwLoading, setPwLoading]     = useState(false)

  // ── Wake Lock (keep laptop/screen on) ────────────────────────────────────
  const [wakeLock, setWakeLock]   = useState(false)  // toggle state
  const wakeLockRef               = useRef(null)      // holds the WakeLockSentinel

  const toggleWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      alert('Screen wake lock is not supported in this browser. Use Chrome or Edge.')
      return
    }
    if (wakeLock) {
      // Release
      try { await wakeLockRef.current?.release() } catch (_) {}
      wakeLockRef.current = null
      setWakeLock(false)
    } else {
      // Acquire
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        setWakeLock(true)
        // Auto-reacquire if page becomes visible again (tab switch releases it)
        wakeLockRef.current.addEventListener('release', () => {
          if (document.visibilityState === 'visible') {
            navigator.wakeLock.request('screen')
              .then(s => { wakeLockRef.current = s })
              .catch(() => {})
          } else {
            setWakeLock(false)
          }
        })
      } catch (e) {
        alert('Could not activate wake lock: ' + e.message)
      }
    }
  }, [wakeLock])

  // Release wake lock when component unmounts
  useEffect(() => {
    return () => { wakeLockRef.current?.release().catch(() => {}) }
  }, [])

  const handlePwChange = async () => {
    setPwError('')
    if (!pwForm.current) { setPwError('Current password is required'); return }
    if (pwForm.next.length < 8) { setPwError('New password must be at least 8 characters'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match'); return }
    setPwLoading(true)
    try {
      await profileApi.changePassword({ current_password: pwForm.current, new_password: pwForm.next })
      setPwSuccess(true)
      setPwForm({ current: '', next: '', confirm: '' })
      setTimeout(() => { setPwSuccess(false); setShowPwModal(false) }, 2000)
    } catch (e) {
      setPwError(e.response?.data?.detail || 'Failed to update password')
    } finally { setPwLoading(false) }
  }

  const fetchFeed = useCallback(async () => {
    try {
      const { data } = await clientsApi.feed()
      setFeed(data)
      setLastRefresh(new Date())
      setError('')
    } catch {
      setError('Could not load feed. Retrying...')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeed()
    const id = setInterval(fetchFeed, 60_000)
    return () => clearInterval(id)
  }, [fetchFeed])

  const online      = feed.filter(w => w.is_online)
  const offline     = feed.filter(w => !w.is_online)
  const totalTasks  = feed.reduce((s, w) => s + w.tasks_today, 0)
  const totalHours  = feed.reduce((s, w) => s + (w.hours_today || 0), 0).toFixed(1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>

      {/* ── Header ── */}
      <header className="header-pad" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: 'var(--shadow-sm)', gap: 10, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: 'var(--primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
          }}>A</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>AI Induction</span>
          <span className="hide-mobile" style={{
            marginLeft: 4, fontSize: 11, fontWeight: 500, color: 'var(--text3)',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-full)', padding: '2px 10px', letterSpacing: 0.3, whiteSpace: 'nowrap',
          }}>Client Portal</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div className="hide-mobile" style={{ fontSize: 13, color: 'var(--text3)', marginRight: 4, whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.name}
          </div>
          <button onClick={() => { setShowPwModal(true); setPwError(''); setPwSuccess(false) }} title="Change Password" style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--text3)', padding: '6px 14px', borderRadius: 'var(--r)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
          }}>
            <span className="hide-mobile">Change Password</span>
            <span className="show-mobile-inline">🔒</span>
          </button>
          <button
            onClick={toggleWakeLock}
            title={wakeLock ? 'Click to let screen sleep' : 'Click to keep screen awake'}
            style={{
              background: wakeLock ? 'var(--primary)' : 'none',
              border: `1px solid ${wakeLock ? 'var(--primary)' : 'var(--border)'}`,
              color: wakeLock ? '#fff' : 'var(--text3)',
              padding: '6px 11px', borderRadius: 'var(--r)',
              cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)', flexShrink: 0,
              transition: 'all .15s',
            }}
          >
            {wakeLock ? '☀️' : 'Keep On'}
          </button>
          <button onClick={toggleDark} style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--text3)', padding: '6px 11px', borderRadius: 'var(--r)',
            cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)', flexShrink: 0,
          }}>{dark ? 'Light' : 'Dark'}</button>
          <button onClick={logout} style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--text3)', padding: '6px 14px', borderRadius: 'var(--r)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)', flexShrink: 0, whiteSpace: 'nowrap',
          }}>Sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '36px 20px 64px' }}>

        {/* ── Welcome ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, marginBottom: 5 }}>
            {greeting()}, {user?.name?.split(' ')[0]}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            {viewTab === 'live' ? 'Live view of your assigned workers.' : 'Daily activity for your assigned workers.'}
            {viewTab === 'live' && lastRefresh && (
              <span> Last updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · auto-refreshes every 60s</span>
            )}
          </div>
          {user?.admin_name && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Your account is managed by <strong style={{ color: 'var(--text2)', fontWeight: 600 }}>{user.admin_name}</strong>
            </div>
          )}
        </div>

        {/* ── View tabs ── */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 24, padding: 4, background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)', maxWidth: 280 }}>
          {[['live', 'Live'], ['history', 'History']].map(([v, l]) => (
            <button key={v} onClick={() => setViewTab(v)} style={{
              flex: 1, padding: '7px 4px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
              background: viewTab === v ? 'var(--surface)' : 'transparent',
              color: viewTab === v ? 'var(--text)' : 'var(--text3)',
              boxShadow: viewTab === v ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>

        {viewTab === 'history' ? (
          <HistoryView />
        ) : (
        <>
        {/* ── Error ── */}
        {error && (
          <div style={{
            background: 'var(--amber-s)', border: '1px solid var(--amber-b)',
            color: 'var(--amber)', borderRadius: 'var(--r)', padding: '11px 16px',
            fontSize: 13, fontWeight: 500, marginBottom: 20,
          }}>{error}</div>
        )}

        {/* ── Stats ── */}
        <div className="stat-row-4" style={{ marginBottom: 32 }}>
          <StatCard label="Online now"     value={online.length}   color="var(--emerald)" />
          <StatCard label="Total workers"  value={feed.length}     color="var(--primary)"  />
          <StatCard label="Hours today"    value={`${totalHours}h`} color="var(--violet)"  />
          <StatCard label="Tasks today"    value={totalTasks}      color="var(--amber)"   />
        </div>

        {/* ── Worker list ── */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ height: 78, borderRadius: 'var(--r-lg)' }} />
            ))}
          </div>
        ) : feed.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)', padding: '56px 32px', textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--r-lg)',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.74"/>
              </svg>
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No workers assigned yet</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              Contact your manager to get workers assigned to your account.
            </div>
          </div>
        ) : (
          <>
            {online.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: 0.6, color: 'var(--emerald)', fontFamily: 'var(--font-mono)',
                  marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--emerald)', boxShadow: '0 0 0 3px var(--emerald-b)',
                  }} />
                  Online · {online.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {online.map(w => <WorkerCard key={w.worker_id} worker={w} onRate={setReviewTarget} />)}
                </div>
              </div>
            )}

            {offline.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: 0.6, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                  marginBottom: 10,
                }}>Offline · {offline.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {offline.map(w => <WorkerCard key={w.worker_id} worker={w} onRate={setReviewTarget} />)}
                </div>
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>
      {/* ── Password Change Modal ── */}
      {showPwModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) setShowPwModal(false) }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)', padding: '28px 28px 24px',
            width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-xl)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Change Password</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 22 }}>Update your client portal password.</div>

            {pwSuccess ? (
              <div style={{
                background: 'var(--emerald-s)', border: '1px solid var(--emerald-b)',
                color: 'var(--emerald)', borderRadius: 'var(--r)', padding: '12px 16px',
                fontSize: 13, fontWeight: 600, textAlign: 'center',
              }}>Password updated successfully.</div>
            ) : (
              <>
                {pwError && (
                  <div style={{
                    background: 'var(--rose-s)', border: '1px solid var(--rose-b)',
                    color: 'var(--rose)', borderRadius: 'var(--r)', padding: '10px 14px',
                    fontSize: 13, fontWeight: 500, marginBottom: 16,
                  }}>{pwError}</div>
                )}
                {[
                  ['current', 'Current Password', 'Enter your current password'],
                  ['next',    'New Password',      'Min. 8 characters'],
                  ['confirm', 'Confirm New Password', 'Repeat your new password'],
                ].map(([key, label, placeholder]) => (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>{label}</label>
                    <input
                      type="password"
                      value={pwForm[key]}
                      onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{
                        width: '100%', padding: '10px 13px', borderRadius: 'var(--r)',
                        border: '1.5px solid var(--border)', background: 'var(--surface2)',
                        color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-sans)',
                        boxSizing: 'border-box', outline: 'none',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button onClick={handlePwChange} disabled={pwLoading} style={{
                    flex: 1, background: pwLoading ? 'var(--primary-b)' : 'var(--primary)',
                    border: 'none', color: '#fff', padding: '11px',
                    borderRadius: 'var(--r-lg)', cursor: pwLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-sans)',
                  }}>
                    {pwLoading ? 'Updating...' : 'Update Password'}
                  </button>
                  <button onClick={() => setShowPwModal(false)} style={{
                    padding: '11px 18px', background: 'none',
                    border: '1px solid var(--border)', color: 'var(--text2)',
                    borderRadius: 'var(--r-lg)', cursor: 'pointer',
                    fontSize: 14, fontFamily: 'var(--font-sans)',
                  }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Review Modal ── */}
      {reviewTarget && (
        <ReviewModal worker={reviewTarget} onClose={() => setReviewTarget(null)} />
      )}

    </div>
  )
}