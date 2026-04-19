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
      <nav className="mobile-nav">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}
          >
            <Icon size={20} />
            <span>{label === 'Configurações' ? 'Config' : label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
