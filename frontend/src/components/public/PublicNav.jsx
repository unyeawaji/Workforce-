import { Link, useNavigate, useLocation } from 'react-router-dom'

const LINKS = [
  { to: '/',      label: 'Home'  },
  { to: '/about', label: 'About' },
]

export function PublicNav({ dark }) {
  const nav = useNavigate()
  const loc = useLocation()

  return (
    <nav className="header-pad" style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: dark ? 'rgba(9,9,11,0.88)' : 'rgba(255,255,255,0.88)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border)',
      height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, overflow: 'hidden',
    }}>
      {/* Logo */}
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0, minWidth: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#fff',
        }}>A</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.4, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            AI Induction
          </span>
          <span className="hide-mobile" style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase', color: 'var(--primary)',
            fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
          }}>Powered by Neural</span>
        </div>
      </Link>

      {/* Centre links */}
      <div className="hide-mobile" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {LINKS.map(l => (
          <Link key={l.to} to={l.to} style={{
            padding: '6px 4px', marginInline: 10,
            fontSize: 14, fontWeight: 500,
            color: loc.pathname === l.to ? 'var(--text)' : 'var(--text3)',
            textDecoration: 'none', whiteSpace: 'nowrap',
            borderBottom: loc.pathname === l.to ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'color 0.15s, border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = loc.pathname === l.to ? 'var(--text)' : 'var(--text3)'}
          >{l.label}</Link>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <a href="/login" className="hide-mobile" style={{
          fontSize: 12, color: 'var(--text3)', textDecoration: 'none',
          fontWeight: 500, padding: '7px 0', whiteSpace: 'nowrap',
          borderBottom: '1px solid transparent',
          transition: 'color 0.15s, border-color 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text3)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'transparent' }}
        >Client Portal</a>
        <button onClick={() => nav('/login')} style={{
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--text2)', padding: '7px 18px', borderRadius: 'var(--r)',
          cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
          transition: 'border-color 0.15s, color 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
        >Sign In</button>
        <button onClick={() => nav('/apply')} style={{
          background: 'var(--primary)', border: 'none', color: '#fff',
          padding: '7px 18px', borderRadius: 'var(--r)',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
          transition: 'background 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-h)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
        >Apply Now</button>
      </div>
    </nav>
  )
}
