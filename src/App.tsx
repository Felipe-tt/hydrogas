import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import { useFirebaseSync } from './hooks/useFirebaseSync'
import { ToastProvider } from './components/ui/Toast'
import { Sidebar } from './components/ui/Sidebar'

import { Dashboard } from './pages/Dashboard'
import { Readings } from './pages/Readings'
import { Apartments } from './pages/Apartments'
import { History } from './pages/History'
import { Config } from './pages/Config'
import { ApartmentPublicView } from './pages/ApartmentPublicView'
import { Login } from './pages/Login'

import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './infrastructure/firebase'

import { useUIStore } from './store'
import { Skeleton } from './components/ui/Skeleton'

// ── Skeleton da tela inicial de auth ─────────────────────────────────────────

function AuthLoadingSkeleton() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
    }}>
      {/* Sidebar skeleton */}
      <div style={{
        width: 220,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '0 8px' }}>
          <Skeleton width={32} height={32} borderRadius={8} style={{ opacity: 0.3 }} />
          <Skeleton width={80} height={16} style={{ opacity: 0.3 }} />
        </div>
        {/* Nav items */}
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} width="100%" height={40} borderRadius={8} style={{ opacity: 0.15 }} />
        ))}
      </div>

      {/* Main content skeleton */}
      <div style={{ flex: 1, padding: '28px 32px' }}>
        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={160} height={22} />
            <Skeleton width={240} height={14} />
          </div>
          <Skeleton width={160} height={36} borderRadius={8} />
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skeleton width="55%" height={12} />
                  <Skeleton width="70%" height={26} />
                  <Skeleton width="40%" height={11} />
                </div>
                <Skeleton width={36} height={36} borderRadius={10} style={{ marginLeft: 8 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[1, 2].map(i => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <Skeleton width="50%" height={16} style={{ marginBottom: 18 }} />
              <Skeleton width="100%" height={200} borderRadius={8} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminLayout({ onLogout }: { onLogout: () => void }) {
  useFirebaseSync()
  const darkMode = useUIStore(s => s.darkMode)

  useEffect(() => {
    const root = document.documentElement
    darkMode
      ? root.setAttribute('data-theme', 'dark')
      : root.removeAttribute('data-theme')
  }, [darkMode])

  return (
    <div className="app-layout">
      <Sidebar onLogout={onLogout} />

      <main className="app-main">
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/leituras"     element={<Readings />} />
          <Route path="/apartamentos" element={<Apartments />} />
          <Route path="/historico"    element={<History />} />
          <Route path="/config"       element={<Config />} />
        </Routes>
      </main>
    </div>
  )
}

/**
 * AdminGate é a única fonte de verdade sobre autenticação.
 * Login.tsx chama signInWithCustomToken — o onAuthStateChanged
 * reage automaticamente, mas aguarda o onLogin() para liberar
 * o app (necessário para mostrar a tela de enroll biométrico).
 */
function AdminGate() {
  const [user, setUser]             = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [enrollDone, setEnrollDone] = useState(false)
  // Ref para saber se o primeiro disparo do onAuthStateChanged já ocorreu.
  // Necessário porque o closure do useEffect captura loading=true para sempre.
  const firstFire = useRef(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      const isFirstFire = firstFire.current
      firstFire.current = false

      setUser(u)
      setLoading(false)

      if (!u) {
        // Logout → reseta tudo
        setEnrollDone(false)
      } else if (isFirstFire) {
        // Primeira execução com usuário = sessão já existia (persistência Firebase)
        // → vai direto pro app sem passar pelo enroll
        setEnrollDone(true)
      }
      // isFirstFire=false e u existe = login novo feito agora
      // → enrollDone permanece false até onLogin() ser chamado pela tela de enroll
    })
    return () => unsub()
  }, [])

  const handleLogout = () => signOut(auth)

  if (loading) return <AuthLoadingSkeleton />
  // Usuário autenticado mas ainda não passou pelo enroll → mantém Login visível
  if (!user || !enrollDone) return <Login onLogin={() => setEnrollDone(true)} />

  return <AdminLayout onLogout={handleLogout} />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* Rota pública — não exige auth */}
          <Route path="/apt/:token" element={<ApartmentPublicView />} />

          {/* Todas as outras rotas passam pelo AdminGate */}
          <Route path="/*" element={<AdminGate />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
