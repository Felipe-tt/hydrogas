import { useState, useRef, useCallback }                    from 'react'
import { Droplets, Lock, User, Eye, EyeOff, AlertCircle }  from 'lucide-react'
import { signInWithCustomToken }                            from 'firebase/auth'
import { auth }                                             from '../infrastructure/firebase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface LoginProps {
  onLogin?: () => void
}

interface CloudFnSuccess {
  token: string
}

interface CloudFnError {
  error: string
}

type CloudFnResponse = CloudFnSuccess | CloudFnError

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
      // 1. Chamar Cloud Function para validar credenciais
      const fnUrl = import.meta.env.VITE_CLOUD_FN_URL
      if (!fnUrl) {
        setError('URL da função de autenticação não configurada. Defina VITE_CLOUD_FN_URL no .env.')
        return
      }
      let res: Response
      try {
        res = await fetch(fnUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ username: username.trim(), password }),
        })
      } catch {
        setError('Não foi possível conectar ao servidor. Verifique sua internet.')
        return
      }

      // 2. Parsear JSON da resposta
      let data: CloudFnResponse
      try {
        data = await res.json()
      } catch {
        setError(`Resposta inesperada do servidor (HTTP ${res.status}).`)
        return
      }

      // 3. Tratar erros HTTP
      if (!res.ok) {
        const msg = (data as CloudFnError).error
        if (res.status === 401) {
          setError('Usuário ou senha incorretos.')
          onAuthError()
        } else if (res.status === 429) {
          setError(msg || 'Muitas tentativas. Aguarde 15 minutos.')
        } else if (res.status === 500) {
          setError(msg || 'Erro interno no servidor.')
        } else {
          setError(msg || `Erro inesperado (${res.status}).`)
        }
        return
      }

      // 4. Autenticar no Firebase com o custom token
      const { token } = data as CloudFnSuccess
      if (!token) {
        setError('Resposta inválida do servidor (sem token).')
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

  // Chamado pelo hook quando as credenciais são rejeitadas (401)
  // Limpa a senha e devolve o foco ao campo para o usuário corrigir
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
    <div style={{
      minHeight:       '100vh',
      background:      'var(--bg)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         16,
    }}>

      {/* Gradientes decorativos */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(234,88,12,0.05) 0%, transparent 70%)', borderRadius: '50%' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(37,99,235,0.3)' }}>
            <Droplets size={30} color="white" />
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5 }}>HidroGás</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-2)', fontSize: 14 }}>Painel Administrativo</p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Entrar</h2>

          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Usuário */}
            <div>
              <label className="label" htmlFor="login-username">Usuário</label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                <input
                  id="login-username"
                  className="input"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  style={{ paddingLeft: 36 }}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label className="label" htmlFor="login-password">Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                <input
                  id="login-password"
                  ref={passwordRef}
                  className="input"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div
                role="alert"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', color: '#dc2626', fontSize: 13 }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !username.trim() || !password.trim()}
              style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {loading
                ? <><Spinner /> Verificando...</>
                : 'Entrar'
              }
            </button>

          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-3)' }}>
          Autenticação protegida
        </p>
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
      style={{ animation: 'spin 0.7s linear infinite' }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
