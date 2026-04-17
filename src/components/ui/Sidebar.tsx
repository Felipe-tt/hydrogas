import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Gauge, History, Settings, Droplets, Moon, Sun, LogOut } from 'lucide-react'
import { useAppStore, useUIStore } from '../../store'

const links = [
  { to: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/leituras',     label: 'Leituras',      icon: Gauge },
  { to: '/apartamentos', label: 'Apartamentos',  icon: Building2 },
  { to: '/historico',    label: 'Histórico',     icon: History },
  { to: '/config',       label: 'Configurações', icon: Settings },
]

interface SidebarProps {
  onLogout?: () => void
}

export function Sidebar({ onLogout }: SidebarProps) {
  const config = useAppStore(s => s.config)
  const { darkMode, setDarkMode } = useUIStore()

  const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'transparent', color: 'var(--sidebar-text)',
    fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
  } as const

  return (
    <>
      <aside style={{ width: 220, minHeight: '100vh', background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0, borderRight: '1px solid var(--sidebar-border)', transition: 'background 0.2s ease' }} className="hide-on-mobile">
        <div style={{ padding: '0 20px 28px', borderBottom: '1px solid var(--sidebar-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#2563eb,#3b82f6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Droplets size={18} color="white" />
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>HidroGás</div>
              <div style={{ color: 'var(--sidebar-text)', fontSize: 11, marginTop: 2, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {config?.condominiumName ?? '...'}
              </div>
            </div>
          </div>
        </div>

        <nav style={{ padding: '16px 12px', flex: 1 }}>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, marginBottom: 2, textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'all 0.15s', background: isActive ? 'var(--sidebar-active)' : 'transparent', color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)' })}>
              <Icon size={16} />{label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '0 12px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={() => setDarkMode(!darkMode)} style={btnStyle} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {darkMode ? <Sun size={16} color="#fbbf24" /> : <Moon size={16} />}
            {darkMode ? 'Modo claro' : 'Modo escuro'}
          </button>
          {onLogout && (
            <button onClick={onLogout} style={{ ...btnStyle, color: '#ef4444' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <LogOut size={16} />Sair
            </button>
          )}
        </div>

        <div style={{ padding: '8px 20px 4px', color: 'var(--sidebar-text)', fontSize: 11 }}>v1.0.0</div>
      </aside>

      <nav style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, height: 'var(--nav-h)', background: 'var(--sidebar-bg)', borderTop: '1px solid var(--sidebar-border)', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)', transition: 'background 0.2s ease' }} className="mobile-nav">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 3, textDecoration: 'none', fontSize: 10, fontWeight: 500, transition: 'color 0.15s', color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)' })}>
            <Icon size={20} />
            <span>{label === 'Configurações' ? 'Config' : label}</span>
          </NavLink>
        ))}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .hide-on-mobile { display: none !important; }
          .mobile-nav { display: flex !important; }
        }
      `}</style>
    </>
  )
}
