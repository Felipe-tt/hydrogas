import { useState, useRef, useCallback }                    from 'react'
import { Droplets, Lock, User, Eye, EyeOff, AlertCircle }  from 'lucide-react'
import { httpsCallable }                                    from 'firebase/functions'
import { getFunctions }                                     from 'firebase/functions'
import { signInWithCustomToken }                            from 'firebase/auth'
import { app, auth }                                        from '../infrastructure/firebase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface LoginProps {
  onLogin?: () => void
}

// ── Hook: lógica de autenticação ──────────────────────────────────────────────

function useAdminLogin() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const submitting             = useRef(false)

  const login = useCallback(async (
    username: string,
    password: string,
    onSuccess: () => void,
    onAuthError: () => void,
  ) => {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError('')

    try {
      const functions  = getFunctions(app, 'us-central1')
      const adminLogin = httpsCallable<
        { username: string; password: string },
        { token: string }
      >(functions, 'adminLogin')

      let token: string
      try {
        const result = await adminLogin({ username: username.trim(), password })
        token = result.data.token
      } catch (fnErr: any) {
        const code = fnErr?.code ?? ''
        if (code === 'functions/unauthenticated') {
          setError('Usuário ou senha incorretos.')
          onAuthError()
        } else if (code === 'functions/resource-exhausted') {
          setError('Muitas tentativas. Aguarde 15 minutos.')
        } else if (code === 'functions/invalid-argument') {
          setError('Preencha usuário e senha.')
        } else {
          setError('Erro ao conectar ao servidor. Verifique sua internet.')
        }
        return
      }

      try {
        await signInWithCustomToken(auth, token)
        onSuccess()
      } catch (fbErr: any) {
        const code = fbErr?.code || ''
        if (code === 'auth/invalid-custom-token') {
          setError('Token de sessão inválido. Tente novamente.')
        } else if (code === 'auth/network-request-failed') {
          setError('Falha de rede ao estabelecer sessão. Verifique sua internet.')
        } else {
          setError('Erro ao estabelecer sessão. Tente novamente.')
        }
      }

    } finally {
      setLoading(false)
      submitting.current = false
    }
  }, [])

  return { loading, error, login }
}

// ── Componente ────────────────────────────────────────────────────────────────

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const passwordRef             = useRef<HTMLInputElement>(null)

  const { loading, error, login } = useAdminLogin()

  const handleAuthError = useCallback(() => {
    setPassword('')
    passwordRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    await login(username, password, () => onLogin?.(), handleAuthError)
  }

  return (
    <div className="login-page">

      {/* Gradientes decorativos */}
      <div className="login-bg-decorations">
        <div className="login-bg-blob-1" />
        <div className="login-bg-blob-2" />
      </div>

      <div className="login-content">

        {/* Logo */}
        <div className="login-logo-wrap">
          <div className="login-logo-icon">
            <Droplets size={30} color="white" />
          </div>
          <h1 className="login-title">HidroGás</h1>
          <p className="login-subtitle">Painel Administrativo</p>
        </div>

        {/* Card */}
        <div className="card login-card">
          <h2 className="login-card-title">Entrar</h2>

          <form onSubmit={handleSubmit} noValidate className="login-form">

            {/* Usuário */}
            <div>
              <label className="label" htmlFor="login-username">Usuário</label>
              <div className="login-input-wrap">
                <User size={15} className="login-input-icon" />
                <input
                  id="login-username"
                  className="input login-input-with-icon"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label className="label" htmlFor="login-password">Senha</label>
              <div className="login-input-wrap">
                <Lock size={15} className="login-input-icon" />
                <input
                  id="login-password"
                  ref={passwordRef}
                  className="input login-input-with-icon-right"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPwd(v => !v)}
                  className="login-toggle-password"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div role="alert" className="login-error">
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary login-submit"
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading
                ? <><Spinner /> Verificando...</>
                : 'Entrar'
              }
            </button>

          </form>
        </div>

        <p className="login-footer-note">Autenticação protegida</p>
      </div>
    </div>
  )
}

// ── Spinner inline ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="14" height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="spinner-svg"
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
