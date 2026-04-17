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

interface SidebarProps { onLogout?: () => void }

export function Sidebar({ onLogout }: SidebarProps) {
  const config   = useAppStore(s => s.config)
  const { darkMode, setDarkMode } = useUIStore()

  return (
    <>
      <aside className="sidebar hide-on-mobile">

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Droplets size={17} color="white" />
          </div>
          <div>
            <div className="sidebar-logo-title">HidroGás</div>
            <div className="sidebar-logo-sub">{config?.condominiumName ?? '...'}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={15} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            className="sidebar-footer-btn"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode
              ? <Sun  size={15} color="#fbbf24" />
              : <Moon size={15} />}
            {darkMode ? 'Modo claro' : 'Modo escuro'}
          </button>
          {onLogout && (
            <button className="sidebar-footer-btn danger" onClick={onLogout}>
              <LogOut size={15} />Sair
            </button>
          )}
        </div>

        <div className="sidebar-version">v1.0.0</div>
      </aside>

      {/* Mobile bottom nav */}
      <nav style={{
        display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 'var(--nav-h)', background: 'var(--sidebar-bg)',
        borderTop: '1px solid var(--sidebar-border)',
        zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)',
      }} className="mobile-nav">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', flex: 1, gap: 3,
              textDecoration: 'none', fontSize: 10, fontWeight: 600,
              color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
              transition: 'color 0.15s',
            })}
          >
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
