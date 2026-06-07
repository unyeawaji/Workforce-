import { useState, useEffect } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useActivities, useWorkers, useDashboardStats, useToast } from '../../hooks'
import { fmtDate, fmtTime, fmtMinutes, getDuration, getErrorMessage } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Input, Textarea, Select, Toggle, Spinner, Alert, EmptyState, Divider, Modal, ToastContainer, Skeleton } from '../ui'
import { analyticsApi } from '../../lib/api'
import api from '../../lib/api'
import { unsubscribeAll } from '../../lib/pushNotifications'

// ── Sidebar nav items ──────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview', label: 'Overview',     icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { id: 'feed',     label: 'Activity Feed', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { id: 'workers',  label: 'Workers',       icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'attendance', label: 'Attendance',  icon: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v5l4 2' },
  { id: 'payroll',  label: 'Payroll',      icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { id: 'settings', label: 'Settings',     icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
]

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, loading, delay = 0 }) {
  return (
    <div className="anim-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <Card hover>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'var(--font-mono)' }}>{label}</div>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 4 }} />
        </div>
        {loading ? <Skeleton height={36} style={{ marginBottom: 6 }} /> : (
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-display)', fontStyle: 'italic', color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{sub}</div>
      </Card>
    </div>
  )
}

// ── Verify Drawer ─────────────────────────────────────────────────────────────
function VerifyDrawer({ activity, onClose, onVerify }) {
  const [decision, setDecision] = useState('approved')
  const [feedback, setFeedback] = useState(activity?.admin_feedback || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!activity) return null
  const dur = getDuration(activity.start_time, activity.end_time)

  const handleVerify = async () => {
    if (decision === 'rejected' && !feedback.trim()) { setError('Feedback is mandatory when rejecting'); return }
    setLoading(true); setError('')
    try {
      await onVerify(activity.id, { verification_status: decision, admin_feedback: feedback || undefined })
      onClose()
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40, animation: 'fadeIn 0.2s ease' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-xl)', animation: 'slideInRight 0.28s ease',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Review Activity</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {/* Worker */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={activity.worker?.name} size={44} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{activity.worker?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              {activity.worker?.department || 'Worker'} · {activity.worker?.email}
            </div>
          </div>
        </div>

        {/* Task detail */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Task</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{activity.task_title}</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtDate(activity.date)}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtTime(activity.start_time)} → {fmtTime(activity.end_time)}</span>
            {dur && <span style={{ fontSize: 12, color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtMinutes(dur)}</span>}
            <Badge status={activity.status} />
          </div>
          <div style={{
            fontSize: 13, color: 'var(--text2)', lineHeight: 1.65,
            background: 'var(--surface2)', padding: '14px 16px', borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
          }}>
            {activity.description}
          </div>
          {activity.admin_feedback && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--amber-s)', borderLeft: '3px solid var(--amber)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--amber)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>Previous Feedback</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{activity.admin_feedback}</div>
            </div>
          )}
          {/* FIX: activities don't carry screenshots; screenshots come from check-ins on the shift */}
        </div>

        {/* Decision */}
        <div style={{ padding: '18px 22px', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Your Decision</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[['approved','Approve','var(--emerald)','var(--emerald-s)','var(--emerald-b)'],['rejected','Reject','var(--rose)','var(--rose-s)','var(--rose-b)']].map(([v,l,color,bg,border]) => (
              <button key={v} onClick={() => setDecision(v)} style={{
                padding: '10px 12px', borderRadius: 'var(--r)',
                border: `1.5px solid ${decision === v ? border : 'var(--border)'}`,
                background: decision === v ? bg : 'var(--surface2)',
                color: decision === v ? color : 'var(--text3)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 13,
                transition: 'all 0.15s',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <Textarea
              label={`Feedback ${decision === 'rejected' ? '(required)' : '(optional)'}`}
              value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder={decision === 'rejected' ? 'Why is this rejected?' : 'Leave a note for the worker…'}
              rows={3}
            />
          </div>
          {error && <Alert message={error} type="error" style={{ marginBottom: 12 }} />}
          <Button
            variant={decision === 'approved' ? 'success' : 'danger'}
            size="lg" fullWidth onClick={handleVerify} disabled={loading}
          >
            {loading ? <><Spinner size={14} color={decision === 'approved' ? 'var(--emerald)' : 'var(--rose)'} /> Processing…</> : `${decision === 'approved' ? 'Approve' : 'Reject'} Activity`}
          </Button>
        </div>
      </div>
    </>
  )
}

// ── Activity table ────────────────────────────────────────────────────────────
function ActivityTable({ activities, workers, loading, onReview }) {
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [workerF, setWorkerF] = useState('all')
  const [deptF, setDeptF] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  const allFiltered = activities.filter(a => {
    const ms = !search || a.task_title.toLowerCase().includes(search.toLowerCase()) || a.worker?.name?.toLowerCase().includes(search.toLowerCase())
    const mv = statusF === 'all' || a.verification_status === statusF
    const mw = workerF === 'all' || String(a.worker_id) === workerF
    const md = deptF === 'all' || a.worker?.department === deptF
    return ms && mv && mw && md
  })
  const filtered = allFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(allFiltered.length / PAGE_SIZE)

  const exportData = (fmt) => analyticsApi.triggerExport({ verification_status: statusF !== 'all' ? statusF : undefined, fmt })

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search task or worker…"
            style={{ width: '100%', padding: '9px 12px 9px 32px', fontSize: 13, fontFamily: 'var(--font-sans)', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text)', outline: 'none' }} />
        </div>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ padding: '9px 12px', fontSize: 13, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={workerF} onChange={e => setWorkerF(e.target.value)} style={{ padding: '9px 12px', fontSize: 13, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          <option value="all">All Workers</option>
          {workers.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
        </select>
        <select value={deptF} onChange={e => setDeptF(e.target.value)} style={{ padding: '9px 12px', fontSize: 13, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          <option value="all">All Departments</option>
          {[...new Set(workers.map(w => w.department).filter(Boolean))].map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => exportData('csv')}>⬇ CSV</Button>
        <Button variant="secondary" onClick={() => exportData('xlsx')}>⬇ Excel</Button>
      </div>

      {/* Responsive Activity List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} height={80} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔎" title="No results" sub="Try different filters." />
        ) : filtered.map((a, i) => {
          const dur = getDuration(a.start_time, a.end_time)
          return (
            <div key={a.id} className="anim-fade-up" style={{
              animationDelay: `${i * 35}ms`,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)', padding: '14px 16px',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
            >
              {/* Top row: worker + action */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={a.worker?.name} size={32} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{a.worker?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.worker?.department}</div>
                  </div>
                </div>
                <Button variant={a.verification_status === 'pending' ? 'primary' : 'secondary'} size="sm" onClick={() => onReview(a)}>
                  {a.verification_status === 'pending' ? 'Review' : 'View'}
                </Button>
              </div>

              {/* Task */}
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{a.task_title}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.4 }}>
                {a.description?.slice(0, 80)}{a.description?.length > 80 ? '…' : ''}
              </div>

              {/* Bottom row: date + duration + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{fmtDate(a.date)}</span>
                {dur && <span style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtMinutes(dur)}</span>}
                <Badge status={a.verification_status} />
              </div>
            </div>
          )
        })}
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface)', color: page === 1 ? 'var(--text3)' : 'var(--text)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)' }}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface)', color: page === totalPages ? 'var(--text3)' : 'var(--text)', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)' }}>Next →</button>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'right' }}>{allFiltered.length} total records</div>
    </div>
  )
}

// ── Workers table ─────────────────────────────────────────────────────────────
function WorkersPanel({ workers, loading, onCreate, onToggle, onDelete }) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'worker', department: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) { setError('Name, email and password are required'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError('')
    try { await onCreate(form); setShowModal(false); setForm({ name: '', email: '', password: '', role: 'worker', department: '' }) }
    catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 3 }}>Workers</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>{workers.filter(w => w.is_active).length} active · {workers.filter(w => !w.is_active).length} suspended</div>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Add Worker</Button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(4)].map((_, i) => <Skeleton key={i} height={56} />)}
          </div>
        ) : workers.length === 0 ? (
          <EmptyState icon="👥" title="No workers yet" sub="Add your first team member." />
        ) : workers.map((w, i) => (
          <div key={w.id} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
            borderBottom: i < workers.length - 1 ? '1px solid var(--border)' : 'none',
            opacity: w.is_active ? 1 : 0.55, transition: 'opacity 0.2s',
          }}>
            <Avatar name={w.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{w.department || 'No department'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.email}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <Badge status={w.is_active ? 'active' : 'suspended'} />
              <div style={{ display: 'flex', gap: 6 }}>
                <Toggle checked={w.is_active} onChange={() => onToggle(w.id, w.is_active)} />
                <Button variant="danger" size="sm" onClick={() => { if (confirm(`Delete ${w.name}?`)) onDelete(w.id) }}>Remove</Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Team Member">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <Alert message={error} type="error" onClose={() => setError('')} />}
          <Input label="Full Name" required value={form.name} onChange={e => set('name')(e.target.value)} placeholder="Jane Smith" />
          <Input label="Email" type="email" required value={form.email} onChange={e => set('email')(e.target.value)} placeholder="jane@company.io" />
          <Input label="Password" type="password" required value={form.password} onChange={e => set('password')(e.target.value)} placeholder="Min. 8 characters" />
          <Input label="Department" value={form.department} onChange={e => set('department')(e.target.value)} placeholder="e.g. Engineering" />
          <Select label="Role" value={form.role} onChange={set('role')} options={[{ value: 'worker', label: 'Worker' }, { value: 'admin', label: 'Admin' }]} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving}>
              {saving ? <><Spinner size={13} color="#fff" /> Creating…</> : 'Create Account'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Admin dashboard ───────────────────────────────────────────────────────────

// ── Payroll Panel ────────────────────────────────────────────────────────────
function PayrollPanel({ workers }) {
  const [rates, setRates] = useState([])
  const [payroll, setPayroll] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rateForm, setRateForm] = useState({ department: '', amount: '', currency: 'USD' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const departments = [...new Set(workers.map(w => w.department).filter(Boolean))]

  const loadRates = async () => {
    const { data } = await api.get('/payroll/rates')
    setRates(data)
  }

  const loadPayroll = async () => {
    setLoading(true)
    try {
      const params = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const { data } = await api.get('/payroll/summary', { params })
      setPayroll(data)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    loadRates()
    loadPayroll()
  }, [])

  const saveRate = async () => {
    setError('')
    if (!rateForm.department) { setError('Select a department'); return }
    if (!rateForm.amount || isNaN(parseFloat(rateForm.amount))) { setError('Enter a valid hourly rate'); return }
    setSaving(true)
    try {
      await api.post('/payroll/rates', {
        department: rateForm.department,
        hourly_rate_cents: Math.round(parseFloat(rateForm.amount) * 100),
        currency: rateForm.currency,
      })
      await loadRates()
      setSaved(true)
      setRateForm({ department: '', amount: '', currency: 'USD' })
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save rate')
    } finally { setSaving(false) }
  }

  const deleteRate = async (dept) => {
    if (!confirm(`Remove rate for ${dept}?`)) return
    await api.delete(`/payroll/rates/${encodeURIComponent(dept)}`)
    await loadRates()
  }

  const fmt = (cents, currency) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(cents / 100)
  }

  const totalPayroll = payroll.reduce((s, w) => s + w.gross_pay_cents, 0)
  const totalHours = payroll.reduce((s, w) => s + w.total_hours, 0)
  const totalTasks = payroll.reduce((s, w) => s + w.outlier_tasks_total, 0)

  return (
    <div style={{ padding: '28px 24px', maxWidth: 800 }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Payroll</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>Set hourly rates per department and view worker pay summaries.</div>

      {/* Rate setter */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>💰 Set Hourly Rate by Department</div>
        {error && <Alert message={error} type="error" onClose={() => setError('')} style={{ marginBottom: 12 }} />}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>DEPARTMENT</label>
            <select value={rateForm.department} onChange={e => setRateForm(f => ({ ...f, department: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
              <option value="">Select dept...</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>HOURLY RATE</label>
            <input type="number" min="0" step="0.01" placeholder="e.g. 15.00"
              value={rateForm.amount} onChange={e => setRateForm(f => ({ ...f, amount: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>CURRENCY</label>
            <select value={rateForm.currency} onChange={e => setRateForm(f => ({ ...f, currency: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}>
              {['USD','EUR','GBP','NGN','GHS','KES','ZAR','CAD','AUD'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Button variant="primary" onClick={saveRate} disabled={saving} style={{ height: 38, flexShrink: 0 }}>
            {saving ? <><Spinner size={12} color="#fff" /> Saving…</> : saved ? '✓ Saved' : 'Set Rate'}
          </Button>
        </div>

        {/* Current rates table */}
        {rates.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Current Rates</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rates.map(r => (
                <div key={r.department} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.department}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--emerald)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(r.hourly_rate_cents, r.currency)}/hr</span>
                    <button onClick={() => deleteRate(r.department)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose)', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Date filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>FROM DATE</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>TO DATE</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <Button variant="secondary" onClick={loadPayroll} style={{ height: 38, flexShrink: 0 }}>Apply Filter</Button>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Payroll', value: fmt(totalPayroll, payroll[0]?.currency || 'USD'), color: 'var(--emerald)' },
          { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: 'var(--primary)' },
          { label: 'Outlier Tasks', value: totalTasks, color: 'var(--violet)' },
          { label: 'Workers', value: payroll.length, color: 'var(--text3)' },
        ].map(c => (
          <div key={c.label} style={{ padding: '10px 18px', borderRadius: 'var(--r)', background: 'var(--surface2)', border: '1px solid var(--border)', textAlign: 'center', flex: '1 1 100px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>{c.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Worker payroll list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height={90} />)}
        </div>
      ) : payroll.length === 0 ? (
        <EmptyState icon="💸" title="No payroll data" sub="Workers haven't completed any shifts yet." />
      ) : payroll.map((w, i) => (
        <div key={w.worker_id} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: '16px 18px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={w.worker_name} size={36} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{w.worker_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{w.department || 'No department'}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--emerald)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
                {fmt(w.gross_pay_cents, w.currency)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {w.hourly_rate_cents > 0 ? `${fmt(w.hourly_rate_cents, w.currency)}/hr` : 'No rate set'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text3)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <span>Hours: <strong style={{ color: 'var(--primary)' }}>{w.total_hours}h</strong></span>
            <span>Shifts: <strong style={{ color: 'var(--text)' }}>{w.shift_count}</strong></span>
            <span>Check-ins: <strong style={{ color: 'var(--text)' }}>{w.check_in_count}</strong></span>
            <span>Outlier Tasks: <strong style={{ color: 'var(--violet)' }}>{w.outlier_tasks_total}</strong></span>
          </div>
          {w.hourly_rate_cents === 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
              ⚠ No hourly rate set for "{w.department}" — set one above to calculate pay.
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel() {
  const [schedule, setSchedule] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ clock_in_deadline_hour: 9, clock_in_deadline_minute: 0, checkin_interval_minutes: 120, grace_period_minutes: 15 })

  useEffect(() => {
    api.get('/shifts/schedule').then(r => {
      setSchedule(r.data)
      setForm(r.data)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.patch('/shifts/schedule', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  if (!schedule) return <div style={{ padding: 32 }}><Skeleton height={200} /></div>

  return (
    <div style={{ padding: '28px 24px', maxWidth: 520 }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Work Schedule Settings</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>Configure punctuality rules and check-in intervals for all workers.</div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⏰ Clock-In Deadline</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>HOUR (0–23 UTC)</label>
            <input type="number" min={0} max={23} value={form.clock_in_deadline_hour}
              onChange={e => setForm(f => ({ ...f, clock_in_deadline_hour: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>MINUTE (0–59)</label>
            <input type="number" min={0} max={59} value={form.clock_in_deadline_minute}
              onChange={e => setForm(f => ({ ...f, clock_in_deadline_minute: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-mono)' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
          Current deadline: <strong>{String(form.clock_in_deadline_hour).padStart(2,'0')}:{String(form.clock_in_deadline_minute).padStart(2,'0')} UTC</strong>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>🔔 Check-In Interval</div>
        <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>MINUTES BETWEEN CHECK-INS</label>
        <input type="number" min={15} max={480} value={form.checkin_interval_minutes}
          onChange={e => setForm(f => ({ ...f, checkin_interval_minutes: parseInt(e.target.value) }))}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-mono)' }} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          Workers must submit a screenshot + task count every <strong>{form.checkin_interval_minutes} minutes</strong>. Missing a check-in blocks their shift.
        </div>
      </Card>

      <Card style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚡ Grace Period</div>
        <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>MINUTES AFTER DEADLINE BEFORE BLOCKING</label>
        <input type="number" min={0} max={60} value={form.grace_period_minutes}
          onChange={e => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) }))}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-mono)' }} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          Workers who clock in within <strong>{form.grace_period_minutes} minutes</strong> after the deadline are flagged late but not blocked.
        </div>
      </Card>

      <Button variant="primary" onClick={save} disabled={saving} style={{ minWidth: 140 }}>
        {saving ? <><Spinner size={13} color="#fff" /> Saving…</> : saved ? '✓ Saved' : 'Save Settings'}
      </Button>

      {/* ── Weekly Schedule ── */}
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 36, marginBottom: 6 }}>Weekly Work Schedule</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Set working hours per day of the week. Workers cannot clock in outside these hours.</div>
      <WeeklyScheduleEditor />

      {/* ── Holidays ── */}
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 36, marginBottom: 6 }}>Holidays & Off Days</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Block specific dates — workers cannot clock in on these days.</div>
      <HolidayEditor />
    </div>
  )
}

// ── Weekly Schedule Editor ────────────────────────────────────────────────────
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function WeeklyScheduleEditor() {
  const [days, setDays] = useState([])
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    api.get('/schedule/days').then(r => setDays(r.data))
  }, [])

  const update = async (dow, field, value) => {
    setDays(prev => prev.map(d => d.day_of_week === dow ? { ...d, [field]: value } : d))
  }

  const save = async (dow) => {
    const d = days.find(x => x.day_of_week === dow)
    if (!d) return
    setSaving(dow)
    try {
      await api.put(`/schedule/days/${dow}`, {
        is_working_day: d.is_working_day,
        work_start_hour: d.work_start_hour,
        work_start_minute: d.work_start_minute,
        work_end_hour: d.work_end_hour,
        work_end_minute: d.work_end_minute,
      })
    } finally { setSaving(null) }
  }

  if (!days.length) return <Skeleton height={300} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {days.map(d => (
        <Card key={d.day_of_week} style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 96, fontSize: 13, fontWeight: 600 }}>{DAY_NAMES[d.day_of_week]}</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}>
              <input type="checkbox" checked={d.is_working_day}
                onChange={e => update(d.day_of_week, 'is_working_day', e.target.checked)}
                style={{ accentColor: 'var(--primary)', width: 14, height: 14 }} />
              Working day
            </label>
            {d.is_working_day && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>Start</span>
                  <input type="number" min={0} max={23} value={d.work_start_hour}
                    onChange={e => update(d.day_of_week, 'work_start_hour', parseInt(e.target.value))}
                    style={{ width: 50, padding: '5px 8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                  <span style={{ color: 'var(--text3)' }}>:</span>
                  <input type="number" min={0} max={59} value={d.work_start_minute}
                    onChange={e => update(d.day_of_week, 'work_start_minute', parseInt(e.target.value))}
                    style={{ width: 50, padding: '5px 8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>End</span>
                  <input type="number" min={0} max={23} value={d.work_end_hour}
                    onChange={e => update(d.day_of_week, 'work_end_hour', parseInt(e.target.value))}
                    style={{ width: 50, padding: '5px 8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                  <span style={{ color: 'var(--text3)' }}>:</span>
                  <input type="number" min={0} max={59} value={d.work_end_minute}
                    onChange={e => update(d.day_of_week, 'work_end_minute', parseInt(e.target.value))}
                    style={{ width: 50, padding: '5px 8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>UTC</div>
              </>
            )}
            {!d.is_working_day && <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Off day</span>}
            <Button variant="secondary" size="sm" onClick={() => save(d.day_of_week)} disabled={saving === d.day_of_week} style={{ marginLeft: 'auto' }}>
              {saving === d.day_of_week ? <Spinner size={11} /> : 'Save'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Holiday Editor ────────────────────────────────────────────────────────────
function HolidayEditor() {
  const [holidays, setHolidays] = useState([])
  const [form, setForm] = useState({ date: '', name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await api.get('/schedule/holidays')
    setHolidays(data)
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    setError('')
    if (!form.date || !form.name.trim()) { setError('Date and name are required'); return }
    setSaving(true)
    try {
      await api.post('/schedule/holidays', form)
      setForm({ date: '', name: '' })
      await load()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to add holiday')
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    await api.delete(`/schedule/holidays/${id}`)
    await load()
  }

  return (
    <div>
      {error && <Alert message={error} type="error" onClose={() => setError('')} style={{ marginBottom: 12 }} />}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>DATE</label>
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: '2 1 180px' }}>
          <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>HOLIDAY NAME</label>
          <input type="text" placeholder="e.g. Christmas Day" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <Button variant="primary" onClick={add} disabled={saving} style={{ height: 38, flexShrink: 0 }}>
          {saving ? <Spinner size={12} color="#fff" /> : '+ Add'}
        </Button>
      </div>
      {holidays.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No holidays added yet.</div>
      ) : holidays.map(h => (
        <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 6 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginLeft: 10 }}>{h.date}</span>
          </div>
          <button onClick={() => remove(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      ))}
    </div>
  )
}

// ── Attendance Panel ──────────────────────────────────────────────────────────
function AttendancePanel({ workers }) {
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [unblocking, setUnblocking] = useState(null)
  // FIX: history support
  const [viewMode, setViewMode] = useState('today') // 'today' | 'history'
  const [histDateFrom, setHistDateFrom] = useState('')
  const [histDateTo, setHistDateTo] = useState('')
  const [histWorkerId, setHistWorkerId] = useState('all')
  // FIX: unblock reason modal
  const [unblockModal, setUnblockModal] = useState(null) // shiftId or null
  const [unblockReason, setUnblockReason] = useState('')
  // FIX: expanded check-in screenshots
  const [expandedShift, setExpandedShift] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      if (viewMode === 'today') {
        const { data } = await api.get('/shifts/admin/today')
        setShifts(data)
      } else {
        const params = {}
        if (histDateFrom) params.date_from = histDateFrom
        if (histDateTo) params.date_to = histDateTo
        if (histWorkerId !== 'all') params.worker_id = histWorkerId
        const { data } = await api.get('/shifts/admin/history', { params })
        setShifts(data)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [viewMode])

  const openUnblockModal = (shiftId) => { setUnblockModal(shiftId); setUnblockReason('') }

  const confirmUnblock = async () => {
    if (!unblockModal) return
    setUnblocking(unblockModal)
    try {
      await api.post(`/shifts/${unblockModal}/unblock`, null, {
        params: unblockReason.trim() ? { reason: unblockReason.trim() } : {}
      })
      setUnblockModal(null)
      await load()
    } finally { setUnblocking(null) }
  }

  const totalTasks = (s) => s.check_ins?.reduce((a, c) => a + (c.outlier_tasks_completed || 0), 0) || 0

  return (
    <div style={{ padding: '28px 24px' }}>
      {/* FIX: Lightbox */}
      {lightboxUrl && (
        <>
          <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, cursor: 'zoom-out', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={lightboxUrl} alt="Screenshot" style={{ maxWidth: '95vw', maxHeight: '95vh', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-xl)' }} />
          </div>
        </>
      )}

      {/* FIX: Unblock reason modal */}
      {unblockModal && (
        <>
          <div onClick={() => setUnblockModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(400px,90vw)', background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)', zIndex: 110, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>🔓 Unblock Shift</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.5 }}>
              Provide a reason for unblocking this shift. This will be saved to the audit trail.
            </div>
            <textarea
              value={unblockReason} onChange={e => setUnblockReason(e.target.value)}
              placeholder="e.g. Worker had technical issues submitting check-in"
              rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setUnblockModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmUnblock} disabled={unblocking === unblockModal}>
                {unblocking === unblockModal ? <Spinner size={12} color="var(--rose)" /> : 'Confirm Unblock'}
              </Button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Attendance</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* FIX: today / history toggle */}
          <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            {[['today','Today'],['history','History']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{ padding: '5px 12px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)', background: viewMode === v ? 'var(--surface)' : 'transparent', color: viewMode === v ? 'var(--text)' : 'var(--text3)', boxShadow: viewMode === v ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s' }}>{l}</button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={load}>↻ Refresh</Button>
        </div>
      </div>

      {/* FIX: History filters */}
      {viewMode === 'history' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 130px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>FROM</label>
            <input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>TO</label>
            <input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>WORKER</label>
            <select value={histWorkerId} onChange={e => setHistWorkerId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}>
              <option value="all">All Workers</option>
              {workers.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
            </select>
          </div>
          <Button variant="secondary" size="sm" onClick={load} style={{ height: 36, flexShrink: 0 }}>Search</Button>
        </div>
      )}

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: shifts.length, color: 'var(--primary)' },
          { label: 'On Time', value: shifts.filter(s => s.clock_in && !s.is_late).length, color: 'var(--emerald)' },
          { label: 'Late', value: shifts.filter(s => s.is_late && !s.is_blocked).length, color: 'var(--amber)' },
          { label: 'Blocked', value: shifts.filter(s => s.is_blocked).length, color: 'var(--rose)' },
          { label: 'Clocked Out', value: shifts.filter(s => s.clock_out).length, color: 'var(--text3)' },
        ].map(c => (
          <div key={c.label} style={{ padding: '8px 16px', borderRadius: 'var(--r)', background: 'var(--surface2)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>{c.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height={90} />)}
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState icon="📋" title="No shifts today" sub="Workers haven't clocked in yet." />
      ) : shifts.map((s, i) => {
        const worker = workers.find(w => w.id === s.worker_id)
        return (
          <div key={s.id} style={{
            background: 'var(--surface)', border: `1px solid ${s.is_blocked ? 'var(--rose-b)' : s.is_late ? 'var(--amber-b)' : 'var(--border)'}`,
            borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={worker?.name || 'Worker'} size={36} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{worker?.name || `Worker #${s.worker_id}`}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{worker?.department || ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {s.is_blocked && (
                  <Button variant="danger" size="sm" onClick={() => openUnblockModal(s.id)} disabled={unblocking === s.id}>
                    {unblocking === s.id ? <Spinner size={11} color="var(--rose)" /> : '🔓 Unblock'}
                  </Button>
                )}
                <Badge status={s.is_blocked ? 'blocked' : s.is_late ? 'pending' : 'approved'} label={s.is_blocked ? 'Blocked' : s.is_late ? 'Late' : 'On Time'} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
              {s.clock_in && <span>In: <strong style={{ color: 'var(--text)' }}>{new Date(s.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</strong></span>}
              {s.clock_out && <span>Out: <strong style={{ color: 'var(--text)' }}>{new Date(s.clock_out).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</strong></span>}
              {s.total_minutes && <span>Duration: <strong style={{ color: 'var(--primary)' }}>{Math.floor(s.total_minutes/60)}h {s.total_minutes%60}m</strong></span>}
              {s.minutes_late && <span style={{ color: 'var(--amber)' }}>⚠ {s.minutes_late}min late</span>}
              <span>Check-ins: <strong style={{ color: 'var(--text)' }}>{s.check_ins?.length || 0}</strong></span>
              <span>Outlier Tasks: <strong style={{ color: 'var(--emerald)' }}>{totalTasks(s)}</strong></span>
            </div>

            {s.is_blocked && s.block_reason && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--rose-s)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--rose)', borderLeft: '3px solid var(--rose)' }}>
                {s.block_reason}
              </div>
            )}

            {/* FIX: check-in screenshots viewer */}
            {s.check_ins?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <button onClick={() => setExpandedShift(expandedShift === s.id ? null : s.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--primary)', fontFamily: 'var(--font-sans)', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={expandedShift === s.id ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
                  </svg>
                  {expandedShift === s.id ? 'Hide' : 'View'} check-in screenshots ({s.check_ins.length})
                </button>
                {expandedShift === s.id && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {s.check_ins.map((ci, idx) => (
                      <div key={ci.id} style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                            Check-in #{idx + 1} · {new Date(ci.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
                            <span>Tasks: <strong style={{ color: 'var(--emerald)' }}>{ci.outlier_tasks_completed}</strong></span>
                            {ci.note && <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>"{ci.note}"</span>}
                          </div>
                        </div>
                        <img
                          src={ci.screenshot_url} alt={`Check-in ${idx + 1} screenshot`}
                          onClick={() => setLightboxUrl(ci.screenshot_url)}
                          style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', cursor: 'zoom-in' }}
                        />
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Click to view full size</div>
                      </div>
                    ))}
                    {s.screenshot_url && (
                      <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--violet-b)', padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--violet)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>📸 Final Clock-Out Screenshot</div>
                        <img
                          src={s.screenshot_url} alt="Clock-out screenshot"
                          onClick={() => setLightboxUrl(s.screenshot_url)}
                          style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--violet-b)', cursor: 'zoom-in' }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AdminDashboard() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { dark, toggle: toggleTheme } = useThemeStore()
  const [tab, setTab] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawer, setDrawer] = useState(null)

  const { activities, loading: actLoading, verify } = useActivities({ limit: 200 })
  const { workers, loading: workerLoading, create, toggleActive, remove } = useWorkers()
  const { stats, weekly, loading: statsLoading } = useDashboardStats()
  const { toasts, toast, removeToast } = useToast()

  const pending = activities.filter(a => a.verification_status === 'pending').length

  const handleVerify = async (id, payload) => {
    try { await verify(id, payload); toast(`Activity ${payload.verification_status}`) }
    catch (err) { toast(getErrorMessage(err), 'error') }
  }

  const handleCreateWorker = async (data) => {
    await create(data)
    toast('Worker account created')
  }

  const handleToggleWorker = async (id, isActive) => {
    await toggleActive(id, isActive)
    toast(isActive ? 'Account suspended' : 'Account activated')
  }

  const handleDeleteWorker = async (id) => {
    await remove(id)
    toast('Worker removed')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 220 : 64, flexShrink: 0,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'width 0.25s ease',
      }}>
        {/* Logo */}
        <div style={{ padding: sidebarOpen ? '22px 20px 18px' : '22px 12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {sidebarOpen ? (
            <>
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
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>Admin Console</div>
            </>
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 8px', flex: 1 }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: sidebarOpen ? '9px 12px' : '9px', borderRadius: 'var(--r)',
              border: 'none', cursor: 'pointer', marginBottom: 2,
              background: tab === item.id ? 'var(--primary-s)' : 'transparent',
              color: tab === item.id ? 'var(--primary)' : 'var(--text3)',
              fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 13,
              transition: 'all 0.15s', justifyContent: sidebarOpen ? 'space-between' : 'center',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ flexShrink: 0 }}>
                  <path d={item.icon} />
                </svg>
                {sidebarOpen && item.label}
              </span>
              {sidebarOpen && item.id === 'feed' && pending > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: 'var(--amber)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pending}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        {sidebarOpen && (
          <div style={{ padding: '12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', background: 'var(--surface2)' }}>
              <Avatar name={user?.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Admin</div>
              </div>
              <button onClick={async () => { await unsubscribeAll(); logout() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{ height: 54, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', background: 'var(--surface)', flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4, borderRadius: 'var(--r-sm)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{NAV.find(n => n.id === tab)?.label}</div>
          {pending > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 'var(--r-full)', background: 'var(--amber-s)', border: '1px solid var(--amber-b)', color: 'var(--amber)', fontSize: 12, fontWeight: 500 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {pending} pending
            </div>
          )}
          <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, display: 'flex', borderRadius: 'var(--r-sm)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {dark ? <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 3 }}>
                  Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : new Date().getHours() < 21 ? 'evening' : 'night'}, {user?.name?.split(' ')[0]} 👋
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                <StatCard label="Active Workers" value={statsLoading ? '—' : stats?.active_workers_today} sub="clocked in today" color="var(--primary)" loading={statsLoading} delay={0} />
                <StatCard label="Pending Review" value={statsLoading ? '—' : stats?.pending_verifications} sub="need attention" color="var(--amber)" loading={statsLoading} delay={80} />
                <StatCard label="Approved Today" value={statsLoading ? '—' : stats?.approved_today} sub="verified ✓" color="var(--emerald)" loading={statsLoading} delay={160} />
                <StatCard label="Hours Logged" value={statsLoading ? '—' : fmtMinutes(stats?.total_minutes_today)} sub="today's shifts" color="var(--violet)" loading={statsLoading} delay={240} />
              </div>

              {/* Charts */}
              {weekly.length === 0 && !statsLoading && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13, gridColumn: '1 / -1' }}>
                  No activity data yet — charts will populate once workers start logging tasks.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 28 }}>
                <Card className="anim-fade-up" style={{ animationDelay: '300ms' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Hours Logged — Last 7 Days</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={weekly}>
                      <defs>
                        <linearGradient id="aHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="day" interval={0} tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12 }} cursor={{ stroke: 'var(--border)' }}/>
                      <Area type="monotone" dataKey="hours" stroke="var(--primary)" strokeWidth={2} fill="url(#aHours)" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="anim-fade-up" style={{ animationDelay: '380ms' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Tasks Submitted — Last 7 Days</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={weekly} barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="day" interval={0} tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12 }} cursor={{ fill: 'var(--surface2)' }}/>
                      <Bar dataKey="tasks" fill="var(--emerald)" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* Quick pending */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Needs Review</div>
                  <Button variant="ghost" size="sm" onClick={() => setTab('feed')}>View all →</Button>
                </div>
                {activities.filter(a => a.verification_status === 'pending').slice(0, 4).map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <Avatar name={a.worker?.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.task_title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.worker?.name} · {fmtDate(a.date)}</div>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => { setDrawer(a); setTab('feed') }}>Review</Button>
                  </div>
                ))}
                {pending === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>✓ All activities reviewed!</div>}
              </Card>
            </div>
          )}

          {tab === 'feed' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 3 }}>Activity Feed</div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>{activities.length} submissions · {pending} pending</div>
              </div>
              <ActivityTable activities={activities} workers={workers} loading={actLoading} onReview={a => setDrawer(a)} />
            </div>
          )}

          {tab === 'workers' && (
            <WorkersPanel
              workers={workers} loading={workerLoading}
              onCreate={handleCreateWorker}
              onToggle={handleToggleWorker}
              onDelete={handleDeleteWorker}
            />
          )}
        </div>
      </div>

      {/* Verify drawer */}
      {drawer && <VerifyDrawer activity={drawer} onClose={() => setDrawer(null)} onVerify={handleVerify} />}

      {/* Settings & Attendance panels rendered as full-page overlays over main content */}
      {(tab === 'settings' || tab === 'attendance' || tab === 'payroll') && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 220, background: 'var(--bg)', zIndex: 10, overflowY: 'auto' }}>
          {tab === 'settings' && <SettingsPanel />}
          {tab === 'attendance' && <AttendancePanel workers={workers} />}
          {tab === 'payroll' && <PayrollPanel workers={workers} />}
        </div>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
