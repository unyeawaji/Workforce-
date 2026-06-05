import { useState } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useActivities, useWorkers, useDashboardStats, useToast } from '../../hooks'
import { fmtDate, fmtTime, fmtMinutes, getDuration, getErrorMessage } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Input, Textarea, Select, Toggle, Spinner, Alert, EmptyState, Divider, Modal, ToastContainer, Skeleton } from '../ui'
import { analyticsApi } from '../../lib/api'

// ── Sidebar nav items ──────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview', label: 'Overview',     icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { id: 'feed',     label: 'Activity Feed', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { id: 'workers',  label: 'Workers',       icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
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
          {activity.worker?.screenshot_url && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>📸 Work Screenshot</div>
              <a href={activity.worker.screenshot_url} target="_blank" rel="noopener noreferrer">
                <img src={activity.worker.screenshot_url} alt="Work screenshot"
                  style={{ width: '100%', borderRadius: 'var(--r)', border: '1px solid var(--border)', cursor: 'zoom-in', maxHeight: 240, objectFit: 'cover' }} />
              </a>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Click to view full size</div>
            </div>
          )}
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
export default function AdminDashboard() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { dark, toggle: toggleTheme } = useThemeStore()
  const [tab, setTab] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawer, setDrawer] = useState(null)

  const { activities, loading: actLoading, verify } = useActivities()
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
              <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>AİİИDUCTION</div>
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
              <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}>
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
                  Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.name?.split(' ')[0]} 👋
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
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
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
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
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

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
