import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useActivities, useTodayShift, useToast } from '../../hooks'
import { fmtTime, fmtDate, getDuration, fmtMinutes, getErrorMessage } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Input, Textarea, Select, Spinner, Alert, EmptyState, Divider, ToastContainer } from '../ui'

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

  const handleClockIn = async () => {
    setClockError('')
    try { await clockIn(); toast('Clocked in successfully!') }
    catch (err) { setClockError(getErrorMessage(err)) }
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
        <div style={{ flex: 1, fontSize: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>WorkForce</div>
        <LiveClock />
        <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, display: 'flex', borderRadius: 'var(--r-sm)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {dark ? <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
          </svg>
        </button>
        <Avatar name={user?.name} size={30} />
        <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 80px' }}>

          {/* Greeting */}
          <div className="anim-fade-up" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5, marginBottom: 2 }}>Welcome back</div>
            <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>{user?.name?.split(' ')[0]}</div>
          </div>

          {clockError && <Alert message={clockError} type="error" onClose={() => setClockError('')} style={{ marginBottom: 16 }} />}

          <ClockHero shift={shift} onClockIn={handleClockIn} onClockOut={handleClockOut} loading={shiftLoading} />

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
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
