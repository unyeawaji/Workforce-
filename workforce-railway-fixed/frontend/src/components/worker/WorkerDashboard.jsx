import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useActivities, useTodayShift, useToast, useShiftHistory } from '../../hooks'
import api, { shiftsApi, activitiesApi, profileApi } from '../../lib/api'
import { fmtTime, fmtDate, getDuration, fmtMinutes, getErrorMessage } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Input, Textarea, Select, Spinner, Alert, EmptyState, Divider, ToastContainer } from '../ui'
import { registerSW, requestAndSubscribe, unsubscribeAll, isPushSubscribed } from '../../lib/pushNotifications'

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text3)' }}>
      {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

// ── Time-based greeting ───────────────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}

// ── Clock hero ────────────────────────────────────────────────────────────────
function ClockHero({ shift, onClockIn, onClockOut, loading }) {
  const [now, setNow] = useState(new Date())
  const [pressed, setPressed] = useState(false)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  const isClockedIn = shift?.clock_in && !shift?.clock_out
  const color = isClockedIn ? 'var(--rose)' : 'var(--emerald)'
  const shadow = isClockedIn ? '0 10px 36px rgba(225,29,72,0.35)' : '0 10px 36px rgba(5,150,105,0.35)'

  const handleToggle = async () => {
    setPressed(true)
    setTimeout(() => setPressed(false), 500)
    if (isClockedIn) await onClockOut()
    else await onClockIn()
  }

  return (
    <Card style={{ marginBottom: 20, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%',
        background: isClockedIn ? 'var(--rose-s)' : 'var(--emerald-s)', transition: 'background 0.5s',
      }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div style={{ fontSize: 30, fontFamily: 'var(--font-mono)', fontWeight: 500, letterSpacing: -1, color: 'var(--text)', animation: 'tickPulse 1s ease infinite' }}>
            {now.toLocaleTimeString('en-GB')}
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isClockedIn ? (
              <>
                <div style={{ position: 'relative', width: 10, height: 10 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--rose)', animation: 'pulseRing 1.5s ease infinite' }} />
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--rose)' }} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--rose)', fontWeight: 500 }}>On shift · since {fmtTime(shift.clock_in)}</span>
              </>
            ) : shift?.clock_out ? (
              <span style={{ fontSize: 13, color: 'var(--text3)' }}>Shift ended · {fmtMinutes(shift.total_minutes)}</span>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text3)' }}>Not yet clocked in</span>
            )}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          {pressed && (
            <div style={{
              position: 'absolute', inset: -10, borderRadius: '50%',
              border: `3px solid ${color}`, animation: 'pulseRing 0.5s ease forwards',
            }} />
          )}
          <button
            onClick={handleToggle} disabled={loading || !!shift?.clock_out}
            style={{
              width: 90, height: 90, borderRadius: '50%', border: 'none', cursor: shift?.clock_out ? 'not-allowed' : 'pointer',
              background: shift?.clock_out ? 'var(--border)' : color, color: '#fff',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
              boxShadow: shift?.clock_out ? 'none' : shadow,
              transform: pressed ? 'scale(0.92)' : 'scale(1)', opacity: shift?.clock_out ? 0.5 : 1,
              transition: 'all 0.2s', fontFamily: 'var(--font-sans)',
            }}
          >
            {loading ? <Spinner size={20} color="#fff" /> : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isClockedIn
                    ? <path d="M18 6 6 18M6 6l12 12" />
                    : <path d="M20 6 9 17l-5-5" />
                  }
                </svg>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {isClockedIn ? 'Clock Out' : 'Clock In'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </Card>
  )
}

