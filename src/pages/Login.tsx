/**
 * Login.tsx — HidroGás
 *
 * Estados da tela:
 *  'password'  → formulário usuário + senha (sempre disponível como fallback)
 *  'biometric' → tela de digital (se já cadastrada no dispositivo)
 *  'enroll'    → oferta de cadastro de digital (pós login com senha bem-sucedido)
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Droplets, Lock, User, Eye, EyeOff, AlertCircle, Fingerprint, ShieldCheck,
} from 'lucide-react'
import { httpsCallable }         from 'firebase/functions'
import { getFunctions }          from 'firebase/functions'
import { signInWithCustomToken } from 'firebase/auth'
import { app, auth }             from '../infrastructure/firebase'
import {
  useBiometric,
  isPlatformAuthenticatorAvailable,
  isBiometricSupported,
} from '../hooks/useBiometric'

interface LoginProps { onLogin?: () => void }
type Screen = 'password' | 'biometric' | 'enroll'

function useAdminLogin() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const submitting             = useRef(false)

  const login = useCallback(async (
    username: string, password: string,
    onSuccess: () => void, onAuthError: () => void,
  ) => {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError('')
    try {
      const functions  = getFunctions(app, 'us-central1')
      const adminLogin = httpsCallable<{ username: string; password: string }, { token: string }>(
        functions, 'adminLogin'
      )
      let token: string
      try {
        const result = await adminLogin({ username: username.trim(), password })
        token = result.data.token
      } catch (fnErr: any) {
        const code = fnErr?.code ?? ''
        if      (code === 'functions/unauthenticated')    { setError('Usuário ou senha incorretos.'); onAuthError() }
        else if (code === 'functions/resource-exhausted') { setError('Muitas tentativas. Aguarde 15 minutos.') }
        else if (code === 'functions/invalid-argument')   { setError('Preencha usuário e senha.') }
        else                                              { setError('Erro ao conectar ao servidor. Verifique sua internet.') }
        return
      }
      try {
        const userCredential = await signInWithCustomToken(auth, token)
        // Aguarda o SDK propagar o token internamente antes de chamar funções autenticadas
        await userCredential.user.getIdToken()
        onSuccess()
      } catch (fbErr: any) {
        const code = fbErr?.code || ''
        if      (code === 'auth/invalid-custom-token')      { setError('Token de sessão inválido. Tente novamente.') }
        else if (code === 'auth/network-request-failed')    { setError('Falha de rede. Verifique sua internet.') }
        else                                                { setError('Erro ao estabelecer sessão. Tente novamente.') }
      }
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }, [])

  return { loading, error, login, setError }
}

export function Login({ onLogin }: LoginProps) {
  const [screen, setScreen]         = useState<Screen>('password')
  const [username, setUsername]     = useState('')
  const [password, setPassword]     = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [bioAvailable, setBioAvail] = useState(false)
  const [bioChecked, setBioChecked] = useState(false)
  const passwordRef                  = useRef<HTMLInputElement>(null)

  const { loading, error, login } = useAdminLogin()
  const bio = useBiometric()

  useEffect(() => {
    if (!isBiometricSupported()) { setBioChecked(true); return }
    isPlatformAuthenticatorAvailable().then(available => {
      setBioAvail(available)
      setBioChecked(true)
    })
  }, [])

  const enrolled = bio.isEnrolled()
  
  useEffect(() => {
    if (!bioChecked) return
    if (bioAvailable && enrolled) setScreen('biometric')
  }, [bioChecked, bioAvailable, enrolled])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    await login(
      username, password,
      async () => {
        // Checa no momento exato do sucesso — não depende do state assíncrono inicial
        const supported = isBiometricSupported()
        if (!supported) { onLogin?.(); return }
        if (bio.isEnrolled()) { setScreen('biometric'); return }
        const available = await isPlatformAuthenticatorAvailable()
        available ? setScreen('enroll') : onLogin?.()
      },
      () => { setPassword(''); passwordRef.current?.focus() },
    )
  }

  const handleBiometricAuth = useCallback(async () => {
    const ok = await bio.authenticate()
    if (ok) onLogin?.()
  }, [bio, onLogin])

  const handleEnrollAccept = useCallback(async () => {
    const ok = await bio.enroll()
    // ok=true → cadastro concluído; ok=false pode ser cancelamento (state='idle') ou erro auth
    // Só permanece na tela se houve erro de autenticação (ex: sessão expirada)
    if (ok) { onLogin?.(); return }
    // Após enroll(), o state já foi setado; checamos via localStorage se revoke() foi chamado
    const stillEnrolled = localStorage.getItem('hg_bio_enrolled') === 'true'
    if (!stillEnrolled) {
      // revoke() foi chamado → credencial inválida, mas usuário já está autenticado → vai pro app
      onLogin?.()
    }
    // state='idle' (cancelamento) → fica na tela para o usuário decidir
  }, [bio, onLogin])

  const decorations = (
    <div className="login-bg-decorations">
      <div className="login-bg-blob-1" /><div className="login-bg-blob-2" />
    </div>
  )
  const logo = (
    <div className="login-logo-wrap">
      <div className="login-logo-icon"><Droplets size={30} color="white" /></div>
      <h1 className="login-title">HidroGás</h1>
      <p className="login-subtitle">Painel Administrativo</p>
    </div>
  )

  /* ── Tela biometria ── */
  if (screen === 'biometric') return (
    <div className="login-page">
      {decorations}
      <div className="login-content">
        {logo}
        <div className="card login-card">
          <div className="bio-screen">
            <button
              className={`bio-icon-btn${bio.state === 'authenticating' ? ' bio-icon-btn--scanning' : ''}`}
              onClick={handleBiometricAuth}
              disabled={bio.state === 'authenticating'}
              aria-label="Autenticar com biometria"
            >
              <Fingerprint
                size={52} strokeWidth={1.4}
                className={`bio-fingerprint-icon${
                  bio.state === 'authenticating' ? ' bio-fingerprint-icon--active' :
                  bio.state === 'error'          ? ' bio-fingerprint-icon--error'  : ''
                }`}
              />
            </button>
            <p className="bio-instruction">
              {bio.state === 'authenticating' ? 'Verificando...' :
               bio.state === 'error'          ? 'Falha na leitura'   : 'Toque para entrar'}
            </p>
            {bio.error && (
              <div role="alert" className="login-error bio-error">
                <AlertCircle size={14} style={{ flexShrink: 0 }} />{bio.error}
              </div>
            )}
            {bio.state === 'error' && (
              <button className="btn-primary bio-retry-btn" onClick={handleBiometricAuth}>
                Tentar novamente
              </button>
            )}
            <button className="bio-use-password" onClick={() => { setScreen('password') }}>
              Usar senha
            </button>
          </div>
        </div>
        <p className="login-footer-note">Autenticação protegida</p>
      </div>
    </div>
  )

  /* ── Tela enroll ── */
  if (screen === 'enroll') return (
    <div className="login-page">
      {decorations}
      <div className="login-content">
        {logo}
        <div className="card login-card">
          <div className="enroll-screen">
            <div className="enroll-icon-wrap">
              <ShieldCheck size={36} strokeWidth={1.5} className="enroll-shield-icon" />
            </div>
            <h2 className="enroll-title">Ativar acesso por digital?</h2>
            <p className="enroll-desc">
              Nas próximas entradas, basta tocar o sensor — sem digitar senha.
              Sua digital nunca sai deste dispositivo.
            </p>
            {bio.error && (
              <div role="alert" className="login-error" style={{ marginBottom: 12 }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />{bio.error}
              </div>
            )}
            <button
              className="btn-primary enroll-accept-btn"
              onClick={handleEnrollAccept}
              disabled={bio.state === 'enrolling'}
            >
              {bio.state === 'enrolling'
                ? <><Spinner /> Aguardando digital...</>
                : <><Fingerprint size={16} /> Ativar digital</>
              }
            </button>
            <button className="enroll-skip-btn" onClick={() => onLogin?.()} disabled={bio.state === 'enrolling'}>
              Agora não
            </button>
          </div>
        </div>
        <p className="login-footer-note">Autenticação protegida</p>
      </div>
    </div>
  )

  /* ── Tela senha ── */
  return (
    <div className="login-page">
      {decorations}
      <div className="login-content">
        {logo}
        <div className="card login-card">
          <h2 className="login-card-title">Entrar</h2>
          <form onSubmit={handlePasswordSubmit} noValidate className="login-form">
            <div>
              <label className="label" htmlFor="login-username">Usuário</label>
              <div className="login-input-wrap">
                <User size={15} className="login-input-icon" />
                <input id="login-username" className="input login-input-with-icon"
                  type="text" placeholder="admin" value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username" autoCapitalize="none" spellCheck={false}
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="login-password">Senha</label>
              <div className="login-input-wrap">
                <Lock size={15} className="login-input-icon" />
                <input id="login-password" ref={passwordRef}
                  className="input login-input-with-icon-right"
                  type={showPwd ? 'text' : 'password'} placeholder="••••••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" disabled={loading}
                />
                <button type="button" aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPwd(v => !v)} className="login-toggle-password" tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && (
              <div role="alert" className="login-error">
                <AlertCircle size={14} style={{ flexShrink: 0 }} />{error}
              </div>
            )}
            <button type="submit" className="btn-primary login-submit"
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading ? <><Spinner /> Verificando...</> : 'Entrar'}
            </button>
            {bioAvailable && bio.isEnrolled() && (
              <button type="button" className="bio-use-password" style={{ marginTop: 0 }}
                onClick={() => setScreen('biometric')}
              >
                <Fingerprint size={14} style={{ marginRight: 6 }} />Usar digital
              </button>
            )}
          </form>
        </div>
        <p className="login-footer-note">Autenticação protegida</p>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="spinner-svg" aria-hidden="true">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
