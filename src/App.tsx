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
import { isBiometricSupported } from './hooks/useBiometric'

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
  const theme    = useUIStore(s => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', `${theme}-${darkMode ? 'dark' : 'light'}`)
  }, [darkMode, theme])

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
 *
 * Fluxo de login com senha + enroll biométrico:
 *  1. signInWithCustomToken → onAuthStateChanged pode disparar 2x ou mais
 *  2. enrollDone começa false → Login permanece visível durante todo o fluxo
 *  3. Login.tsx gerencia a tela de enroll internamente
 *  4. onLogin() é chamado pelo Login APENAS quando o enroll terminar (ok ou skip)
 *  5. onLogin() → setEnrollDone(true) → AdminLayout é montado
 *
 * Fluxo de sessão já existente (refresh da página):
 *  1. onAuthStateChanged dispara com usuário já logado (isFirstFire=true)
 *  2. Se tiver biometria cadastrada → Login mostra tela de digital
 *  3. Se não tiver → vai direto pro app (enrollDone=true)
 *
 * enrollDoneRef espelha o state para que disparos extras do onAuthStateChanged
 * (comuns durante signInWithCustomToken) não sobrescrevam o enrollDone=true
 * que já foi setado pelo onLogin().
 */
function AdminGate() {
  const [user, setUser]             = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [enrollDone, setEnrollDone] = useState(false)
  const enrollDoneRef = useRef(false)

  // Captura o estado do usuário ANTES de qualquer login novo.
  // auth.currentUser é síncrono — se for não-null aqui, havia sessão persistida.
  const hadSessionOnMount = useRef(auth.currentUser !== null)

  const handleEnrollDone = () => {
    enrollDoneRef.current = true
    setEnrollDone(true)
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)

      if (!u) {
        // Logout → reseta tudo
        enrollDoneRef.current = false
        hadSessionOnMount.current = false
        setEnrollDone(false)
        return
      }

      // Sessão já existia antes de montar (refresh da página, não login novo)
      if (hadSessionOnMount.current) {
        const hasBiometric =
          isBiometricSupported() &&
          localStorage.getItem('hg_bio_enrolled') === 'true' &&
          localStorage.getItem('hg_bio_cred_id')  !== null
        if (!hasBiometric) {
          enrollDoneRef.current = true
          setEnrollDone(true)
        }
        // hasBiometric=true → Login mostra tela biometric, enrollDone fica false
        // até o usuário autenticar via biometria e chamar onLogin()
        hadSessionOnMount.current = false  // só aplica no primeiro disparo
        return
      }

      // Login novo (signInWithCustomToken) — pode disparar múltiplas vezes.
      // Só libera o app se onLogin() já foi chamado pelo Login.
      if (enrollDoneRef.current) {
        setEnrollDone(true)
      }
      // enrollDoneRef=false → Login ainda está no fluxo de enroll, não faz nada.
    })
    return () => unsub()
  }, [])

  const handleLogout = () => signOut(auth)

  if (loading) return <AuthLoadingSkeleton />
  if (!user || !enrollDone) return <Login onLogin={handleEnrollDone} />
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