// ── Activity form ─────────────────────────────────────────────────────────────
function ActivityForm({ existing, onDone, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const nowDt = new Date().toISOString().slice(0, 16)
  const [form, setForm] = useState({
    task_title: existing?.task_title || '',
    description: existing?.description || '',
    status: existing?.status || 'completed',
    start_time: existing?.start_time?.slice(0, 16) || nowDt,
    end_time: existing?.end_time?.slice(0, 16) || '',
    date: existing?.date || today,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.task_title.trim()) { setError('Task title is required'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    if (form.end_time && new Date(form.end_time) <= new Date(form.start_time)) {
      setError('End time must be after start time'); return
    }
    if (new Date(form.date) > new Date()) { setError('Date cannot be in the future'); return }
    setLoading(true); setError('')
    try { await onDone({ ...form, end_time: form.end_time || undefined }) }
    catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <Alert message={error} type="error" onClose={() => setError('')} />}
      <Input label="Task Title" required value={form.task_title} onChange={e => set('task_title')(e.target.value)} placeholder="e.g. Fixed authentication bug" />
      <Textarea label="Description" required value={form.description} onChange={e => set('description')(e.target.value)} placeholder="Describe what you accomplished in detail…" rows={4} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input label="Start Time" type="datetime-local" value={form.start_time} onChange={e => set('start_time')(e.target.value)} />
        <Input label="End Time" type="datetime-local" value={form.end_time} onChange={e => set('end_time')(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Select label="Status" value={form.status} onChange={set('status')} options={[
          { value: 'completed', label: 'Completed' },
          { value: 'pending', label: 'In Progress' },
          { value: 'blocked', label: 'Blocked' },
        ]} />
        <Input label="Date" type="date" value={form.date} onChange={e => set('date')(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button variant="primary" onClick={submit} disabled={loading}>
          {loading ? <><Spinner size={13} color="#fff" /> Saving…</> : existing ? 'Update' : 'Submit Activity'}
        </Button>
      </div>
    </div>
  )
}

// ── Activity card (timeline item) ─────────────────────────────────────────────
function ActivityCard({ activity: a, onEdit, onDelete, delay = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const locked = a.verification_status === 'approved'
  const dotColor = { approved: 'var(--emerald)', rejected: 'var(--rose)', pending: 'var(--amber)' }[a.verification_status]
  const dur = getDuration(a.start_time, a.end_time)

  return (
    <div className="anim-fade-up" style={{ animationDelay: `${delay}ms`, display: 'flex', gap: 14, position: 'relative', zIndex: 1 }}>
      {/* Dot */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginTop: 4,
        background: 'var(--surface)', border: `2px solid ${dotColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: dotColor,
        boxShadow: '0 0 0 4px var(--bg)',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          {a.verification_status === 'approved' && <path d="M20 6 9 17l-5-5" />}
          {a.verification_status === 'rejected' && <path d="M18 6 6 18M6 6l12 12" />}
          {a.verification_status === 'pending' && <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2" />}
        </svg>
      </div>

      <div style={{ flex: 1, paddingBottom: 14 }}>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{a.task_title}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 8 }}>
                <span>{fmtTime(a.start_time)} → {fmtTime(a.end_time)}</span>
                {dur && <span style={{ color: 'var(--primary)' }}>{fmtMinutes(dur)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <Badge status={a.verification_status} />
              {locked && <span style={{ fontSize: 10, color: 'var(--emerald)', fontFamily: 'var(--font-mono)' }}>🔒 Locked</span>}
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            {expanded ? a.description : a.description.slice(0, 110) + (a.description.length > 110 ? '…' : '')}
            {a.description.length > 110 && (
              <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, marginLeft: 4 }}>
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </div>

          {a.admin_feedback && (
            <div style={{
              marginTop: 10, padding: '10px 12px', borderRadius: 'var(--r)',
              background: a.verification_status === 'approved' ? 'var(--emerald-s)' : 'var(--rose-s)',
              borderLeft: `3px solid ${a.verification_status === 'approved' ? 'var(--emerald)' : 'var(--rose)'}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: a.verification_status === 'approved' ? 'var(--emerald)' : 'var(--rose)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>Admin Feedback</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{a.admin_feedback}</div>
            </div>
          )}

          {!locked && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => onEdit(a)}>Edit</Button>
              <Button variant="danger" size="sm" onClick={() => { if (confirm('Delete this activity?')) onDelete(a.id) }}>Delete</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ── Worker dashboard ──────────────────────────────────────────────────────────
export default function WorkerDashboard() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { dark, toggle: toggleTheme } = useThemeStore()
  const { shift, loading: shiftLoading, clockIn, clockOut } = useTodayShift()
  const { activities, loading: actLoading, create, update, remove } = useActivities()
  const { toasts, toast, removeToast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filter, setFilter] = useState('all')
  const [clockError, setClockError] = useState('')
  const [activeTab, setActiveTab] = useState('today')
  const [showPwModal, setShowPwModal] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const { shifts: shiftHistory, loading: historyLoading } = useShiftHistory()

  // ── Push notifications ────────────────────────────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushBanner, setPushBanner] = useState(false) // show "enable notifications?" prompt
  const [showPushClockInPrompt, setShowPushClockInPrompt] = useState(false) // post-clock-in push prompt
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem('wft_guide_seen'))

  // Register service worker on mount
  useEffect(() => {
    registerSW()
    isPushSubscribed().then(active => {
      setPushEnabled(active)
      // Show the enable-notifications banner if not yet subscribed
      // (only if push is supported and permission not yet denied)
      if (!active && 'Notification' in window && Notification.permission !== 'denied') {
        setPushBanner(true)
      }
    })
  }, [])

  const handleEnablePush = async () => {
    setPushLoading(true)
    const ok = await requestAndSubscribe()
    setPushEnabled(ok)
    setPushBanner(false)
    if (ok) toast('Push notifications enabled! We'll remind you when check-ins are due.')
    else toast('Could not enable notifications. Check your browser settings.', 'error')
    setPushLoading(false)
  }

  const handleDisablePush = async () => {
    await unsubscribeAll()
    setPushEnabled(false)
    toast('Push notifications disabled')
  }

  const reviewedCount = activities.filter(a => a.verification_status !== 'pending').length

  // ── Work window status & countdown ──────────────────────────────────────────
  const [workWindow, setWorkWindow] = useState(null)
  const [countdown, setCountdown] = useState('')

  const fetchWorkWindow = async () => {
    try {
      const { data } = await api.get('/schedule/window')
      setWorkWindow(data)
    } catch {}
  }

  useEffect(() => {
    fetchWorkWindow()
    const interval = setInterval(fetchWorkWindow, 60000)
    return () => clearInterval(interval)
  }, [])

  // Countdown timer — counts down to next window start
  useEffect(() => {
    if (!workWindow || workWindow.can_clock_in || !workWindow.next_window_start || !workWindow.next_window_day) {
      setCountdown('')
      return
    }
    const tick = () => {
      const now = new Date()
      const [h, m] = workWindow.next_window_start.split(':').map(Number)
      // Find next occurrence of next_window_day at h:m UTC
      const dayMap = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:0 }
      const target = new Date()
      target.setUTCHours(h, m, 0, 0)
      const todayDay = now.getUTCDay()
      const targetDay = dayMap[workWindow.next_window_day]
      let daysAhead = (targetDay - todayDay + 7) % 7
      if (daysAhead === 0 && now.getUTCHours() * 60 + now.getUTCMinutes() >= h * 60 + m) daysAhead = 7
      target.setUTCDate(target.getUTCDate() + daysAhead)
      const diff = target - now
      if (diff <= 0) { fetchWorkWindow(); return }
      const hours = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setCountdown(`${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [workWindow])

  // ── Periodic check-in status ───────────────────────────────────────────────
  const [checkInStatus, setCheckInStatus] = useState(null)
  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [checkInForm, setCheckInForm] = useState({ tasks: '', note: '' })
  const [checkInFile, setCheckInFile] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [checkInError, setCheckInError] = useState('')

  const pollCheckInStatus = async () => {
    if (!shift?.clock_in || shift?.clock_out) return
    try {
      const { data } = await api.get('/shifts/check-ins/status')
      setCheckInStatus(data)
      if (data.due || data.overdue) setShowCheckInModal(true)
    } catch {}
  }

  useEffect(() => {
    if (shift?.clock_in && !shift?.clock_out) {
      pollCheckInStatus()
      const interval = setInterval(pollCheckInStatus, 60000) // poll every minute
      return () => clearInterval(interval)
    }
  }, [shift?.clock_in, shift?.clock_out])

  const handleSubmitCheckIn = async () => {
    setCheckInError('')
    if (!checkInForm.tasks || isNaN(parseInt(checkInForm.tasks))) { setCheckInError('Enter number of Outlier tasks completed'); return }
    if (!checkInFile) { setCheckInError('Screenshot is required'); return }
    setCheckInLoading(true)
    try {
      const formData = new FormData()
      formData.append('outlier_tasks_completed', parseInt(checkInForm.tasks))
      if (checkInForm.note) formData.append('note', checkInForm.note)
      formData.append('file', checkInFile)
      await api.post('/shifts/check-in', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast('Check-in submitted!')
      setShowCheckInModal(false)
      setCheckInForm({ tasks: '', note: '' })
      setCheckInFile(null)
      await pollCheckInStatus()
    } catch (err) {
      setCheckInError(getErrorMessage(err))
    } finally { setCheckInLoading(false) }
  }

  const handleChangePassword = async () => {
    setPwError('')
    if (!pwForm.current || !pwForm.next) { setPwError('All fields are required'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match'); return }
    if (pwForm.next.length < 8) { setPwError('New password must be at least 8 characters'); return }
    setPwLoading(true)
    try {
      await profileApi.changePassword({ current_password: pwForm.current, new_password: pwForm.next })
      setPwSuccess(true)
      setPwForm({ current: '', next: '', confirm: '' })
      setTimeout(() => { setShowPwModal(false); setPwSuccess(false) }, 2000)
    } catch (err) {
      setPwError(getErrorMessage(err))
    } finally {
      setPwLoading(false)
    }
  }

  const handleClockIn = async () => {
    setClockError('')
    try {
      await clockIn()
      toast('Clocked in successfully!')
      // Auto-subscribe to push if not already (silently — never block clock-in)
      try {
        const alreadySubbed = await isPushSubscribed()
        if (!alreadySubbed && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            const ok = await requestAndSubscribe()
            if (ok) setPushEnabled(true)
          } else if (Notification.permission !== 'denied') {
            // Permission not yet asked — prompt the worker now
            setShowPushClockInPrompt(true)
          }
        }
      } catch (_) { /* push failure must never prevent clock-in */ }
    }
    catch (err) { setClockError(getErrorMessage(err)) }
  }
  const [screenshot, setScreenshot] = useState(null)
  const [screenshotUploading, setScreenshotUploading] = useState(false)
  const [screenshotUploaded, setScreenshotUploaded] = useState(false)

  const handleScreenshotChange = (e) => {
    const file = e.target.files[0]
    if (file) setScreenshot(file)
  }

  const handleUploadScreenshot = async () => {
    if (!screenshot) return
    setScreenshotUploading(true)
    setClockError('')
    try {
      const formData = new FormData()
      formData.append('file', screenshot)
      await shiftsApi.uploadScreenshot(formData)
      setScreenshotUploaded(true)
      toast('Screenshot uploaded!')
    } catch (err) {
      setClockError(getErrorMessage(err))
    } finally {
      setScreenshotUploading(false)
    }
  }

  const handleClockOut = async () => {
    setClockError('')
    try { await clockOut(); toast('Clocked out. Good work today!') }
    catch (err) { setClockError(getErrorMessage(err)) }
  }

  const handleSubmit = async (data) => {
    if (editItem) {
      await update(editItem.id, data)
      setEditItem(null)
      toast('Activity updated')
    } else {
      await create(data)
      setShowForm(false)
      toast('Activity submitted!')
    }
  }

  const handleDelete = async (id) => {
    await remove(id)
    toast('Activity deleted')
  }

  const filtered = filter === 'all' ? activities : activities.filter(a => a.verification_status === filter)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ flex: 1 }}>            <svg width="130" height="32" viewBox="0 0 130 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="tlg" x1="0" y1="0" x2="130" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="var(--primary)"/>
                  <stop offset="100%" stopColor="#38bdf8"/>
                </linearGradient>
              </defs>
              <rect x="0.6" y="0.6" width="128.8" height="30.8" rx="7" fill="url(#tlg)" fillOpacity="0.08" stroke="url(#tlg)" strokeWidth="0.8" strokeOpacity="0.35"/>
              <path d="M4 8 L4 1 L11 1" stroke="url(#tlg)" strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0.6"/>
              <path d="M119 1 L126 1 L126 8" stroke="url(#tlg)" strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0.6"/>
              <path d="M4 24 L4 31 L11 31" stroke="url(#tlg)" strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0.6"/>
              <path d="M119 31 L126 31 L126 24" stroke="url(#tlg)" strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0.6"/>
              <text x="65" y="20" textAnchor="middle" fontFamily="'Georgia', serif" fontSize="11.5" fontWeight="700" fontStyle="italic" letterSpacing="2" fill="url(#tlg)">AİİИDUCTION</text>
            </svg></div>
        <LiveClock />
        {/* Notification badge */}
        {reviewedCount > 0 && (
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setActiveTab('today')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--rose)', color: '#fff', borderRadius: '50%', fontSize: 9, fontWeight: 700, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{reviewedCount}</span>
          </div>
        )}
        <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, display: 'flex', borderRadius: 'var(--r-sm)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {dark ? <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
          </svg>
        </button>
        {/* Password change */}
        <button onClick={() => setShowPwModal(true)} title="Change password" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </button>
        {/* Help guide */}
        <button onClick={() => setShowGuide(true)} title="How to use this system" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
        </button>
        <Avatar name={user?.name} size={30} />
        <button onClick={async () => { await unsubscribeAll(); logout() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex' }} title="Logout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 80px' }}>

          {/* Greeting */}
          <div className="anim-fade-up" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5, marginBottom: 2 }}>{getGreeting()}</div>
            <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>{user?.name?.split(' ')[0]}</div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 20, padding: 4, background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            {[['today', 'Today'], ['history', 'History']].map(([v, l]) => (
              <button key={v} onClick={() => setActiveTab(v)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: activeTab === v ? 'var(--surface)' : 'transparent',
                color: activeTab === v ? 'var(--text)' : 'var(--text3)',
                boxShadow: activeTab === v ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s',
              }}>{l}</button>
            ))}
          </div>

          {/* Work window status banner */}
          {workWindow && !shift?.clock_in && (
            <div style={{
              marginBottom: 16,
              padding: '14px 16px',
              borderRadius: 'var(--r-lg)',
              background: workWindow.can_clock_in ? 'var(--emerald-s)' : workWindow.is_holiday ? 'var(--violet-s)' : 'var(--surface2)',
              border: `1px solid ${workWindow.can_clock_in ? 'var(--emerald-b)' : workWindow.is_holiday ? 'var(--violet-b)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: workWindow.can_clock_in ? 'var(--emerald)' : workWindow.is_holiday ? 'var(--violet)' : 'var(--text)', marginBottom: 3 }}>
                    {workWindow.can_clock_in ? '✅ Work hours are active' : workWindow.is_holiday ? `🎉 Holiday: ${workWindow.holiday_name}` : '🕐 Outside work hours'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{workWindow.message}</div>
                  {!workWindow.can_clock_in && workWindow.next_window_day && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                      Next window: <strong style={{ color: 'var(--text)' }}>{workWindow.next_window_day} at {workWindow.next_window_start} UTC</strong>
                    </div>
                  )}
                </div>
                {!workWindow.can_clock_in && countdown && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)', letterSpacing: 2 }}>{countdown}</div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>Until next window</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {clockError && <Alert message={clockError} type="error" onClose={() => setClockError('')} style={{ marginBottom: 16 }} />}

          {/* ── Push notification banner ──────────────────────────────── */}
          {pushBanner && !shift?.clock_in && (
            <div style={{
              marginBottom: 16, padding: '14px 16px', borderRadius: 'var(--r-lg)',
              background: 'var(--violet-s)', border: '1px solid var(--violet-b)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--violet)', marginBottom: 3 }}>
                  🔔 Enable Check-in Reminders
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                  Get notified when it's time to submit your Outlier check-in — even when this tab is in the background.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Button variant="secondary" size="sm" onClick={() => setPushBanner(false)}>Later</Button>
                <Button variant="primary" size="sm" onClick={handleEnablePush} disabled={pushLoading}>
                  {pushLoading ? <Spinner size={11} color="#fff" /> : 'Enable'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Post-clock-in push notification prompt ────────────────── */}
          {showPushClockInPrompt && (
            <div style={{
              marginBottom: 16, padding: '16px', borderRadius: 'var(--r-lg)',
              background: 'var(--violet-s)', border: '1.5px solid var(--violet-b)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--violet)', marginBottom: 6 }}>
                🔔 Stay on top of your check-ins
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 14 }}>
                You're now clocked in. Enable push notifications so we can remind you when your check-in is due — even if you close this tab.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant=\"secondary\" size=\"sm\" onClick={() => setShowPushClockInPrompt(false)}>No thanks</Button>
                <Button variant=\"primary\" size=\"sm\" disabled={pushLoading} onClick={async () => {
                  setPushLoading(true)
                  try {
                    const ok = await requestAndSubscribe()
                    if (ok) { setPushEnabled(true); toast('Push notifications enabled!') }
                    else toast('Could not enable notifications. Check your browser settings.', 'error')
                  } catch (_) {}
                  finally { setPushLoading(false); setShowPushClockInPrompt(false) }
                }}>
                  {pushLoading ? <Spinner size={11} color=\"#fff\" /> : 'Enable Notifications'}
                </Button>
              </div>
            </div>
          )}

          {/* Push status indicator (small, unobtrusive, shown when clocked in) */}
          {shift?.clock_in && !shift?.clock_out && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                onClick={pushEnabled ? handleDisablePush : handleEnablePush}
                disabled={pushLoading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: pushEnabled ? 'var(--emerald)' : 'var(--text3)', fontFamily: 'var(--font-mono)', padding: '4px 8px', borderRadius: 'var(--r-sm)' }}
                title={pushEnabled ? 'Reminders on — click to disable' : 'Click to enable reminders'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {pushEnabled ? 'Reminders on' : 'Reminders off'}
              </button>
            </div>
          )}

          {activeTab === 'history' ? (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Shift History</div>
              {historyLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 70 }} />)}
                </div>
              ) : shiftHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>No shift history yet.</div>
              ) : shiftHistory.map((s, i) => (
                <div key={s.id} className="anim-fade-up" style={{
                  animationDelay: `${i * 40}ms`,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    {s.total_minutes ? (
                      <span style={{ fontSize: 12, color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {Math.floor(s.total_minutes / 60)}h {s.total_minutes % 60}m
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>In progress</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 5, display: 'flex', gap: 12 }}>
                    {s.clock_in && <span>In: {new Date(s.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                    {s.clock_out && <span>Out: {new Date(s.clock_out).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                    {s.screenshot_url && <span style={{ color: 'var(--emerald)' }}>📸 Screenshot</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
          <ClockHero shift={shift} onClockIn={handleClockIn} onClockOut={handleClockOut} loading={shiftLoading} />

          {/* Screenshot upload — shown when clocked in and not yet clocked out */}
          {shift?.clock_in && !shift?.clock_out && (
            <Card style={{ marginBottom: 20, padding: '16px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                📸 Upload Screenshot Before Clocking Out
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                A screenshot is required to clock out. Upload proof of your work.
              </div>
              {screenshotUploaded ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--emerald)', fontSize: 13, fontWeight: 500 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                  Screenshot uploaded successfully
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{
                    padding: '8px 14px', borderRadius: 'var(--r)', border: '1px dashed var(--border)',
                    cursor: 'pointer', fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    {screenshot ? screenshot.name : 'Choose image'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleScreenshotChange} style={{ display: 'none' }} />
                  </label>
                  {screenshot && (
                    <Button variant="primary" size="sm" onClick={handleUploadScreenshot} disabled={screenshotUploading}>
                      {screenshotUploading ? <><Spinner size={12} color="#fff" /> Uploading…</> : 'Upload'}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Check-in status banner */}
          {shift?.clock_in && !shift?.clock_out && checkInStatus && (
            <div style={{
              background: checkInStatus.overdue ? 'var(--rose-s)' : checkInStatus.due ? 'var(--amber-s)' : 'var(--emerald-s)',
              border: `1px solid ${checkInStatus.overdue ? 'var(--rose-b)' : checkInStatus.due ? 'var(--amber-b)' : 'var(--emerald-b)'}`,
              borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: checkInStatus.overdue ? 'var(--rose)' : checkInStatus.due ? 'var(--amber)' : 'var(--emerald)' }}>
                  {checkInStatus.overdue ? '⛔ Check-in overdue' : checkInStatus.due ? '🔔 Check-in due now' : `✓ ${checkInStatus.check_in_count} check-in${checkInStatus.check_in_count !== 1 ? 's' : ''} submitted`}
                </div>
                {checkInStatus.next_due_at && !checkInStatus.due && !checkInStatus.overdue && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    Next due at {new Date(checkInStatus.next_due_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
              {(checkInStatus.due || checkInStatus.overdue) && (
                <Button variant="primary" size="sm" onClick={() => setShowCheckInModal(true)}>Submit Now</Button>
              )}
            </div>
          )}

          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: `${activities.filter(a => a.verification_status === 'approved').length} Approved`, c: 'var(--emerald)', bg: 'var(--emerald-s)' },
              { label: `${activities.filter(a => a.verification_status === 'pending').length} Pending`, c: 'var(--amber)', bg: 'var(--amber-s)' },
              { label: `${activities.filter(a => a.verification_status === 'rejected').length} Rejected`, c: 'var(--rose)', bg: 'var(--rose-s)' },
            ].map(chip => (
              <span key={chip.label} style={{ padding: '5px 12px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 500, background: chip.bg, color: chip.c }}>
                {chip.label}
              </span>
            ))}
          </div>

          {/* Form */}
          {(showForm || editItem) && !editItem ? (
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Log New Activity</div>
              <ActivityForm onDone={handleSubmit} onCancel={() => setShowForm(false)} />
            </Card>
          ) : editItem ? (
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Edit Activity</div>
              <ActivityForm existing={editItem} onDone={handleSubmit} onCancel={() => setEditItem(null)} />
            </Card>
          ) : (
            <Button variant="primary" size="lg" fullWidth onClick={() => setShowForm(true)} style={{ marginBottom: 20 }}>
              + Log Activity
            </Button>
          )}

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 20, padding: 4, background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            {[['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: filter === v ? 'var(--surface)' : 'transparent',
                color: filter === v ? 'var(--text)' : 'var(--text3)',
                boxShadow: filter === v ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s',
              }}>{l}</button>
            ))}
          </div>

          {/* Timeline */}
          {actLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="📋" title="No activities" sub="Submit your first task for today." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 17, top: 0, bottom: 0, width: 1.5, background: 'var(--border)', zIndex: 0 }} />
              {filtered.map((a, i) => (
                <ActivityCard key={a.id} activity={a} delay={i * 50}
                  onEdit={a => { setEditItem(a); setShowForm(false) }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* Blocked shift warning */}
      {shift?.is_blocked && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--rose-s)', border: '1.5px solid var(--rose-b)', borderRadius: 'var(--r-lg)',
          padding: '14px 20px', zIndex: 30, maxWidth: 'min(480px, 90vw)', width: '100%',
          boxShadow: 'var(--shadow-xl)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--rose)', marginBottom: 4 }}>⛔ Shift Blocked</div>
          <div style={{ fontSize: 12, color: 'var(--rose)', lineHeight: 1.5 }}>{shift.block_reason}</div>
          {checkInStatus?.is_blocked && checkInStatus.block_reason?.includes('check-in') && (
            <Button variant="primary" size="sm" style={{ marginTop: 10 }} onClick={() => setShowCheckInModal(true)}>
              Submit Check-In Now
            </Button>
          )}
        </div>
      )}

      {/* Periodic Check-In Modal */}
      {showCheckInModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(440px, 92vw)', background: 'var(--surface)', borderRadius: 'var(--r-xl)',
            border: `1.5px solid ${checkInStatus?.overdue ? 'var(--rose-b)' : 'var(--amber-b)'}`,
            boxShadow: 'var(--shadow-xl)', zIndex: 70, padding: 24, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {checkInStatus?.overdue ? '⛔ Check-In Overdue' : '🔔 Check-In Due'}
              </div>
              {!checkInStatus?.overdue && (
                <button onClick={() => setShowCheckInModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 22 }}>×</button>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.5 }}>
              {checkInStatus?.overdue
                ? 'Your check-in is overdue. Your shift is now blocked until you submit. You cannot clock out without submitting.'
                : `Time for your periodic check-in. Submit a screenshot of your Outlier dashboard and your task count.`
              }
            </div>

            {checkInError && <Alert message={checkInError} type="error" onClose={() => setCheckInError('')} style={{ marginBottom: 12 }} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Outlier Tasks Completed *</label>
                <input
                  type="number" min={0} placeholder="e.g. 12"
                  value={checkInForm.tasks}
                  onChange={e => setCheckInForm(f => ({ ...f, tasks: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Screenshot of Outlier Dashboard *</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  borderRadius: 'var(--r)', border: '1px dashed var(--border)',
                  cursor: 'pointer', fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  {checkInFile ? checkInFile.name : 'Choose screenshot (JPEG/PNG/WebP)'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setCheckInFile(e.target.files[0])} style={{ display: 'none' }} />
                </label>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Note (optional)</label>
                <textarea
                  placeholder="Any notes about this session..."
                  value={checkInForm.note}
                  onChange={e => setCheckInForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <Button variant="primary" fullWidth onClick={handleSubmitCheckIn} disabled={checkInLoading}>
                {checkInLoading ? <><Spinner size={13} color="#fff" /> Submitting…</> : 'Submit Check-In'}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── How-to Guide Modal ─────────────────────────────────────────── */}
      {showGuide && (
        <>
          <div onClick={() => { setShowGuide(false); localStorage.setItem('wft_guide_seen', '1') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 70, width: '92%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)', padding: 24, boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 3 }}>How to use this system</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Follow these steps every working day</div>
              </div>
              <button onClick={() => { setShowGuide(false); localStorage.setItem('wft_guide_seen', '1') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, lineHeight: 1, padding: 2 }}>✕</button>
            </div>

            {[
              {
                step: '1', icon: '🟢', title: 'Clock In',
                body: 'Tap Clock In at the start of your shift. You must clock in within the allowed work window — clocking in late may flag or block your shift. A screenshot of your work screen is not required at this stage.',
              },
              {
                step: '2', icon: '📸', title: 'Submit Periodic Check-ins',
                body: 'Every set interval (e.g. every 2 hours) you will be prompted to submit a check-in. Take a screenshot of your Outlier dashboard, enter the number of tasks you completed, and submit. Missing a check-in will block your shift — you won\'t be able to clock out until it\'s resolved.',
              },
              {
                step: '3', icon: '📋', title: 'Log Your Activities',
                body: 'Use the Today tab to log each task you worked on — add a title, description, and start/end time. Activities are reviewed by your admin and marked approved or rejected. You can only log activities on days you have clocked in.',
              },
              {
                step: '4', icon: '🖼️', title: 'Upload a Final Screenshot',
                body: 'Before clocking out, upload a final screenshot of your Outlier dashboard. This is required — you cannot clock out without it.',
              },
              {
                step: '5', icon: '🔴', title: 'Clock Out',
                body: 'Tap Clock Out to end your shift. Make sure your final screenshot is uploaded and all check-ins are submitted first. Your total hours will be recorded automatically.',
              },
              {
                step: '💡', icon: '🔔', title: 'Enable Push Notifications',
                body: 'Allow notifications so the system can remind you when a check-in is due — even if you close this tab. You\'ll be prompted at clock-in, or you can enable it from the bell icon in the Today tab.',
              },
            ].map(({ step, icon, title, body }) => (
              <div key={step} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)',
                }}>{step}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{icon} {title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>{body}</div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>
              ⚠️ <strong style={{ color: 'var(--text)' }}>Important:</strong> If your shift is blocked, contact your admin. You can reach this guide anytime via the <strong style={{ color: 'var(--text)' }}>?</strong> button in the top bar.
            </div>

            <Button variant="primary" fullWidth onClick={() => { setShowGuide(false); localStorage.setItem('wft_guide_seen', '1') }} style={{ marginTop: 20 }}>
              Got it, let's go
            </Button>
          </div>
        </>
      )}

      {/* Password Change Modal */}
      {showPwModal && (
        <>
          <div onClick={() => setShowPwModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(400px, 90vw)', background: 'var(--surface)', borderRadius: 'var(--r-xl)',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)', zIndex: 70, padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Change Password</div>
              <button onClick={() => setShowPwModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 22 }}>×</button>
            </div>
            {pwSuccess ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--emerald)', fontSize: 14, fontWeight: 500 }}>
                ✓ Password changed successfully
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pwError && <Alert message={pwError} type="error" onClose={() => setPwError('')} />}
                <Input label="Current Password" type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} placeholder="••••••••" />
                <Input label="New Password" type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} placeholder="Min. 8 characters" />
                <Input label="Confirm New Password" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="••••••••" />
                <Button variant="primary" fullWidth onClick={handleChangePassword} disabled={pwLoading} style={{ marginTop: 4 }}>
                  {pwLoading ? <><Spinner size={13} color="#fff" /> Updating…</> : 'Update Password'}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
