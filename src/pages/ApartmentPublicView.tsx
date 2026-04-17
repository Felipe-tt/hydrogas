import { useEffect, useState }  from 'react'
import { useParams }            from 'react-router-dom'
import { Droplets, Flame, Building2, AlertCircle, TrendingUp, KeyRound, Eye, EyeOff, ArrowRight, ChevronDown } from 'lucide-react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getApp }               from 'firebase/app'
import { get, ref }             from 'firebase/database'
import { db }                   from '../infrastructure/firebase'

const functions = getFunctions(getApp(), 'us-central1')

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const fmt    = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const fmtM3  = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m³`

type Status = 'loading' | 'invalid' | 'auth' | 'found'

interface PublicReading {
  id:          string
  type:        'water' | 'gas'
  month:       number
  year:        number
  consumption: number
  totalCost:   number
  closedAt:    number
  startValue?: number
  endValue?:   number
}

interface PublicData {
  number:       string
  block?:       string | null
  responsible?: string | null
  readings:     PublicReading[]
  updatedAt:    number
}

// Grouped structure: year -> month -> readings[]
type GroupedReadings = Record<string, Record<string, PublicReading[]>>

// Armazena apenas um flag de sessão autenticada — nunca a senha em si.
// A senha plain text não deve persistir em sessionStorage (visível no DevTools).
const SESSION_AUTH_KEY = (token: string) => `hidrogas-auth-${token}`
const SESSION_TTL_MS   = 8 * 60 * 60 * 1000 // 8 horas

function markSessionAuthenticated(token: string) {
  sessionStorage.setItem(SESSION_AUTH_KEY(token), String(Date.now() + SESSION_TTL_MS))
}

function isSessionAuthenticated(token: string): boolean {
  const exp = Number(sessionStorage.getItem(SESSION_AUTH_KEY(token)) ?? 0)
  if (Date.now() > exp) { sessionStorage.removeItem(SESSION_AUTH_KEY(token)); return false }
  return true
}

function clearSessionAuthenticated(token: string) {
  sessionStorage.removeItem(SESSION_AUTH_KEY(token))
}

// ── MonthCard ────────────────────────────────────────────────────────────────
function MonthCard({ month, year, readings }: { month: number; year: number; readings: PublicReading[] }) {
  const [open, setOpen] = useState(true)

  const water  = readings.find(r => r.type === 'water')
  const gas    = readings.find(r => r.type === 'gas')
  const total  = readings.reduce((s, r) => s + r.totalCost, 0)

  return (
    <div
      className="card"
      style={{ overflow: 'hidden', marginBottom: 8 }}
    >
      {/* Month header — clickable */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '13px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
        }}
      >
        {/* Month label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {MONTHS[month - 1]}
          </span>
          {/* Pill badges for water / gas */}
          <span style={{ display: 'inline-flex', gap: 5, marginLeft: 10, verticalAlign: 'middle' }}>
            {water && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--water)',
                background: 'var(--water-light)', borderRadius: 20, padding: '2px 7px',
              }}>Água</span>
            )}
            {gas && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--gas)',
                background: 'var(--gas-light)', borderRadius: 20, padding: '2px 7px',
              }}>Gás</span>
            )}
          </span>
        </div>

        {/* Total for the month */}
        <span style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 14, fontWeight: 700,
          color: 'var(--text)',
          flexShrink: 0,
        }}>
          {fmt(total)}
        </span>

        {/* Chevron */}
        <ChevronDown
          size={15}
          color="var(--text-3)"
          style={{
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Collapsible body */}
      {open && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {readings.map(r => {
            const isWater   = r.type === 'water'
            const color     = isWater ? 'var(--water)' : 'var(--gas)'
            const bgIcon    = isWater ? 'var(--water-light)' : 'var(--gas-light)'
            const Icon      = isWater ? Droplets : Flame
            const hasMeters = r.startValue != null && r.endValue != null

            return (
              <div
                key={r.id}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}
              >
                {/* Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, background: bgIcon, borderRadius: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={16} color={color} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                      {isWater ? 'Água' : 'Gás'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                      {fmtM3(r.consumption)} consumidos
                    </div>
                  </div>

                  <div style={{
                    fontSize: 15, fontWeight: 800,
                    color, fontFamily: 'DM Mono, monospace', flexShrink: 0,
                  }}>
                    {fmt(r.totalCost)}
                  </div>
                </div>

                {/* Meter row */}
                {hasMeters && (
                  <div style={{
                    marginTop: 9,
                    paddingTop: 9,
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: 11, color: 'var(--text-3)', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0,
                    }}>
                      Medidor
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {[r.startValue!, r.endValue!].map((val, i, arr) => (
                        <>
                          <span key={`val-${i}`} style={{
                            fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600,
                            color: 'var(--text)', background: 'var(--bg)',
                            border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px',
                          }}>
                            {fmtM3(val)}
                          </span>
                          {i < arr.length - 1 && <ArrowRight key={`arrow-${i}`} size={11} color="var(--text-3)" />}
                        </>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── YearSection ──────────────────────────────────────────────────────────────
function YearSection({ year, months }: { year: string; months: Record<string, PublicReading[]> }) {
  const [open, setOpen] = useState(true)

  const yearTotal = Object.values(months).flat().reduce((s, r) => s + r.totalCost, 0)
  const monthKeys = Object.keys(months).map(Number).sort((a, b) => b - a) // newest first

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Year header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', textAlign: 'left', marginBottom: 10, padding: 0,
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
        }}>
          {year}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
          fontFamily: 'DM Mono, monospace', flexShrink: 0,
        }}>
          {fmt(yearTotal)}
        </span>
        <ChevronDown
          size={13}
          color="var(--text-3)"
          style={{
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open && (
        <div>
          {monthKeys.map(m => (
            <MonthCard
              key={m}
              month={m}
              year={Number(year)}
              readings={months[String(m)]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ApartmentPublicView() {
  const { token } = useParams<{ token: string }>()

  const [status,      setStatus]      = useState<Status>('loading')
  const [data,        setData]        = useState<PublicData | null>(null)
  const [condoName,   setCondoName]   = useState<string>('Condomínio')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [passError,   setPassError]   = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  async function fetchData(tok: string, pwd: string) {
    const fn = httpsCallable<{ token: string; password: string }, PublicData>(
      functions,
      'getPublicApartment'
    )
    const result = await fn({ token: tok, password: pwd })
    setData(result.data)
    setStatus('found')
  }

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }

    async function load() {
      try {
        const [hasPassSnap, configSnap] = await Promise.all([
          get(ref(db, `public/${token}/hasPassword`)),
          get(ref(db, 'config')),
        ])

        if (configSnap.exists()) {
          setCondoName(configSnap.val().condominiumName ?? 'Condomínio')
        }

        const needsPassword = hasPassSnap.exists() && hasPassSnap.val() === true

        if (!needsPassword) {
          // Sem senha: verifica flag de sessão para evitar chamada redundante,
          // mas como a função aceita password vazio, chama direto.
          await fetchData(token, '')
        } else if (isSessionAuthenticated(token)) {
          // Apt com senha + sessão válida: usuário já autenticou recentemente.
          // Sessão armazena apenas o timestamp — a senha não é persistida.
          // Mostra tela de senha com aviso de sessão ativa para confirmar.
          setStatus('auth')
        } else {
          setStatus('auth')
        }
      } catch (err: any) {
        const code = err?.code ?? ''
        if (code === 'functions/unauthenticated') {
          clearSessionAuthenticated(token)
          setStatus('auth')
        } else {
          setStatus('invalid')
        }
      }
    }

    load()
  }, [token])

  const handleAuth = async () => {
    if (!token) return
    setAuthLoading(true)
    setPassError('')
    try {
      await fetchData(token, password)
      // Sessão autenticada — senha mantida apenas em memória (estado React), não persiste
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'functions/unauthenticated') {
        setPassError('Senha incorreta. Verifique com o síndico.')
      } else if (code === 'functions/not-found') {
        setStatus('invalid')
      } else {
        setPassError('Erro ao verificar. Tente novamente.')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  // Sort newest first, then group year → month → readings[]
  const readings = (data?.readings ?? []).sort((a, b) => b.year - a.year || b.month - a.month)

  const grouped: GroupedReadings = readings.reduce<GroupedReadings>((acc, r) => {
    const y = String(r.year)
    const m = String(r.month)
    if (!acc[y]) acc[y] = {}
    if (!acc[y][m]) acc[y][m] = []
    acc[y][m].push(r)
    return acc
  }, {})

  const yearKeys = Object.keys(grouped).sort((a, b) => Number(b) - Number(a))

  const totalWater = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.totalCost, 0)
  const totalGas   = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.totalCost, 0)

  const Header = () => (
    <header style={{
      background: 'var(--sidebar-bg)',
      padding: '0 20px',
      borderBottom: '1px solid var(--sidebar-border)',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Droplets size={17} color="white" />
        </div>
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>HidroGás</div>
          <div style={{ color: 'var(--sidebar-text)', fontSize: 11, marginTop: 2 }}>{condoName}</div>
        </div>
      </div>
    </header>
  )

  // ── States ──────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: 'var(--water)', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 14 }}>Carregando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 60, height: 60, background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <AlertCircle size={28} color="#dc2626" />
          </div>
          <h2 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 18 }}>Link inválido</h2>
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 14, lineHeight: 1.5 }}>Este link não corresponde a nenhum apartamento cadastrado.</p>
        </div>
      </div>
    )
  }

  if (status === 'auth') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 60, height: 60, background: 'var(--water-light)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Building2 size={28} color="var(--water)" />
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>
                Área do Morador
              </h2>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>Digite a senha para acessar seu histórico</p>
            </div>

            <div className="card" style={{ padding: 22 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                Senha de acesso
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: `1px solid ${passError ? '#dc2626' : 'var(--border)'}`, borderRadius: 8, padding: '0 12px', gap: 8, marginBottom: passError ? 10 : 16 }}>
                <KeyRound size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPassError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  placeholder="••••••••"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', padding: '11px 0', fontSize: 15, fontFamily: 'DM Mono, monospace', letterSpacing: 2, color: 'var(--text)' }}
                  autoFocus
                  disabled={authLoading}
                />
                <button onClick={() => setShowPass(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-3)' }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {passError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
                  <AlertCircle size={13} />{passError}
                </div>
              )}

              <button
                onClick={handleAuth}
                disabled={authLoading}
                style={{ width: '100%', padding: '11px 0', background: 'var(--water)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 14, cursor: authLoading ? 'not-allowed' : 'pointer', opacity: authLoading ? 0.7 : 1 }}
              >
                {authLoading ? 'Verificando...' : 'Acessar'}
              </button>
              <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                A senha é fornecida pelo síndico do condomínio.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Found ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px' }}>

        {/* Apartment card */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, background: 'var(--water-light)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={20} color="var(--water)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Apartamento {data!.number}{data!.block ? ` — Bloco ${data!.block}` : ''}
            </h1>
            {data!.responsible && (
              <p style={{ margin: '3px 0 0', color: 'var(--text-2)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Responsável: {data!.responsible}
              </p>
            )}
          </div>
        </div>

        {/* KPI totals */}
        {readings.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total Água',  value: fmt(totalWater),            color: 'var(--water)', Icon: Droplets,   bg: 'var(--water-light)' },
              { label: 'Total Gás',   value: fmt(totalGas),              color: 'var(--gas)',   Icon: Flame,      bg: 'var(--gas-light)'   },
              { label: 'Total Geral', value: fmt(totalWater + totalGas), color: '#7c3aed',      Icon: TrendingUp, bg: 'rgba(124,58,237,0.1)' },
            ].map(({ label, value, color, Icon, bg }) => (
              <div key={label} className="card" style={{ padding: '12px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={12} color={color} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Section title */}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Histórico de Leituras
        </h2>

        {readings.length === 0 ? (
          <div className="card" style={{ padding: 44, textAlign: 'center' }}>
            <TrendingUp size={34} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.2, color: 'var(--text-3)' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontSize: 14 }}>Nenhuma leitura registrada</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>As leituras fechadas aparecerão aqui</div>
          </div>
        ) : (
          yearKeys.map(year => (
            <YearSection
              key={year}
              year={year}
              months={grouped[year]}
            />
          ))
        )}
      </div>
    </div>
  )
}
