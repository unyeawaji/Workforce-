import { useNavigate, Link } from 'react-router-dom'
import { useThemeStore } from '../../store/themeStore'
import { PublicNav } from './PublicNav'

const FEATURES = [
  { num: '01', title: 'Real-time Tracking',  desc: 'Clock in, submit periodic check-ins with screenshots, and clock out — from any device, anywhere.' },
  { num: '02', title: 'Activity Logging',    desc: 'Workers log tasks with verified proof. Admins approve, reject, and export full records on demand.' },
  { num: '03', title: 'Client Visibility',   desc: 'Clients access a read-only live feed of their assigned workers and tasks completed today.' },
  { num: '04', title: 'Payroll Reports',     desc: 'Hourly rates per department auto-calculate gross pay. Export to CSV or Excel in one click.' },
]

const STATS = [
  { value: '99.9%',  label: 'Uptime SLA' },
  { value: '<500ms', label: 'Check-in response' },
  { value: '100%',   label: 'Audit coverage' },
  { value: '0',      label: 'Data shared across teams' },
]

export default function HomePage() {
  const nav = useNavigate()
  const dark = useThemeStore(s => s.dark)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <PublicNav dark={dark} />

      {/* ── Hero ── */}
      <section style={{ maxWidth: 920, margin: '0 auto', padding: '96px 32px 80px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'var(--primary-s)', color: 'var(--primary)',
          border: '1px solid var(--primary-b)',
          borderRadius: 'var(--r-full)', padding: '5px 16px',
          fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
          textTransform: 'uppercase', marginBottom: 32,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} />
          Remote Workforce Platform
        </div>

        <h1 style={{
          fontSize: 'clamp(38px, 6vw, 64px)', fontWeight: 800,
          letterSpacing: -2.5, lineHeight: 1.06, marginBottom: 22,
          color: 'var(--text)',
        }}>
          Workforce management<br />
          <span style={{ color: 'var(--primary)' }}>built for remote teams.</span>
        </h1>

        <p style={{
          fontSize: 17, color: 'var(--text3)', lineHeight: 1.8,
          maxWidth: 520, margin: '0 auto 44px', fontWeight: 400,
        }}>
          Clock in, track work, submit check-ins with proof — and let admins verify everything in real time. Transparent for clients, powerful for managers.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => nav('/apply')} style={{
            background: 'var(--primary)', border: 'none', color: '#fff',
            padding: '14px 36px', borderRadius: 'var(--r-lg)',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-sans)',
            boxShadow: '0 4px 20px rgba(29,78,216,0.32)',
            transition: 'background 0.15s, transform 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-h)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.transform = '' }}
          >Apply for a position</button>
          <button onClick={() => nav('/login')} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text2)', padding: '14px 36px', borderRadius: 'var(--r-lg)',
            cursor: 'pointer', fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-sans)',
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >Sign in to dashboard</button>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '36px 32px' }}>
        <div className="stat-row-4 stat-row-dividers" style={{ maxWidth: 840, margin: '0 auto' }}>
          {STATS.map((s) => (
            <div key={s.label} className="stat-row-divider-cell" style={{ textAlign: 'center', padding: '0 24px' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--primary)', letterSpacing: -1, lineHeight: 1, marginBottom: 6 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '80px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Everything you need
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.2, color: 'var(--text)' }}>
            One platform, full visibility
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', padding: '28px 26px',
              transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.borderColor = 'var(--primary-b)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{
                fontSize: 11, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)',
                letterSpacing: 1, marginBottom: 18, opacity: 0.7,
              }}>{f.num}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.75 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: 'var(--primary)', padding: '72px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle at 20% 50%, #fff 0%, transparent 55%), radial-gradient(circle at 80% 50%, #fff 0%, transparent 55%)' }} />
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: -1, marginBottom: 14 }}>Ready to join the team?</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginBottom: 36 }}>
            Fill out a quick application and get started as soon as your manager approves you.
          </p>
          <button onClick={() => nav('/apply')} style={{
            background: '#fff', border: 'none', color: 'var(--primary)',
            padding: '14px 40px', borderRadius: 'var(--r-lg)',
            cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-sans)',
            transition: 'transform 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}
          >Apply Now</button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: '28px 40px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)' }}>AI Induction</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[['/', 'Home'], ['/about', 'About'], ['/apply', 'Apply'], ['/login', 'Sign In']].map(([to, label]) => (
            <Link key={to} to={to} style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>© {new Date().getFullYear()} AI Induction. All rights reserved.</div>
      </footer>
    </div>
  )
}
