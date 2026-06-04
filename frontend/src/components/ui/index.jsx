import { useState, useEffect } from 'react'

// ── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 32 }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'
  const colors = ['#1d4ed8', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2']
  const color = colors[initials.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${color}18`, border: `1.5px solid ${color}35`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 600, color,
      fontFamily: 'var(--font-mono)', letterSpacing: 0.5,
    }}>{initials}</div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_MAP = {
  pending:   { bg: 'var(--amber-s)',   border: 'var(--amber-b)',   color: 'var(--amber)',   label: 'Pending'   },
  approved:  { bg: 'var(--emerald-s)', border: 'var(--emerald-b)', color: 'var(--emerald)', label: 'Approved'  },
  rejected:  { bg: 'var(--rose-s)',    border: 'var(--rose-b)',    color: 'var(--rose)',    label: 'Rejected'  },
  completed: { bg: 'var(--primary-s)', border: 'var(--primary-b)', color: 'var(--primary)', label: 'Completed' },
  blocked:   { bg: 'var(--rose-s)',    border: 'var(--rose-b)',    color: 'var(--rose)',    label: 'Blocked'   },
  active:    { bg: 'var(--emerald-s)', border: 'var(--emerald-b)', color: 'var(--emerald)', label: 'Active'    },
  suspended: { bg: 'var(--rose-s)',    border: 'var(--rose-b)',    color: 'var(--rose)',    label: 'Suspended' },
  admin:     { bg: 'var(--violet-s)',  border: 'var(--violet-b)',  color: 'var(--violet)',  label: 'Admin'     },
  worker:    { bg: 'var(--surface2)',  border: 'var(--border)',    color: 'var(--text3)',   label: 'Worker'    },
}

export function Badge({ status, label }) {
  const s = BADGE_MAP[status] || BADGE_MAP.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
      borderRadius: 'var(--r-full)', fontSize: 11, fontWeight: 600,
      fontFamily: 'var(--font-mono)', letterSpacing: 0.4, textTransform: 'uppercase',
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      whiteSpace: 'nowrap',
    }}>{label || s.label}</span>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────
const BTN_VARIANTS = {
  primary:   { bg: 'var(--primary)',   color: '#fff',           border: 'transparent',    hov: 'var(--primary-h)' },
  secondary: { bg: 'var(--surface2)', color: 'var(--text)',    border: 'var(--border)',   hov: 'var(--surface3)'  },
  ghost:     { bg: 'transparent',     color: 'var(--text2)',   border: 'transparent',    hov: 'var(--surface2)'  },
  danger:    { bg: 'var(--rose-s)',   color: 'var(--rose)',    border: 'var(--rose-b)',   hov: 'var(--rose-s)'    },
  success:   { bg: 'var(--emerald-s)',color: 'var(--emerald)', border: 'var(--emerald-b)',hov: 'var(--emerald-s)' },
}
const BTN_SIZES = {
  sm: { padding: '5px 10px', fontSize: 12, height: 30, gap: 5 },
  md: { padding: '8px 14px', fontSize: 13, height: 36, gap: 6 },
  lg: { padding: '11px 20px', fontSize: 14, height: 44, gap: 8 },
}

export function Button({ children, variant = 'primary', size = 'md', onClick, disabled, style = {}, fullWidth, icon: Icon }) {
  const [hov, setHov] = useState(false)
  const v = BTN_VARIANTS[variant]; const s = BTN_SIZES[size]
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: s.gap, height: s.height, padding: s.padding, fontSize: s.fontSize,
        fontFamily: 'var(--font-sans)', fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
        background: hov && !disabled ? v.hov : v.bg, color: v.color,
        border: `1px solid ${v.border}`, borderRadius: 'var(--r)', opacity: disabled ? 0.5 : 1,
        width: fullWidth ? '100%' : undefined,
        boxShadow: variant === 'primary' && !disabled ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s', ...style,
      }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, hover = false, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHov(true)}
      onMouseLeave={() => hover && setHov(false)}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 20,
        boxShadow: hov ? 'var(--shadow)' : 'var(--shadow-sm)',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'box-shadow 0.2s, transform 0.2s', ...style,
      }}
    >{children}</div>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
const inputBase = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  fontFamily: 'var(--font-sans)', color: 'var(--text)',
  background: 'var(--surface)', border: '1.5px solid var(--border)',
  borderRadius: 'var(--r)', outline: 'none',
}

export function Input({ label, required, error, hint, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
          {label}{required && <span style={{ color: 'var(--rose)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <input
        {...props}
        onFocus={e => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e => { setFocused(false); props.onBlur?.(e) }}
        style={{ ...inputBase, borderColor: error ? 'var(--rose)' : focused ? 'var(--primary)' : 'var(--border)', ...props.style }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--rose)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{hint}</span>}
    </div>
  )
}

export function Textarea({ label, required, error, rows = 4, value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
          {label}{required && <span style={{ color: 'var(--rose)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <textarea
        value={value} onChange={onChange} placeholder={placeholder} rows={rows}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ ...inputBase, resize: 'vertical', minHeight: rows * 24 + 20, lineHeight: 1.6, borderColor: error ? 'var(--rose)' : focused ? 'var(--primary)' : 'var(--border)' }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--rose)' }}>{error}</span>}
    </div>
  )
}

export function Select({ label, required, value, onChange, options, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
          {label}{required && <span style={{ color: 'var(--rose)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          ...inputBase, cursor: 'pointer', appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
          paddingRight: 32, borderColor: error ? 'var(--rose)' : 'var(--border)',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 18, color = 'var(--primary)' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: `2px solid ${color}25`, borderTopColor: color,
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style = {} }) {
  return <div className="skeleton" style={{ width, height, borderRadius, ...style }} />
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ style = {} }) {
  return <div style={{ height: 1, background: 'var(--border)', margin: '16px 0', ...style }} />
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, sub, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px', color: 'var(--text3)' }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: action ? 20 : 0 }}>{sub}</div>
      {action}
    </div>
  )
}

// ── Alert ─────────────────────────────────────────────────────────────────────
export function Alert({ message, type = 'error', onClose }) {
  if (!message) return null
  const colors = {
    error:   { bg: 'var(--rose-s)',    border: 'var(--rose-b)',    color: 'var(--rose)'    },
    success: { bg: 'var(--emerald-s)', border: 'var(--emerald-b)', color: 'var(--emerald)' },
    warning: { bg: 'var(--amber-s)',   border: 'var(--amber-b)',   color: 'var(--amber)'   },
  }
  const c = colors[type] || colors.error
  return (
    <div style={{
      padding: '11px 14px', borderRadius: 'var(--r)', fontSize: 13,
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    }}>
      <span>{message}</span>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color, fontSize: 16, lineHeight: 1 }}>×</button>}
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--emerald)' : 'var(--border2)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, maxWidth = 520 }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose?.()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 16, animation: 'fadeIn 0.2s ease',
      }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 'var(--r-xl)', padding: 28, width: '100%', maxWidth,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)',
        animation: 'fadeUp 0.25s ease',
      }}>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
            {onClose && (
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, lineHeight: 1 }}>×</button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── Toast container ───────────────────────────────────────────────────────────
export function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 999,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '12px 16px', borderRadius: 'var(--r)',
          background: t.type === 'error' ? 'var(--rose)' : 'var(--text)',
          color: '#fff', fontSize: 13, fontWeight: 500, maxWidth: 320,
          boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.3s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>{t.message}</span>
          <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      ))}
    </div>
  )
}
