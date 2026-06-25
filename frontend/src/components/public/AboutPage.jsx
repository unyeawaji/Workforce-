import { useNavigate, Link } from 'react-router-dom'
import { useThemeStore } from '../../store/themeStore'
import { PublicNav } from './PublicNav'

const VALUES = [
  {
    title: 'Transparency',
    desc: 'Every check-in, task, and clock-out leaves a verifiable record. Managers see exactly what happened, when, and why — with no ambiguity.',
  },
  {
    title: 'Accountability',
    desc: 'Workers submit proof with every action. Admins verify. Clients observe. The system creates a shared standard of responsibility across the team.',
  },
  {
    title: 'Simplicity',
    desc: 'Workforce management tools are often bloated. We built only what remote teams actually need — and made it fast and reliable.',
  },
  {
    title: 'Trust',
    desc: 'Remote work only works when all parties trust the process. AI Induction gives every stakeholder — worker, admin, and client — a clear, honest view.',
  },
]

export default function AboutPage() {
  const nav = useNavigate()
  const dark = useThemeStore(s => s.dark)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <PublicNav dark={dark} />

      {/* ── Hero ── */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '88px 32px 72px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          background: 'var(--primary-s)', color: 'var(--primary)',
          border: '1px solid var(--primary-b)',
          borderRadius: 'var(--r-full)', padding: '5px 18px',
          fontSize: 11, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', marginBottom: 28,
        }}>About AI Induction</div>

        <h1 style={{
          fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 800,
          letterSpacing: -2, lineHeight: 1.08, marginBottom: 24,
          color: 'var(--text)',
        }}>
          Built for the way<br />remote teams actually work.
        </h1>

        <p style={{
          fontSize: 17, color: 'var(--text3)', lineHeight: 1.8,
          maxWidth: 580, margin: '0 auto',
        }}>
          AI Induction is a workforce management platform designed from the ground up for remote and distributed teams. We give workers, managers, and clients a single source of truth — without the overhead of complex enterprise tools.
        </p>
      </section>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── Mission ── */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '72px 32px' }}>
        <div className="grid-stack-mobile" style={{
          gridTemplateColumns: '1fr 1.4fr', gap: 64, alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: 1, color: 'var(--primary)', marginBottom: 16,
            }}>Our Mission</div>
            <h2 style={{
              fontSize: 34, fontWeight: 800, letterSpacing: -1.2,
              lineHeight: 1.15, color: 'var(--text)', marginBottom: 20,
            }}>
              Accountability without micromanagement.
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text3)', lineHeight: 1.8 }}>
              Most remote work tools either track too little — leaving managers in the dark — or too much, creating friction and distrust. AI Induction sits in the middle: structured check-ins with screenshots, activity verification, and client-facing reporting that respects workers while giving managers the visibility they need.
            </p>
          </div>

          {/* Stat block */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          }}>
            {[
              { value: '100%', label: 'Audit-trail coverage',     sub: 'Every action is logged and timestamped.' },
              { value: 'Live',  label: 'Client visibility',        sub: 'Real-time feed with no manual reporting.' },
              { value: 'Multi', label: 'Admin team support',       sub: 'Each admin manages their own siloed team.' },
              { value: 'Zero',  label: 'Data shared across teams', sub: 'Full isolation between organisations.' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)', padding: '22px 20px',
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', letterSpacing: -0.8, marginBottom: 6 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── Values ── */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '72px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: 1, color: 'var(--primary)', marginBottom: 14,
          }}>What we stand for</div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.2, color: 'var(--text)' }}>
            Our principles
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 20 }}>
          {VALUES.map((v, i) => (
            <div key={v.title} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)', padding: '28px 26px',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--r)',
                background: 'var(--primary-s)', border: '1px solid var(--primary-b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: 'var(--primary)',
                marginBottom: 18, fontFamily: 'var(--font-mono)',
              }}>0{i + 1}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>{v.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.75 }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* ── How it works ── */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '72px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: 1, color: 'var(--primary)', marginBottom: 14,
          }}>The platform</div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.2, color: 'var(--text)' }}>
            How it works
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            ['Workers',  'Clock in at the start of their shift, submit periodic check-ins with a screenshot and task count, then clock out. All actions are timestamped and stored.'],
            ['Admins',   'Manage their own team of workers and clients. Review pending activities, verify check-ins, set shift schedules, and run payroll reports — all within their siloed workspace.'],
            ['Clients',  'Log in to a read-only portal showing which of their assigned workers are currently online, how many tasks have been completed today, and a full attendance feed.'],
          ].map(([role, desc], i, arr) => (
            <div key={role} style={{
              display: 'flex', gap: 24, padding: '28px 0',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: 80, flexShrink: 0,
                fontSize: 12, fontWeight: 700, color: 'var(--primary)',
                textTransform: 'uppercase', letterSpacing: 0.8,
                paddingTop: 2, fontFamily: 'var(--font-mono)',
              }}>{role}</div>
              <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.8 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background: 'var(--primary)', padding: '72px 32px', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'radial-gradient(circle at 20% 50%, #fff 0%, transparent 55%), radial-gradient(circle at 80% 50%, #fff 0%, transparent 55%)',
        }} />
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: -1, marginBottom: 14 }}>
            Ready to get started?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginBottom: 36 }}>
            Apply for a position or sign in to your existing account.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => nav('/apply')} style={{
              background: '#fff', border: 'none', color: 'var(--primary)',
              padding: '13px 36px', borderRadius: 'var(--r-lg)',
              cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-sans)',
              transition: 'transform 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = ''}
            >Apply Now</button>
            <button onClick={() => nav('/login')} style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', padding: '13px 36px', borderRadius: 'var(--r-lg)',
              cursor: 'pointer', fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-sans)',
            }}>Sign In</button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: '28px 40px', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)' }}>AI Induction</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link to="/"       style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none' }}>Home</Link>
          <Link to="/about"  style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>About</Link>
          <Link to="/apply"  style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none' }}>Apply</Link>
          <Link to="/login"  style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none' }}>Sign In</Link>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          © {new Date().getFullYear()} AI Induction. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
