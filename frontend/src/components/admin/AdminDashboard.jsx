import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useActivities, useWorkers, useDashboardStats, useToast, usePendingApplicationsCount } from '../../hooks'
import { fmtDate, fmtTime, fmtMinutes, getDuration, getErrorMessage } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Input, Textarea, Select, Toggle, Spinner, Alert, EmptyState, Divider, Modal, ToastContainer, Skeleton, StarDisplay } from '../ui'
import { analyticsApi, applicationsApi, clientsApi, usersApi, invitesApi, sysApi } from '../../lib/api'
import api from '../../lib/api'
import { unsubscribeAll, registerSW, requestAndSubscribe, isPushSubscribed } from '../../lib/pushNotifications'

// ── Sidebar nav items ──────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',      label: 'Overview',      icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { id: 'feed',          label: 'Activity Feed', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { id: 'workers',       label: 'Workers',       icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'applications',  label: 'Applications',  icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { id: 'clients',       label: 'Clients',       icon: 'M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM12 12h.01M8 12h.01M16 12h.01' },
  { id: 'attendance',    label: 'Attendance',    icon: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v5l4 2' },
  { id: 'reviews',       label: 'Reviews',       icon: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z' },
  { id: 'payroll',       label: 'Payroll',       icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { id: 'invites',      label: 'Invites',       icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  { id: 'settings',      label: 'Settings',      icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
]

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, loading, delay = 0 }) {
  return (
    <div className="anim-stat" style={{ animationDelay: `${delay}ms` }}>
      <Card hover accent={color}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'var(--font-mono)' }}>{label}</div>
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

  // Deactivation reason capture — only shown when suspending an active worker
  const [deactivateTarget, setDeactivateTarget] = useState(null) // worker being suspended
  const [deactivateReason, setDeactivateReason] = useState('')
  const [deactivating, setDeactivating] = useState(false)

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) { setError('Name, email and password are required'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError('')
    try { await onCreate(form); setShowModal(false); setForm({ name: '', email: '', password: '', role: 'worker', department: '' }) }
    catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  const handleToggleClick = (worker) => {
    if (worker.is_active) {
      // Suspending — collect a reason first
      setDeactivateTarget(worker)
      setDeactivateReason('')
    } else {
      // Reactivating — no reason needed
      onToggle(worker.id, worker.is_active)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await onToggle(deactivateTarget.id, deactivateTarget.is_active, deactivateReason.trim() || null)
      setDeactivateTarget(null)
    } finally {
      setDeactivating(false)
    }
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
                {!w.is_active && w.deactivated_reason && (
                  <span style={{ color: 'var(--rose)', fontStyle: 'italic' }}>
                    Suspended: {w.deactivated_reason}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <Badge status={w.is_active ? 'active' : 'suspended'} />
              <div style={{ display: 'flex', gap: 6 }}>
                <Toggle checked={w.is_active} onChange={() => handleToggleClick(w)} />
                <Button variant="danger" size="sm" onClick={() => { if (confirm(`Permanently delete ${w.name}? This removes all their shift and activity history and cannot be undone. Consider suspending instead if you just want to revoke access.`)) onDelete(w.id) }}>Remove</Button>
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

      <Modal open={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} title={`Suspend ${deactivateTarget?.name || ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
            This revokes their access and closes out any shift they're currently clocked into.
            Their shift and payroll history is kept. Add a reason for the record (optional, but recommended).
          </div>
          <Textarea
            label="Reason (optional)"
            value={deactivateReason}
            onChange={e => setDeactivateReason(e.target.value)}
            placeholder="e.g. Contract ended, performance, no longer needed…"
            rows={3}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDeactivate} disabled={deactivating}>
              {deactivating ? <><Spinner size={13} color="#fff" /> Suspending…</> : 'Suspend Worker'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Admin dashboard ───────────────────────────────────────────────────────────


// ── Client Breakdown (payroll view) ──────────────────────────────────────────
function ClientBreakdown({ dateFrom, dateTo, fmt, rates }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = {}
        if (dateFrom) params.date_from = dateFrom
        if (dateTo) params.date_to = dateTo
        const { data } = await api.get('/shifts/', { params })
        // Group by client_name
        const map = {}
        for (const s of data) {
          const client = s.client_name || '(No client entered)'
          if (!map[client]) map[client] = { client, shifts: 0, total_minutes: 0, workers: new Set() }
          map[client].shifts++
          map[client].total_minutes += s.total_minutes || 0
          map[client].workers.add(s.worker_id)
        }
        setRows(Object.values(map).map(r => ({ ...r, workers: r.workers.size })).sort((a, b) => b.total_minutes - a.total_minutes))
      } finally { setLoading(false) }
    }
    load()
  }, [dateFrom, dateTo])

  if (loading) return <Skeleton height={100} style={{ marginTop: 24 }} />
  if (!rows.length) return null

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📊 Client Breakdown</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Hours worked per client across all workers in the selected period.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.client} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)', padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.client}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                {r.workers} worker{r.workers !== 1 ? 's' : ''} · {r.shifts} shift{r.shifts !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                {Math.floor(r.total_minutes / 60)}h {r.total_minutes % 60}m
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Payroll Panel ────────────────────────────────────────────────────────────
function PayrollPanel({ workers }) {
  const [rates, setRates] = useState([])
  const [payroll, setPayroll] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rateForm, setRateForm] = useState({ department: '', amount: '' })
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
      })
      await loadRates()
      setSaved(true)
      setRateForm({ department: '', amount: '' })
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

  // Group totals by currency — summing raw cents across different currencies
  // under one label would silently misreport the total, so each currency gets its own line.
  const totalsByCurrency = payroll.reduce((acc, w) => {
    const cur = w.currency || 'USD'
    acc[cur] = (acc[cur] || 0) + w.gross_pay_cents
    return acc
  }, {})
  const currencyKeys = Object.keys(totalsByCurrency)
  const totalPayrollDisplay = currencyKeys.length === 0
    ? fmt(0, 'USD')
    : currencyKeys.map(cur => fmt(totalsByCurrency[cur], cur)).join(' + ')
  const totalHours = payroll.reduce((s, w) => s + w.total_hours, 0)
  const totalTasks = payroll.reduce((s, w) => s + w.outlier_tasks_total, 0)

  return (
    <div className="page-pad" style={{ maxWidth: 800 }}>
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
            <div title="Set in Settings → Pay Currency" style={{
              padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)',
              background: 'var(--surface3)', color: 'var(--text3)', fontSize: 13, textAlign: 'center',
            }}>{rates[0]?.currency || 'USD'}</div>
          </div>
          <Button variant="primary" onClick={saveRate} disabled={saving} style={{ height: 38, flexShrink: 0 }}>
            {saving ? <><Spinner size={12} color="#fff" /> Saving…</> : saved ? '✓ Saved' : 'Set Rate'}
          </Button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
          Currency applies to your whole team — change it in <strong>Settings → Pay Currency</strong>.
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
          { label: 'Total Payroll', value: totalPayrollDisplay, color: 'var(--emerald)', wide: currencyKeys.length > 1 },
          { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: 'var(--primary)' },
          { label: 'Outlier Tasks', value: totalTasks, color: 'var(--violet)' },
          { label: 'Workers', value: payroll.length, color: 'var(--text3)' },
        ].map(c => (
          <div key={c.label} style={{ padding: '10px 18px', borderRadius: 'var(--r)', background: 'var(--surface2)', border: '1px solid var(--border)', textAlign: 'center', flex: c.wide ? '2 1 220px' : '1 1 100px' }}>
            <div style={{ fontSize: c.wide ? 15 : 20, fontWeight: 700, color: c.color, fontFamily: 'var(--font-display)', fontStyle: 'italic', whiteSpace: c.wide ? 'normal' : 'nowrap' }}>{c.value}</div>
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
                <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {w.worker_name}
                  {!w.is_active && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--text3)',
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r-full)', padding: '1px 8px',
                    }}>Deactivated</span>
                  )}
                </div>
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

      {/* ── Client Breakdown ─────────────────────────────────────────── */}
      {payroll.length > 0 && <ClientBreakdown dateFrom={dateFrom} dateTo={dateTo} fmt={fmt} rates={rates} />}
    </div>
  )
}

// ── Applications Panel ────────────────────────────────────────────────────────
function ReviewsPanel() {
  const [summary, setSummary] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterWorker, setFilterWorker] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [{ data: summaryData }, { data: reviewData }] = await Promise.all([
        clientsApi.reviewSummary(),
        clientsApi.teamReviews(filterWorker ? { worker_id: filterWorker } : undefined),
      ])
      setSummary(summaryData)
      setReviews(reviewData)
    } catch {
      setError('Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterWorker])

  return (
    <div className="page-pad" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 3 }}>Reviews</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>What clients are saying about your team.</div>

      {error && <div style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => <Skeleton key={i} height={64} />)}
        </div>
      ) : (
        <>
          {/* Per-worker average rating leaderboard */}
          {summary.length > 0 && (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 24, paddingBottom: 4 }}>
              {summary.map(s => (
                <button key={s.worker_id} onClick={() => setFilterWorker(filterWorker === s.worker_id ? null : s.worker_id)} style={{
                  flexShrink: 0, minWidth: 150, textAlign: 'left', padding: '14px 16px',
                  background: filterWorker === s.worker_id ? 'var(--primary-s)' : 'var(--surface)',
                  border: `1px solid ${filterWorker === s.worker_id ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-lg)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.worker_name}</div>
                  {s.average_rating != null ? (
                    <>
                      <StarDisplay rating={Math.round(s.average_rating)} size={13} />
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{s.average_rating} avg · {s.review_count} review{s.review_count !== 1 ? 's' : ''}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>No reviews yet</div>
                  )}
                </button>
              ))}
            </div>
          )}

          {filterWorker && (
            <Button variant="ghost" size="sm" onClick={() => setFilterWorker(null)} style={{ marginBottom: 12 }}>
              ← Show all workers
            </Button>
          )}

          {/* Review list */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            {reviews.length === 0 ? (
              <EmptyState icon="⭐" title="No reviews yet" sub="Reviews clients leave for your workers will show up here." />
            ) : reviews.map((r, i) => (
              <div key={r.id} style={{
                padding: '16px 20px',
                borderBottom: i < reviews.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={r.worker_name} size={32} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.worker_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>rated by {r.client_name}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <StarDisplay rating={r.rating} />
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                      {new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      {r.edited_at && ' · edited'}
                    </div>
                  </div>
                </div>
                {r.comment && (
                  <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, paddingLeft: 42 }}>{r.comment}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ApplicationsPanel({ onActioned }) {
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try { const { data } = await applicationsApi.list(); setApps(data) }
    catch { setError('Failed to load applications') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handle = async (id, action) => {
    setActing(id); setError('')
    try {
      if (action === 'approve') await applicationsApi.approve(id)
      else await applicationsApi.reject(id)
      await load()
      onActioned?.()
    } catch (e) { setError(e.response?.data?.detail || 'Action failed') }
    finally { setActing(null) }
  }

  const pending = apps.filter(a => a.status === 'pending')
  const reviewed = apps.filter(a => a.status !== 'pending')

  return (
    <div className="page-pad" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 4 }}>Applications</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
        People who applied to join your team. Approve to activate their account, reject to decline.
      </div>
      {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}
      {loading ? <Spinner /> : apps.length === 0 ? (
        <EmptyState icon="📋" title="No applications yet" sub="Share your team link at /apply so candidates can apply." />
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--amber)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                ⏳ Pending ({pending.length})
              </div>
              {pending.map(a => (
                <Card key={a.id} style={{ marginBottom: 12, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <Avatar name={a.full_name} size={44} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{a.full_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text3)' }}>{a.email}{a.phone ? ` · ${a.phone}` : ''}</div>
                      {a.cover_letter && (
                        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, lineHeight: 1.6,
                          background: 'var(--surface2)', padding: '10px 14px', borderRadius: 8, maxWidth: 480 }}>
                          {a.cover_letter}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: a.position_type === 'onboarding_assessment' ? 'rgba(8,145,178,.12)' : 'rgba(5,150,105,.12)',
                          color: a.position_type === 'onboarding_assessment' ? '#0891b2' : '#059669',
                        }}>
                          {a.position_type === 'onboarding_assessment' ? '📝 Onboarding & Assessment' : '✅ Tasker'}
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                          Applied {new Date(a.applied_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <Button variant="primary" size="sm" disabled={acting === a.id} onClick={() => handle(a.id, 'approve')}>
                        {acting === a.id ? <Spinner size={12} color="#fff" /> : '✓ Approve'}
                      </Button>
                      <Button variant="danger" size="sm" disabled={acting === a.id} onClick={() => handle(a.id, 'reject')}>
                        ✕ Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}
          {reviewed.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 12, marginTop: pending.length ? 28 : 0 }}>
                Reviewed ({reviewed.length})
              </div>
              {reviewed.map(a => (
                <Card key={a.id} style={{ marginBottom: 10, padding: '14px 20px', opacity: 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Avatar name={a.full_name} size={36} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.full_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{a.email}</div>
                      <div style={{ fontSize: 11, marginTop: 3, fontWeight: 600, color: a.position_type === 'onboarding_assessment' ? '#0891b2' : '#059669' }}>
                        {a.position_type === 'onboarding_assessment' ? '📝 Onboarding & Assessment' : '✅ Tasker'}
                      </div>
                    </div>
                    <Badge status={a.status === 'approved' ? 'active' : 'suspended'}>
                      {a.status === 'approved' ? '✓ Approved' : '✕ Rejected'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Clients Panel ─────────────────────────────────────────────────────────────
function ClientsPanel({ workers }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', worker_ids: [] })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [assigning, setAssigning]   = useState(null)
  const [assignIds, setAssignIds]   = useState([])
  const [resettingPw, setResettingPw] = useState(null)   // client id
  const [newPw, setNewPw]             = useState('')
  const [pwMsg, setPwMsg]             = useState('')

  const load = async () => {
    setLoading(true)
    try { const { data } = await clientsApi.list(); setClients(data) }
    catch { setError('Failed to load clients') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name || !form.email || form.password.length < 8) {
      setError('Name, email, and password (min 8 chars) are required'); return
    }
    setCreating(true); setError('')
    try {
      await clientsApi.create({ ...form, worker_ids: form.worker_ids })
      setForm({ name: '', email: '', password: '', worker_ids: [] })
      setShowCreate(false)
      await load()
    } catch (e) { setError(e.response?.data?.detail || 'Failed to create client') }
    finally { setCreating(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this client account?')) return
    try { await clientsApi.delete(id); await load() }
    catch { setError('Failed to delete') }
  }

  const openAssign = (client) => {
    const current = client.assigned_worker_ids || []
    setAssigning(client.id)
    setAssignIds(current)
  }

  const saveAssign = async () => {
    try { await clientsApi.assignWorkers(assigning, assignIds); setAssigning(null); await load() }
    catch { setError('Failed to update worker assignments') }
  }

  const saveResetPw = async () => {
    if (newPw.length < 8) { setPwMsg('Password must be at least 8 characters'); return }
    try {
      await clientsApi.resetPassword(resettingPw, newPw)
      setPwMsg('Password updated.')
      setTimeout(() => { setResettingPw(null); setNewPw(''); setPwMsg('') }, 1500)
    } catch (e) { setPwMsg(e.response?.data?.detail || 'Failed to reset password') }
  }

  const toggleWorker = (id) =>
    setAssignIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'var(--font-sans)' }

  return (
    <div className="page-pad" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 4 }}>Clients</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Create client accounts and assign which workers they can see.</div>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(s => !s)}>
          {showCreate ? 'Cancel' : '+ New Client'}
        </Button>
      </div>

      {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      {showCreate && (
        <Card style={{ marginBottom: 24, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>New Client Account</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 5 }}>Full Name</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Client name" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 5 }}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="client@company.com" />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 5 }}>Password</label>
            <input style={inputStyle} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>Assign Workers (optional)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {workers.filter(w => w.is_active).map(w => {
                const sel = form.worker_ids.includes(w.id)
                return (
                  <button key={w.id} onClick={() => setForm(f => ({
                    ...f, worker_ids: sel ? f.worker_ids.filter(x => x !== w.id) : [...f.worker_ids, w.id]
                  }))} style={{
                    padding: '5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    border: sel ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                    background: sel ? 'var(--primary-s)' : 'transparent',
                    color: sel ? 'var(--primary)' : 'var(--text3)',
                    fontFamily: 'var(--font-sans)',
                  }}>{w.name}</button>
                )
              })}
              {workers.filter(w => w.is_active).length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>No active workers yet.</div>
              )}
            </div>
          </div>
          <Button variant="primary" onClick={handleCreate} disabled={creating}>
            {creating ? <><Spinner size={12} color="#fff" /> Creating…</> : 'Create Client'}
          </Button>
        </Card>
      )}

      {loading ? <Spinner /> : clients.length === 0 ? (
        <EmptyState icon="💼" title="No clients yet" sub="Create a client account above and assign which workers they can monitor." />
      ) : (
        clients.map(client => (
          <Card key={client.id} style={{ marginBottom: 12, padding: '18px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar name={client.name} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{client.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>{client.email}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {client.assigned_worker_ids?.length || 0} worker{(client.assigned_worker_ids?.length || 0) !== 1 ? 's' : ''} assigned
                </div>
                {client.admin_name && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Managed by <strong style={{ color: 'var(--text2)', fontWeight: 600 }}>{client.admin_name}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Button variant="secondary" size="sm" onClick={() => openAssign(client)}>Edit Workers</Button>
                <Button variant="secondary" size="sm" onClick={() => { setResettingPw(client.id); setNewPw(''); setPwMsg('') }}>Reset Password</Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(client.id)}>Delete</Button>
              </div>
            </div>

            {assigning === client.id && (
              <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Select workers this client can see:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {workers.filter(w => w.is_active).map(w => {
                    const sel = assignIds.includes(w.id)
                    return (
                      <button key={w.id} onClick={() => toggleWorker(w.id)} style={{
                        padding: '5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        border: sel ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                        background: sel ? 'var(--primary-s)' : 'transparent',
                        color: sel ? 'var(--primary)' : 'var(--text3)',
                        fontFamily: 'var(--font-sans)',
                      }}>{w.name}</button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" size="sm" onClick={saveAssign}>Save</Button>
                  <Button variant="secondary" size="sm" onClick={() => setAssigning(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </Card>
        ))
      )}

      {/* Assign-workers modal */}
    </div>
  )
}

// ── Invite Panel ──────────────────────────────────────────────────────────────
function InvitePanel() {
  const [invites, setInvites]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [emailHint, setEmailHint] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId]   = useState(null)
  const [error, setError]         = useState('')

  const BASE_URL = window.location.origin

  const load = async () => {
    setLoading(true)
    try { const { data } = await invitesApi.list(); setInvites(data) }
    catch { setError('Failed to load invites') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const generate = async () => {
    setGenerating(true); setError('')
    try {
      await invitesApi.create(emailHint.trim() || null)
      setEmailHint('')
      await load()
    } catch (e) { setError(e.response?.data?.detail || 'Failed to generate invite') }
    finally { setGenerating(false) }
  }

  const revoke = async (id) => {
    try { await invitesApi.revoke(id); await load() }
    catch (e) { setError(e.response?.data?.detail || 'Failed to revoke') }
  }

  const copyLink = (token, id) => {
    const url = `${BASE_URL}/register?token=${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const isExpired = (invite) => new Date(invite.expires_at) < new Date()

  const active   = invites.filter(i => !i.used && !isExpired(i))
  const inactive = invites.filter(i => i.used || isExpired(i))

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'var(--font-sans)', outline: 'none' }

  return (
    <div className="page-pad" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 4 }}>Invite Admins</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>
        Generate a one-time invite link to onboard another administrator. Each link expires after 72 hours and can only be used once.
      </div>

      {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}

      {/* Generate form */}
      <Card style={{ marginBottom: 28, padding: '20px 22px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Generate Invite Link</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: 0.4 }}>
              EMAIL HINT (optional — pre-fills recipient's email)
            </label>
            <input
              style={inputStyle}
              type="email"
              value={emailHint}
              onChange={e => setEmailHint(e.target.value)}
              placeholder="newadmin@company.com"
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <Button variant="primary" onClick={generate} disabled={generating}>
            {generating ? <><Spinner size={12} color="#fff" /> Generating…</> : 'Generate Link'}
          </Button>
        </div>
      </Card>

      {/* Active invites */}
      {loading ? <Spinner /> : (
        <>
          {active.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--emerald)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                Active · {active.length}
              </div>
              {active.map(inv => {
                const link = `${BASE_URL}/register?token=${inv.token}`
                const expiresIn = Math.ceil((new Date(inv.expires_at) - new Date()) / 3600000)
                return (
                  <Card key={inv.id} style={{ marginBottom: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {inv.email_hint && (
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{inv.email_hint}</div>
                        )}
                        <div style={{
                          fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{link}</div>
                        <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4, fontWeight: 500 }}>
                          Expires in {expiresIn}h
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <Button variant="secondary" size="sm" onClick={() => copyLink(inv.token, inv.id)}>
                          {copiedId === inv.id ? 'Copied' : 'Copy Link'}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => revoke(inv.id)}>Revoke</Button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </>
          )}

          {active.length === 0 && inactive.length === 0 && (
            <EmptyState icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            } title="No invites yet" sub="Generate a link above to invite another admin." />
          )}

          {inactive.length > 0 && (
            <div style={{ marginTop: active.length ? 24 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                Used / Expired · {inactive.length}
              </div>
              {inactive.map(inv => (
                <Card key={inv.id} style={{ marginBottom: 8, padding: '13px 18px', opacity: 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {inv.email_hint && <div style={{ fontSize: 13, fontWeight: 500 }}>{inv.email_hint}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge status={inv.used ? 'active' : 'suspended'}>
                      {inv.used ? 'Used' : 'Expired'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel() {
  const [schedule, setSchedule] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ clock_in_deadline_hour: 9, clock_in_deadline_minute: 0, checkin_interval_minutes: 120, grace_period_minutes: 15, currency: 'USD' })

  // Services config
  const [myServices, setMyServices] = useState([])
  const [savingServices, setSavingServices] = useState(false)
  const [savedServices, setSavedServices] = useState(false)

  const ALL_SERVICES = [
    { key: 'account_recovery', label: 'Account Recovery', emoji: '🔓', desc: 'Recovering suspended/banned Aether accounts' },
    { key: 'assessment',       label: 'Assessment',       emoji: '📝', desc: 'Conducting quality assessments on Aether' },
    { key: 'tasker',           label: 'Tasker',           emoji: '✅', desc: 'AI task completion on Outlier' },
    { key: 'onboarding',       label: 'Onboarding',       emoji: '🚀', desc: 'New contractor onboarding on Aether' },
  ]

  useEffect(() => {
    api.get('/shifts/schedule').then(r => { setSchedule(r.data); setForm(r.data) })
    applicationsApi.getMyServices().then(r => setMyServices(r.data.services || [])).catch(() => {})
  }, [])

  const toggleService = (key) => {
    setMyServices(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  const saveServices = async () => {
    setSavingServices(true)
    try {
      await applicationsApi.updateMyServices(myServices)
      setSavedServices(true)
      setTimeout(() => setSavedServices(false), 2000)
    } finally { setSavingServices(false) }
  }

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
    <div className="page-pad" style={{ maxWidth: 520 }}>
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

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚡ Grace Period</div>
        <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>MINUTES AFTER DEADLINE BEFORE BLOCKING</label>
        <input type="number" min={0} max={60} value={form.grace_period_minutes}
          onChange={e => setForm(f => ({ ...f, grace_period_minutes: parseInt(e.target.value) }))}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-mono)' }} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          Workers who clock in within <strong>{form.grace_period_minutes} minutes</strong> after the deadline are flagged late but not blocked.
        </div>
      </Card>

      <Card style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>💱 Pay Currency</div>
        <label style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>CURRENCY USED FOR ALL PAYROLL</label>
        <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14 }}>
          {['USD','EUR','GBP','NGN','GHS','KES','ZAR','CAD','AUD'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          One currency for the whole team — applies to every department rate and every worker's pay summary. Changing this updates how existing rates are displayed; rate amounts themselves don't convert.
        </div>
      </Card>

      <Button variant="primary" onClick={save} disabled={saving} style={{ minWidth: 140 }}>
        {saving ? <><Spinner size={13} color="#fff" /> Saving…</> : saved ? '✓ Saved' : 'Save Settings'}
      </Button>

      {/* ── Team Services ── */}
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 40, marginBottom: 4 }}>Team Services</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18 }}>
        Select the services your team offers. These are displayed publicly on the job application page so applicants know what they're applying for.
      </div>
      <Card style={{ marginBottom: 16 }}>
        {ALL_SERVICES.map((svc, i) => (
          <div key={svc.key} onClick={() => toggleService(svc.key)} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', cursor: 'pointer',
            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 }}>{svc.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{svc.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{svc.desc}</div>
            </div>
            <div style={{
              width: 20, height: 20, borderRadius: 6, border: `2px solid ${myServices.includes(svc.key) ? 'var(--primary)' : 'var(--border)'}`,
              background: myServices.includes(svc.key) ? 'var(--primary)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s',
            }}>
              {myServices.includes(svc.key) && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          </div>
        ))}
      </Card>
      <Button variant="primary" onClick={saveServices} disabled={savingServices} style={{ minWidth: 160 }}>
        {savingServices ? <><Spinner size={13} color="#fff" /> Saving…</> : savedServices ? '✓ Saved' : 'Save Services'}
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
    <div className="page-pad">
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
          <div onClick={() => setUnblockModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(400px,90vw)', background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)', zIndex: 110, padding: 24 }}>
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
                  {s.client_name && <div style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>Client: {s.client_name}</div>}
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

            {s.worker_note && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text2)', borderLeft: '3px solid var(--violet)' }}>
                <span style={{ fontWeight: 600, color: 'var(--violet)' }}>Worker's note: </span>{s.worker_note}
              </div>
            )}

            {/* Final shift screenshot — always visible when present, independent of check-ins */}
            {s.screenshot_url && (
              <div style={{ marginTop: 10, background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--violet-b)', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--violet)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>📸 Final Screenshot</div>
                <img
                  src={s.screenshot_url} alt="Final screenshot"
                  onClick={() => setLightboxUrl(s.screenshot_url)}
                  style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--violet-b)', cursor: 'zoom-in' }}
                />
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Click to view full size</div>
              </div>
            )}

            {/* Check-in screenshots viewer */}
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

// ── System Admin: Admin Detail Drilldown ───────────────────────────────────────
function AdminDrilldown({ admin, onBack, onSuspend, onDelete, toast }) {
  const [activeTab, setActiveTab] = useState('workers')
  const [workers,    setWorkers]    = useState([])
  const [clients,    setClients]    = useState([])
  const [shifts,     setShifts]     = useState([])
  const [activities, setActivities] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      sysApi.getWorkers(admin.id),
      sysApi.getClients(admin.id),
      sysApi.getShifts(admin.id),
      sysApi.getActivities(admin.id),
    ]).then(([w, c, s, a]) => {
      setWorkers(w.data)
      setClients(c.data)
      setShifts(s.data)
      setActivities(a.data)
    }).catch(() => toast('Failed to load team data', 'error'))
      .finally(() => setLoading(false))
  }, [admin.id])

  const tabs = [
    { id: 'workers',    label: `Workers (${workers.length})` },
    { id: 'clients',    label: `Clients (${clients.length})` },
    { id: 'shifts',     label: `Shifts` },
    { id: 'activities', label: `Activities` },
  ]

  const handleSuspend = async () => {
    try {
      await sysApi.updateAdmin(admin.id, { is_active: !admin.is_active })
      toast(`Admin ${admin.is_active ? 'suspended' : 'reactivated'}`, 'success')
      onSuspend()
    } catch { toast('Action failed', 'error') }
  }

  const handleDelete = async () => {
    try {
      await sysApi.deleteAdmin(admin.id)
      toast('Admin removed', 'success')
      onDelete()
    } catch { toast('Delete failed', 'error') }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 13, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          ← All Admins
        </button>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={handleSuspend}>
          {admin.is_active ? '⏸ Suspend' : '▶ Reactivate'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} style={{ color: 'var(--rose)' }}>
          🗑 Remove Admin
        </Button>
      </div>

      {/* Admin identity card */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Avatar name={admin.name} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{admin.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>{admin.email}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Joined {new Date(admin.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-sm)',
            background: admin.is_active ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
            color: admin.is_active ? 'var(--emerald)' : 'var(--rose)',
          }}>{admin.is_active ? 'Active' : 'Suspended'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
          {[
            { label: 'Workers',        value: admin.worker_count,       color: 'var(--primary)' },
            { label: 'Clients',        value: admin.client_count,       color: 'var(--violet)'  },
            { label: 'Online Now',     value: admin.active_today,       color: 'var(--emerald)' },
            { label: 'Pending Review', value: admin.pending_activities, color: 'var(--amber)'   },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center', padding: '10px 0', borderRadius: 'var(--r-md)', background: 'var(--bg)' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)', borderRadius: 'var(--r-md)', padding: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, padding: '6px 8px', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all .15s',
            background: activeTab === t.id ? 'var(--bg)' : 'transparent',
            color: activeTab === t.id ? 'var(--text)' : 'var(--text3)',
            boxShadow: activeTab === t.id ? 'var(--shadow-sm)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height={52} />)}
        </div>
      ) : (
        <>
          {/* Workers tab */}
          {activeTab === 'workers' && (
            workers.length === 0
              ? <EmptyState icon="👷" title="No workers" sub="This admin has no workers yet." />
              : <Card>
                {workers.map((w, i) => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <Avatar name={w.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{w.email}{w.department ? ` · ${w.department}` : ''}</div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-sm)',
                      background: w.is_active ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
                      color: w.is_active ? 'var(--emerald)' : 'var(--rose)',
                    }}>{w.is_active ? 'Active' : 'Inactive'}</div>
                  </div>
                ))}
              </Card>
          )}

          {/* Clients tab */}
          {activeTab === 'clients' && (
            clients.length === 0
              ? <EmptyState icon="🏢" title="No clients" sub="This admin has no clients yet." />
              : <Card>
                {clients.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <Avatar name={c.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.email}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.assigned_worker_ids.length} workers</div>
                    <div style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-sm)',
                      background: c.is_active ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
                      color: c.is_active ? 'var(--emerald)' : 'var(--rose)',
                    }}>{c.is_active ? 'Active' : 'Inactive'}</div>
                  </div>
                ))}
              </Card>
          )}

          {/* Shifts tab */}
          {activeTab === 'shifts' && (
            shifts.length === 0
              ? <EmptyState icon="🕐" title="No shifts" sub="No shift data for this admin's team." />
              : <Card>
                {shifts.map((s, i) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ minWidth: 64, fontSize: 12, color: 'var(--text3)' }}>{fmtDate(s.date)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.worker?.name ?? `Worker #${s.worker_id}`}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {s.clock_in ? fmtTime(s.clock_in) : '—'} → {s.clock_out ? fmtTime(s.clock_out) : 'ongoing'}
                        {s.total_minutes ? ` · ${fmtMinutes(s.total_minutes)}` : ''}
                      </div>
                    </div>
                    {s.is_blocked && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--rose)' }}>BLOCKED</span>}
                    {s.is_late && !s.is_blocked && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)' }}>LATE</span>}
                  </div>
                ))}
              </Card>
          )}

          {/* Activities tab */}
          {activeTab === 'activities' && (
            activities.length === 0
              ? <EmptyState icon="📋" title="No activities" sub="No activity submissions from this team." />
              : <Card>
                {activities.map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ minWidth: 64, fontSize: 12, color: 'var(--text3)' }}>{fmtDate(a.date)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.task_title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.worker?.name ?? `Worker #${a.worker_id}`}</div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-sm)',
                      background: a.verification_status === 'approved' ? 'rgba(16,185,129,.12)'
                        : a.verification_status === 'rejected' ? 'rgba(239,68,68,.12)'
                        : 'rgba(245,158,11,.12)',
                      color: a.verification_status === 'approved' ? 'var(--emerald)'
                        : a.verification_status === 'rejected' ? 'var(--rose)'
                        : 'var(--amber)',
                    }}>{a.verification_status}</div>
                  </div>
                ))}
              </Card>
          )}
        </>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div onClick={() => setConfirmDelete(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(380px,90vw)', background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Remove Admin?</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
              <strong>{admin.name}</strong> will be permanently removed. Their {admin.worker_count} worker(s) and {admin.client_count} client(s) will become unassigned — no data will be deleted.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} style={{ flex: 1 }}>Cancel</Button>
              <Button size="sm" onClick={handleDelete} style={{ flex: 1, background: 'var(--rose)', color: '#fff' }}>Remove</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── System Admin Overview ──────────────────────────────────────────────────────
function SystemAdminOverview({ toast }) {
  const [admins,     setAdmins]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [drilldown,  setDrilldown]  = useState(null)  // admin object being viewed
  const [search,     setSearch]     = useState('')

  const load = () => {
    setLoading(true)
    sysApi.listAdmins()
      .then(r => setAdmins(r.data))
      .catch(() => toast('Failed to load admins', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (drilldown) {
    return (
      <AdminDrilldown
        admin={drilldown}
        toast={toast}
        onBack={() => { setDrilldown(null); load() }}
        onSuspend={() => { load(); setDrilldown(prev => ({ ...prev, is_active: !prev.is_active })) }}
        onDelete={() => { setDrilldown(null); load() }}
      />
    )
  }

  const filtered = admins.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  )

  const totalWorkers    = admins.reduce((s, a) => s + a.worker_count,       0)
  const totalClients    = admins.reduce((s, a) => s + a.client_count,       0)
  const totalOnline     = admins.reduce((s, a) => s + a.active_today,       0)
  const totalPending    = admins.reduce((s, a) => s + a.pending_activities, 0)

  return (
    <div>
      {/* Headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label="Total Admins"      value={loading ? '—' : admins.length}  sub="registered teams"     color="var(--primary)"  loading={loading} delay={0}   />
        <StatCard label="Total Workers"     value={loading ? '—' : totalWorkers}   sub="across all teams"     color="var(--emerald)"  loading={loading} delay={60}  />
        <StatCard label="Total Clients"     value={loading ? '—' : totalClients}   sub="across all teams"     color="var(--violet)"   loading={loading} delay={120} />
        <StatCard label="Online Now"        value={loading ? '—' : totalOnline}    sub="clocked in today"     color="var(--amber)"    loading={loading} delay={180} />
        <StatCard label="Pending Review"    value={loading ? '—' : totalPending}   sub="activity submissions"  color="var(--rose)"     loading={loading} delay={240} />
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <Input
          placeholder="Search admins…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      {/* Admin list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => <Skeleton key={i} height={72} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👤" title="No admins yet" sub="Use the Invites tab to invite your first admin." />
      ) : (
        <Card>
          {filtered.map((a, i) => (
            <div
              key={a.id}
              onClick={() => setDrilldown(a)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 0', cursor: 'pointer',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                transition: 'opacity .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '.75'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <Avatar name={a.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email}</div>
              </div>

              {/* Mini stat pills */}
              <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
                {[
                  { val: a.worker_count,       label: 'workers',  color: 'var(--primary)' },
                  { val: a.client_count,        label: 'clients',  color: 'var(--violet)'  },
                  { val: a.active_today,        label: 'online',   color: 'var(--emerald)' },
                  { val: a.pending_activities,  label: 'pending',  color: a.pending_activities > 0 ? 'var(--amber)' : 'var(--text3)' },
                ].map(({ val, label, color }) => (
                  <div key={label} style={{ textAlign: 'center', minWidth: 36 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-sm)', flexShrink: 0,
                background: a.is_active ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
                color: a.is_active ? 'var(--emerald)' : 'var(--rose)',
              }}>{a.is_active ? 'Active' : 'Suspended'}</div>

              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const { dark, toggle: toggleTheme } = useThemeStore()
  const isSystemAdmin = user?.is_system_admin === true

  // System admin only sees Overview (Admins view) + Invites
  // Regular admins see everything except Invites
  const visibleNav = NAV.filter(item => {
    if (isSystemAdmin) return item.id === 'overview' || item.id === 'invites'
    return item.id !== 'invites'
  }).map(item => isSystemAdmin && item.id === 'overview'
    ? { ...item, label: 'Admins' }
    : item
  )

  const handleLogout = async () => {
    await Promise.race([unsubscribeAll(), new Promise(r => setTimeout(r, 3000))])
    logout()
    navigate('/login', { replace: true })
  }

  const [tab, setTab] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [drawer, setDrawer] = useState(null)

  // Track mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e) => {
      setIsMobile(e.matches)
      if (e.matches) setSidebarOpen(false)
      else setSidebarOpen(true)
    }
    setIsMobile(mq.matches)
    if (mq.matches) setSidebarOpen(false)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const { activities, loading: actLoading, verify } = useActivities(isSystemAdmin ? null : { limit: 200 })
  const { workers, loading: workerLoading, create, toggleActive, remove } = useWorkers(isSystemAdmin)
  const { stats, weekly, loading: statsLoading } = useDashboardStats(isSystemAdmin)
  const { toasts, toast, removeToast } = useToast()
  const { count: pendingApps, refetch: refetchPendingApps } = usePendingApplicationsCount()

  // ── Push notifications (new application alerts) ──────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    registerSW()
    isPushSubscribed().then(setPushEnabled)
  }, [])

  const handleTogglePush = async () => {
    setPushLoading(true)
    try {
      if (pushEnabled) {
        await unsubscribeAll()
        setPushEnabled(false)
        toast('Notifications disabled')
      } else {
        const ok = await requestAndSubscribe()
        setPushEnabled(ok)
        toast(ok ? 'Notifications enabled — you\'ll be alerted on new applications' : 'Could not enable notifications. Check your browser settings.', ok ? 'success' : 'error')
      }
    } finally {
      setPushLoading(false)
    }
  }

  const pending = activities.filter(a => a.verification_status === 'pending').length

  const handleVerify = async (id, payload) => {
    try { await verify(id, payload); toast(`Activity ${payload.verification_status}`) }
    catch (err) { toast(getErrorMessage(err), 'error') }
  }

  const handleCreateWorker = async (data) => {
    await create(data)
    toast('Worker account created')
  }

  const handleToggleWorker = async (id, isActive, reason) => {
    await toggleActive(id, isActive, reason)
    toast(isActive ? 'Account suspended' : 'Account activated')
  }

  const handleDeleteWorker = async (id) => {
    await remove(id)
    toast('Worker removed')
  }

  const sidebarWidth = isMobile ? 0 : (sidebarOpen ? 220 : 64)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 30, animation: 'fadeIn 0.2s ease' }}
        />
      )}

      {/* Sidebar */}
      <aside className="sidebar-texture" style={{
        background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface2) 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 220, zIndex: 35,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        } : {
          width: sidebarOpen ? 220 : 64, flexShrink: 0,
          transition: 'width 0.25s ease',
        }),
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
          {visibleNav.map(item => {
            const active = tab === item.id
            return (
              <button key={item.id} onClick={() => { setTab(item.id); if (isMobile) setSidebarOpen(false) }} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: sidebarOpen ? '9px 12px 9px 14px' : '9px', borderRadius: 'var(--r)',
                border: 'none', cursor: 'pointer', marginBottom: 2,
                background: active ? 'var(--primary-s)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text3)',
                fontFamily: 'var(--font-sans)', fontWeight: active ? 600 : 500, fontSize: 13,
                transition: 'all 0.15s', justifyContent: sidebarOpen ? 'space-between' : 'center',
                position: 'relative',
                boxShadow: active ? 'inset 3px 0 0 var(--primary)' : 'none',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={active ? 2.25 : 1.75}
                    style={{ flexShrink: 0, transform: active ? 'translateX(1px)' : 'translateX(0)', transition: 'transform 0.2s, stroke-width 0.15s' }}>
                    <path d={item.icon} />
                  </svg>
                  {sidebarOpen && item.label}
                </span>
                {sidebarOpen && item.id === 'feed' && pending > 0 && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: 'var(--amber)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pending}</span>
                )}
                {sidebarOpen && item.id === 'applications' && pendingApps > 0 && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: 'var(--rose)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pendingApps}</span>
                )}
              </button>
            )
          })}
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
              <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div className="topbar-pad" style={{ height: 54, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', flexShrink: 0, position: 'relative', zIndex: 20 }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4, borderRadius: 'var(--r-sm)', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{NAV.find(n => n.id === tab)?.label}</div>
          {pending > 0 && (
            <div title={`${pending} pending`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 'var(--r-full)', background: 'var(--amber-s)', border: '1px solid var(--amber-b)', color: 'var(--amber)', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span className="topbar-label">{pending} pending</span>
            </div>
          )}
          <button onClick={handleTogglePush} disabled={pushLoading} title={pushEnabled ? 'Disable new-application notifications' : 'Enable new-application notifications'} style={{ background: 'none', border: 'none', cursor: pushLoading ? 'wait' : 'pointer', color: pushEnabled ? 'var(--primary)' : 'var(--text3)', padding: 6, display: 'flex', borderRadius: 'var(--r-sm)', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={pushEnabled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, display: 'flex', borderRadius: 'var(--r-sm)', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {dark ? <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="content-pad" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

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

              {isSystemAdmin ? <SystemAdminOverview toast={toast} /> : (<>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
                <Card className="anim-fade-up" style={{ animationDelay: '300ms' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Hours Logged — Last 7 Days</div>
                  <div style={{ overflowX: 'auto' }}><ResponsiveContainer width="100%" height={180} minWidth={280}>
                    <AreaChart data={weekly}>
                      <defs>
                        <linearGradient id="aHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="day" interval={0} minTickGap={0} tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 12, boxShadow: 'var(--shadow)' }} cursor={{ stroke: 'var(--primary)', strokeOpacity: 0.2, strokeWidth: 1 }}/>
                      <Area type="monotone" dataKey="hours" stroke="var(--primary)" strokeWidth={2.5} fill="url(#aHours)" dot={false} activeDot={{ r: 5, fill: "var(--primary)", strokeWidth: 2, stroke: "var(--surface)" }}/>
                    </AreaChart>
                  </ResponsiveContainer></div>
                </Card>

                <Card className="anim-fade-up" style={{ animationDelay: '380ms' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Tasks Submitted — Last 7 Days</div>
                  <div style={{ overflowX: 'auto' }}><ResponsiveContainer width="100%" height={180} minWidth={280}>
                    <BarChart data={weekly} barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="day" interval={0} minTickGap={0} tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12 }} cursor={{ fill: 'var(--surface2)' }}/>
                      <Bar dataKey="tasks" fill="var(--emerald)" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer></div>
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
              </>)}
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
      {(tab === 'settings' || tab === 'attendance' || tab === 'payroll' || tab === 'applications' || tab === 'clients' || tab === 'invites' || tab === 'reviews') && (
        <div style={{ position: 'fixed', top: 54, right: 0, bottom: 0, left: sidebarWidth, background: 'var(--bg)', zIndex: 10, overflowY: 'auto' }}>
          {tab === 'settings'      && <SettingsPanel />}
          {tab === 'attendance'    && <AttendancePanel workers={workers} />}
          {tab === 'payroll'       && <PayrollPanel workers={workers} />}
          {tab === 'applications'  && <ApplicationsPanel onActioned={refetchPendingApps} />}
          {tab === 'reviews'       && <ReviewsPanel />}
          {tab === 'clients'       && <ClientsPanel workers={workers} />}
          {tab === 'invites'       && <InvitePanel />}
        </div>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
