import { useEffect, useState, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { useParams } from 'react-router-dom'
import {
  Droplets, Flame, Building2, AlertCircle, TrendingUp, KeyRound,
  Eye, EyeOff, ArrowRight, ChevronDown, Settings, Moon, Sun,
  Type, BarChart2, Info, Phone, MapPin, User, ChevronLeft,
} from 'lucide-react'
import { httpsCallable }         from 'firebase/functions'
import { get, ref }              from 'firebase/database'
import { signInWithCustomToken } from 'firebase/auth'
import { residentAuth, residentFunctions, residentDb } from '../infrastructure/firebase/residentApp'

const functions = residentFunctions

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const fmt   = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const fmtM3 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m³`

type Status  = 'loading' | 'invalid' | 'auth' | 'found'
type SubView = null | 'consumo' | 'sobre'

interface PublicReading {
  id: string; type: 'water' | 'gas'; month: number; year: number
  consumption: number; totalCost: number; closedAt: number
  startValue?: number; endValue?: number
}
interface CondoInfo {
  name?: string | null; managerName?: string | null
  managerPhone?: string | null; address?: string | null
  latitude?: number | null; longitude?: number | null
}
interface PublicData {
  number: string; block?: string | null; responsible?: string | null
  readings: PublicReading[]; condoInfo?: CondoInfo; updatedAt: number
}
type GroupedReadings = Record<string, Record<string, PublicReading[]>>

// ── useWindowWidth ────────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return w
}

// ── Prefs ─────────────────────────────────────────────────────────────────────
function useResidentPrefs(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    try { const s = localStorage.getItem('hidrogas-resident-dark'); if (s !== null) return s === 'true' } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })
  const [fontSize, setFontSizeState] = useState<'normal' | 'large'>(() => {
    try { return (localStorage.getItem('hidrogas-resident-font') as any) ?? 'normal' } catch { return 'normal' }
  })
  useEffect(() => {
    // Aplica o tema no wrapper da view pública, nunca no <html> global
    // (que pertence ao tema do admin e usa nomes como "ocean-dark", "emerald-light" etc.)
    const el = wrapperRef.current
    if (!el) return
    el.setAttribute('data-theme', darkMode ? 'ocean-dark' : 'ocean-light')
    try { localStorage.setItem('hidrogas-resident-dark', String(darkMode)) } catch {}
  }, [darkMode, wrapperRef])
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    if (fontSize === 'large') el.classList.add('resident-large')
    else el.classList.remove('resident-large')
    try { localStorage.setItem('hidrogas-resident-font', fontSize) } catch {}
    return () => el?.classList.remove('resident-large')
  }, [fontSize, wrapperRef])
  return { darkMode, setDarkMode: setDarkModeState, fontSize, setFontSize: setFontSizeState }
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      className="public-toggle-btn"
      style={{ background: on ? 'var(--water)' : 'var(--surface-4)' }}
    >
      <span className="public-toggle-thumb" style={{ left: on ? 22 : 4 }} />
    </button>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({
  onClose, darkMode, setDarkMode, fontSize, setFontSize, onOpenSubView,
}: {
  onClose: () => void; darkMode: boolean; setDarkMode: (v: boolean) => void
  fontSize: 'normal' | 'large'; setFontSize: (v: 'normal' | 'large') => void
  onOpenSubView: (v: SubView) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const w = useWindowWidth()
  const isMobile = w < 520

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const Row = ({ icon, label, control, onClick }: {
    icon: React.ReactNode; label: string; control?: React.ReactNode; onClick?: () => void
  }) => (
    <div
      onClick={onClick}
      className={`settings-row${onClick ? ' settings-row-clickable' : ''}`}
      style={{ padding: isMobile ? '15px 18px' : '12px 16px' }}
    >
      <div className="settings-row-left">
        <span className="settings-row-icon">{icon}</span>
        <span style={{ fontSize: isMobile ? 15 : 14, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
      </div>
      {control ?? (onClick && <ChevronDown size={13} color="var(--text-3)" style={{ transform: 'rotate(-90deg)' }} />)}
    </div>
  )

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <>
        <div onClick={onClose} className="settings-backdrop" />
        <div className="settings-sheet">
          <div className="settings-sheet-handle-wrap">
            <div className="settings-sheet-handle" />
          </div>
          <div className="settings-sheet-menu-label">
            <span className="settings-menu-label-text">Menu</span>
          </div>
          <Row icon={<BarChart2 size={17} />} label="Meu consumo" onClick={() => { onOpenSubView('consumo'); onClose() }} />
          <Row icon={<Info size={17} />} label="Sobre o condomínio" onClick={() => { onOpenSubView('sobre'); onClose() }} />
          <div className="settings-sheet-prefs-wrap">
            <div className="settings-sheet-prefs-label">Preferências</div>
            <Row icon={darkMode ? <Moon size={17} /> : <Sun size={17} />} label={darkMode ? 'Modo escuro' : 'Modo claro'} control={<Toggle on={darkMode} onToggle={() => setDarkMode(!darkMode)} />} />
            <Row icon={<Type size={17} />} label="Texto grande" control={<Toggle on={fontSize === 'large'} onToggle={() => setFontSize(fontSize === 'large' ? 'normal' : 'large')} />} />
          </div>
          <div className="settings-sheet-footer">Salvo neste dispositivo</div>
        </div>
      </>
    )
  }

  // Desktop: dropdown
  return (
    <div ref={panelRef} className="settings-dropdown">
      <div className="settings-dropdown-header">
        <span className="settings-menu-label-text">Menu</span>
      </div>
      <Row icon={<BarChart2 size={15} />} label="Meu consumo" onClick={() => { onOpenSubView('consumo'); onClose() }} />
      <Row icon={<Info size={15} />} label="Sobre o condomínio" onClick={() => { onOpenSubView('sobre'); onClose() }} />
      <div className="settings-dropdown-prefs-wrap">
        <div className="settings-dropdown-prefs-label">Preferências</div>
        <Row icon={darkMode ? <Moon size={15} /> : <Sun size={15} />} label={darkMode ? 'Modo escuro' : 'Modo claro'} control={<Toggle on={darkMode} onToggle={() => setDarkMode(!darkMode)} />} />
        <Row icon={<Type size={15} />} label="Texto grande" control={<Toggle on={fontSize === 'large'} onToggle={() => setFontSize(fontSize === 'large' ? 'normal' : 'large')} />} />
      </div>
      <div className="settings-dropdown-footer">Salvo neste dispositivo</div>
    </div>
  )
}

// ── SubViewShell ──────────────────────────────────────────────────────────────
function SubViewShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="subview-shell">
      <div className="subview-nav">
        <button onClick={onClose} className="subview-back-btn">
          <ChevronLeft size={20} />
        </button>
        <span className="subview-title">{title}</span>
      </div>
      <div className="subview-content">{children}</div>
    </div>
  )
}

// ── ConsumoTooltip ────────────────────────────────────────────────────────────
function ConsumoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="consumo-tooltip">
      <div className="consumo-tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="consumo-tooltip-row">
          <span className="consumo-tooltip-dot" style={{ background: p.fill }} />
          <span className="consumo-tooltip-name">{p.name}:</span>
          <span className="consumo-tooltip-value" style={{ color: p.fill }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="consumo-tooltip-total">
          <span className="consumo-tooltip-total-label">Total</span>
          <span className="consumo-tooltip-total-value">
            {fmt(payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0))}
          </span>
        </div>
      )}
    </div>
  )
}

// ── ConsumoView ───────────────────────────────────────────────────────────────
function ConsumoView({ readings, onClose }: { readings: PublicReading[]; onClose: () => void }) {
  const w        = useWindowWidth()
  const isMobile = w < 480

  const sorted = [...readings].sort((a, b) => a.year - b.year || a.month - b.month)
  const last12 = sorted.slice(-12)

  const barData = last12.reduce<{ label: string; agua: number; gas: number }[]>((acc, r) => {
    const label = `${MONTHS[r.month - 1].slice(0, 3)}/${String(r.year).slice(2)}`
    const item = acc.find(x => x.label === label) ?? (() => { const o = { label, agua: 0, gas: 0 }; acc.push(o); return o })()
    if (r.type === 'water') item.agua = +(item.agua + r.totalCost).toFixed(2)
    else item.gas = +(item.gas + r.totalCost).toFixed(2)
    return acc
  }, [])

  const totalW  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.totalCost, 0)
  const totalG  = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.totalCost, 0)
  const totalC  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.consumption, 0)
  const totalGC = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.consumption, 0)

  const lastWater = sorted.filter(r => r.type === 'water').slice(-2)
  const lastGas   = sorted.filter(r => r.type === 'gas').slice(-2)
  const waterDiff = lastWater.length === 2 ? ((lastWater[1].consumption - lastWater[0].consumption) / lastWater[0].consumption) * 100 : null
  const gasDiff   = lastGas.length   === 2 ? ((lastGas[1].consumption   - lastGas[0].consumption)   / lastGas[0].consumption)   * 100 : null

  const lastMonth = barData[barData.length - 1]

  return (
    <SubViewShell title="Meu Consumo" onClose={onClose}>

      {/* KPI cards */}
      <div className="consumo-kpi-grid">
        {[
          { label: 'Total Água', value: fmt(totalW), sub: fmtM3(totalC),  color: 'var(--water)', bg: 'var(--water-light)', Icon: Droplets },
          { label: 'Total Gás',  value: fmt(totalG), sub: fmtM3(totalGC), color: 'var(--gas)',   bg: 'var(--gas-light)',   Icon: Flame   },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="card" style={{ padding: isMobile ? '13px 12px' : '16px' }}>
            <div className="consumo-kpi-card-header">
              <div className="consumo-kpi-card-icon" style={{ background: bg }}>
                <Icon size={13} color={color} />
              </div>
              <span className="consumo-kpi-card-label">{label}</span>
            </div>
            <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color, fontFamily: 'DM Mono, monospace' }}>{value}</div>
            <div className="consumo-kpi-card-sub">{sub} consumidos</div>
          </div>
        ))}
      </div>

      {/* Comparativo */}
      {(waterDiff !== null || gasDiff !== null) && (
        <div className="card consumo-comparativo">
          <div className="consumo-comparativo-title">Comparativo com mês anterior</div>
          <div className="consumo-comparativo-list">
            {[{ label: 'Água', diff: waterDiff }, { label: 'Gás', diff: gasDiff }]
              .filter(x => x.diff !== null)
              .map(({ label, diff }) => {
                const up  = diff! > 0
                const pct = Math.abs(diff!).toFixed(1)
                return (
                  <div key={label} className="consumo-comparativo-row">
                    <span className="consumo-comparativo-label">{label}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: up ? '#dc2626' : '#16a34a',
                      background: up ? '#fef2f2' : '#f0fdf4',
                      borderRadius: 6, padding: '4px 11px',
                    }}>
                      {up ? '▲' : '▼'} {pct}%
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Gráfico */}
      {barData.length > 0 && (
        <div className="card consumo-chart-card" style={{ padding: isMobile ? '14px 10px 10px' : '18px 16px 12px' }}>
          <div className="consumo-chart-header">
            <span className="consumo-chart-title">Histórico mensal</span>
            <div className="consumo-chart-legend">
              {[{ color: 'var(--water)', label: 'Água' }, { color: 'var(--gas)', label: 'Gás' }].map(({ color, label }) => (
                <div key={label} className="consumo-chart-legend-item">
                  <div className="consumo-chart-legend-dot" style={{ background: color }} />
                  <span className="consumo-chart-legend-label">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barSize={14} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-3, #1e293b)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v}`} />
              <Tooltip content={<ConsumoTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
              <Bar dataKey="agua" name="Água" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="gas"  name="Gás"  stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {lastMonth && (
            <div className="consumo-chart-footer">
              <span className="consumo-chart-footer-label">Mês atual ({lastMonth.label})</span>
              <span className="consumo-chart-footer-value">{fmt(lastMonth.agua + lastMonth.gas)}</span>
            </div>
          )}
        </div>
      )}

      {readings.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <BarChart2 size={34} className="consumo-empty-icon" />
          <div className="consumo-empty-text">Nenhum dado ainda</div>
        </div>
      )}
    </SubViewShell>
  )
}

// ── SobreView ─────────────────────────────────────────────────────────────────
function SobreView({ condoName, condoInfo, onClose }: { condoName: string; condoInfo?: CondoInfo; onClose: () => void }) {
  const info      = condoInfo
  const addr      = info?.address || null
  const hasCoords = info?.latitude != null && info?.longitude != null
  const mapsQuery = hasCoords
    ? `${info!.latitude},${info!.longitude}`
    : addr ? encodeURIComponent(addr) : null
  const mapsLink  = mapsQuery ? `https://www.google.com/maps?q=${mapsQuery}` : null
  const iframeSrc = mapsQuery ? `https://maps.google.com/maps?q=${mapsQuery}&z=17&output=embed` : null

  return (
    <SubViewShell title="Sobre o Condomínio" onClose={onClose}>
      <div className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div className="sobre-condo-header">
          <div className="sobre-condo-icon">
            <Building2 size={22} color="var(--water)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="sobre-condo-name">{condoName}</div>
            {info?.address && <div className="sobre-condo-address">{info.address}</div>}
          </div>
        </div>
        <div className="sobre-condo-info-list">
          {info?.managerName  && <InfoRow icon={<User  size={14} />} label="Síndico" value={info.managerName} />}
          {info?.managerPhone && (
            <InfoRow
              icon={<Phone size={14} />} label="Contato" value={info.managerPhone}
              href={`https://wa.me/55${info.managerPhone.replace(/\D/g,'')}`} linkLabel="WhatsApp"
            />
          )}
          {info?.address && <InfoRow icon={<MapPin size={14} />} label="Endereço" value={info.address} />}
        </div>
      </div>

      {mapsLink && iframeSrc && (
        <div className="card sobre-map-card">
          <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="sobre-map-anchor">
            <div className="sobre-map-frame-wrap">
              <iframe
                title="Localização"
                src={iframeSrc}
                className="sobre-map-iframe"
                loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="sobre-map-overlay" />
            </div>
            <div className="sobre-map-footer">
              <div className="sobre-map-footer-min">
                <div className="sobre-map-footer-title">Ver no mapa</div>
                <div className="sobre-map-footer-addr">{addr}</div>
              </div>
              <div className="sobre-map-open-btn">Abrir →</div>
            </div>
          </a>
        </div>
      )}
    </SubViewShell>
  )
}

function InfoRow({ icon, label, value, href, linkLabel }: {
  icon: React.ReactNode; label: string; value: string; href?: string; linkLabel?: string
}) {
  return (
    <div className="info-row">
      <span className="info-row-icon">{icon}</span>
      <div className="info-row-body">
        <div className="info-row-label">{label}</div>
        <div className="info-row-value">{value}</div>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="info-row-link">
          {linkLabel}
        </a>
      )}
    </div>
  )
}

// ── MonthCard ─────────────────────────────────────────────────────────────────
function MonthCard({ month, year, readings }: { month: number; year: number; readings: PublicReading[] }) {
  const [open, setOpen] = useState(true)
  const w        = useWindowWidth()
  const isMobile = w < 480
  const water    = readings.find(r => r.type === 'water')
  const gas      = readings.find(r => r.type === 'gas')
  const total    = readings.reduce((s, r) => s + r.totalCost, 0)

  return (
    <div className="card month-card">
      <button
        onClick={() => setOpen(v => !v)}
        className="month-card-toggle-btn"
        style={{ padding: isMobile ? '14px 14px' : '13px 16px' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="month-card-title">{MONTHS[month - 1]}</span>
          <span className="month-card-badges">
            {water && <span className="month-card-badge-water">Água</span>}
            {gas   && <span className="month-card-badge-gas">Gás</span>}
          </span>
        </div>
        <span className="month-card-total">{fmt(total)}</span>
        <ChevronDown size={15} color="var(--text-3)" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div className="month-card-content" style={{ padding: isMobile ? '8px 10px 12px' : '10px 12px 12px' }}>
          {readings.map(r => {
            const isWater   = r.type === 'water'
            const color     = isWater ? 'var(--water)' : 'var(--gas)'
            const bgIcon    = isWater ? 'var(--water-light)' : 'var(--gas-light)'
            const Icon      = isWater ? Droplets : Flame
            const hasMeters = r.startValue != null && r.endValue != null
            return (
              <div key={r.id} className="month-card-reading-item" style={{ padding: isMobile ? '11px 12px' : '12px 14px' }}>
                <div className="month-card-reading-header">
                  <div className="month-card-reading-icon" style={{ width: 34, height: 34, background: bgIcon }}>
                    <Icon size={15} color={color} />
                  </div>
                  <div className="month-card-reading-body">
                    <div className="month-card-reading-type">{isWater ? 'Água' : 'Gás'}</div>
                    <div className="month-card-reading-sub">{fmtM3(r.consumption)} consumidos</div>
                  </div>
                  <div className="month-card-reading-cost" style={{ color }}>{fmt(r.totalCost)}</div>
                </div>
                {hasMeters && (
                  <div className="month-card-meter-section" style={{ marginTop: 9, paddingTop: 9 }}>
                    <div className="month-card-meter-label">Medidor</div>
                    <div className="month-card-meter-values">
                      <span className="month-card-meter-value">{fmtM3(r.startValue!)}</span>
                      <ArrowRight size={11} color="var(--text-3)" />
                      <span className="month-card-meter-value">{fmtM3(r.endValue!)}</span>
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

// ── YearSection ───────────────────────────────────────────────────────────────
function YearSection({ year, months }: { year: string; months: Record<string, PublicReading[]> }) {
  const [open, setOpen] = useState(true)
  const yearTotal = Object.values(months).flat().reduce((s, r) => s + r.totalCost, 0)
  const monthKeys = Object.keys(months).map(Number).sort((a, b) => b - a)

  return (
    <div className="year-section">
      <button onClick={() => setOpen(v => !v)} className="year-section-toggle-btn">
        <span className="year-section-label">{year}</span>
        <div className="year-section-line" />
        <span className="year-section-total">{fmt(yearTotal)}</span>
        <ChevronDown size={13} color="var(--text-3)" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {open && monthKeys.map(m => (
        <MonthCard key={m} month={m} year={Number(year)} readings={months[String(m)]} />
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function ApartmentPublicView() {
  const { token } = useParams<{ token: string }>()
  const w         = useWindowWidth()
  const isMobile  = w < 480
  const isSmall   = w < 360
  const isDesktop = w >= 768

  const wrapperRef = useRef<HTMLDivElement>(null)

  const [status,       setStatus]       = useState<Status>('loading')
  const [data,         setData]         = useState<PublicData | null>(null)
  const [condoName,    setCondoName]    = useState<string>('Condomínio')
  const [password,     setPassword]     = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [passError,    setPassError]    = useState('')
  const [authLoading,  setAuthLoading]  = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [subView,      setSubView]      = useState<SubView>(null)

  const { darkMode, setDarkMode, fontSize, setFontSize } = useResidentPrefs(wrapperRef)

  async function fetchDataFromFunction(tok: string, pwd: string) {
    const fn = httpsCallable<{ token: string; password: string }, PublicData & { _firebaseToken?: string }>(functions, 'getPublicApartment')
    const result = await fn({ token: tok, password: pwd })
    const { _firebaseToken, ...safeData } = result.data as any
    if (_firebaseToken) {
      try { await signInWithCustomToken(residentAuth, _firebaseToken) } catch (_e) { /* silent */ }
    }
    setData(safeData as PublicData)
    setStatus('found')
  }

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    get(ref(residentDb, 'config'))
      .then(s => { if (s.exists()) setCondoName(s.val().condominiumName ?? 'Condomínio') })
      .catch(() => {})
    fetchDataFromFunction(token, '').catch((err: any) => {
      const code = err?.code ?? ''
      if (code === 'functions/unauthenticated') setStatus('auth')
      else setStatus('invalid')
    })
  }, [token])

  const handleAuth = async () => {
    if (!token) return
    setAuthLoading(true); setPassError('')
    try { await fetchDataFromFunction(token, password) }
    catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'functions/unauthenticated')  setPassError('Senha incorreta. Verifique com o síndico.')
      else if (code === 'functions/not-found')   setStatus('invalid')
      else                                        setPassError('Erro ao verificar. Tente novamente.')
    } finally { setAuthLoading(false) }
  }

  const readings   = (data?.readings ?? []).sort((a, b) => b.year - a.year || b.month - a.month)
  const grouped: GroupedReadings = readings.reduce<GroupedReadings>((acc, r) => {
    const y = String(r.year); const m = String(r.month)
    if (!acc[y]) acc[y] = {}
    if (!acc[y][m]) acc[y][m] = []
    acc[y][m].push(r)
    return acc
  }, {})
  const yearKeys   = Object.keys(grouped).sort((a, b) => Number(b) - Number(a))
  const totalWater = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.totalCost, 0)
  const totalGas   = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.totalCost, 0)

  const Header = ({ showSettingsBtn = false }: { showSettingsBtn?: boolean }) => (
    <header className="public-header">
      <div className="public-header-inner">
        <div className="public-header-logo">
          <Droplets size={16} color="white" />
        </div>
        <div className="public-header-text">
          <div className="public-header-title">HidroGás</div>
          <div className="public-header-condo">{condoName}</div>
        </div>
        <div className="public-header-settings-wrap">
          {showSettingsBtn && (
            <>
              <button
                onClick={() => setShowSettings(v => !v)}
                className="public-header-settings-btn"
                style={{
                  background: showSettings ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)',
                }}
              >
                <Settings size={17} style={{ transition: 'transform 0.4s', transform: showSettings ? 'rotate(60deg)' : 'none' }} />
              </button>
              {showSettings && (
                <SettingsPanel
                  onClose={() => setShowSettings(false)}
                  darkMode={darkMode} setDarkMode={setDarkMode}
                  fontSize={fontSize} setFontSize={setFontSize}
                  onOpenSubView={setSubView}
                />
              )}
            </>
          )}
        </div>
      </div>
    </header>
  )

  // Sub-views
  if (subView === 'consumo') return <div ref={wrapperRef} data-theme={darkMode ? 'ocean-dark' : 'ocean-light'} style={{ width: '100%', minHeight: '100vh', background: 'var(--bg)' }} className={fontSize === 'large' ? 'resident-large' : ''}><ConsumoView readings={data?.readings ?? []} onClose={() => setSubView(null)} /></div>
  if (subView === 'sobre')   return <div ref={wrapperRef} data-theme={darkMode ? 'ocean-dark' : 'ocean-light'} style={{ width: '100%', minHeight: '100vh', background: 'var(--bg)' }} className={fontSize === 'large' ? 'resident-large' : ''}><SobreView condoName={condoName} condoInfo={data?.condoInfo} onClose={() => setSubView(null)} /></div>

  if (status === 'loading') return (
    <div ref={wrapperRef} data-theme={darkMode ? 'ocean-dark' : 'ocean-light'} className="public-screen">
      <Header />
      <div className="public-screen-center">
        <div className="public-loading-inner">
          <div className="public-loading-spinner" />
          <p className="public-loading-text">Carregando...</p>
        </div>
      </div>
    </div>
  )

  if (status === 'invalid') return (
    <div ref={wrapperRef} data-theme={darkMode ? 'ocean-dark' : 'ocean-light'} className="public-screen">
      <Header />
      <div className="public-screen-center" style={{ padding: 20 }}>
        <div className="public-invalid-inner">
          <div className="public-invalid-icon">
            <AlertCircle size={28} color="#dc2626" />
          </div>
          <h2 className="public-invalid-title">Link inválido</h2>
          <p className="public-invalid-text">Este link não corresponde a nenhum apartamento cadastrado.</p>
        </div>
      </div>
    </div>
  )

  if (status === 'auth') return (
    <div ref={wrapperRef} data-theme={darkMode ? 'ocean-dark' : 'ocean-light'} className="public-screen">
      <Header />
      <div className="public-auth-wrap">
        <div className="public-auth-inner" >
          <div className="public-auth-logo-wrap">
            <div className="public-auth-logo">
              <Building2 size={28} color="var(--water)" />
            </div>
            <h2 className="public-auth-title">Área do Morador</h2>
            <p className="public-auth-sub">Digite a senha para acessar seu histórico</p>
          </div>
          <div className="card public-auth-card">
            <label className="public-auth-label">Senha de acesso</label>
            <div
              className="public-auth-input-wrap"
              style={{ border: `1px solid ${passError ? '#dc2626' : 'var(--border)'}`, marginBottom: passError ? 10 : 16 }}
            >
              <KeyRound size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setPassError('') }}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                placeholder="••••••••"
                className="public-auth-input"
                autoFocus disabled={authLoading}
              />
              <button onClick={() => setShowPass(v => !v)} className="public-auth-eye-btn">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passError && (
              <div className="public-auth-error">
                <AlertCircle size={13} />{passError}
              </div>
            )}
            <button
              onClick={handleAuth} disabled={authLoading}
              className="public-auth-submit"
              style={{ opacity: authLoading ? 0.7 : 1 }}
            >
              {authLoading ? 'Verificando...' : 'Acessar'}
            </button>
            <p className="public-auth-footer">
              A senha é fornecida pelo síndico do condomínio.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Main content ──
  const hPad = isSmall ? '12px' : isMobile ? '14px' : '16px'

  return (
    <div ref={wrapperRef} data-theme={darkMode ? 'ocean-dark' : 'ocean-light'} className={`public-main${fontSize === 'large' ? ' resident-large' : ''}`}>
      <Header showSettingsBtn />
      <div className="public-main-inner" style={{ padding: `14px ${hPad} 64px` }}>

        {/* Apt header */}
        <div className="card public-apt-card" style={{ padding: isMobile ? '13px 14px' : '16px 20px' }}>
          <div className="public-apt-card-icon" style={{ width: 42, height: 42 }}>
            <Building2 size={19} color="var(--water)" />
          </div>
          <div className="public-apt-card-info">
            <h1 className="public-apt-card-title" style={{ fontSize: isMobile ? 16 : 18 }}>
              Apt {data!.number}{data!.block ? ` — Bloco ${data!.block}` : ''}
            </h1>
            {data!.responsible && (
              <p className="public-apt-card-responsible">{data!.responsible}</p>
            )}
          </div>
        </div>

        {/* KPI grid */}
        {readings.length > 0 && (
          <div className="public-kpi-grid" style={{ gap: isMobile ? 7 : 10 }}>
            {[
              { label: isMobile ? 'Água'  : 'Total Água',  value: fmt(totalWater),            color: 'var(--water)', Icon: Droplets,   bg: 'var(--water-light)' },
              { label: isMobile ? 'Gás'   : 'Total Gás',   value: fmt(totalGas),              color: 'var(--gas)',   Icon: Flame,      bg: 'var(--gas-light)'   },
              { label: isMobile ? 'Total' : 'Total Geral', value: fmt(totalWater + totalGas), color: '#7c3aed',      Icon: TrendingUp, bg: 'rgba(124,58,237,0.1)' },
            ].map(({ label, value, color, Icon, bg }) => (
              <div key={label} className="card" style={{ padding: isSmall ? '9px 7px' : isMobile ? '10px 9px' : '12px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <div
                    className="public-kpi-card-icon-wrap"
                    style={{ width: isSmall ? 18 : 22, height: isSmall ? 18 : 22, background: bg }}
                  >
                    <Icon size={isSmall ? 9 : 11} color={color} />
                  </div>
                  <span style={{ fontSize: isSmall ? 8 : 9, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
                </div>
                <div style={{ fontSize: isSmall ? 10 : isMobile ? 11 : 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace', wordBreak: 'break-all', lineHeight: 1.2 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        <h2 className="public-readings-section-title">Histórico de Leituras</h2>

        {readings.length === 0 ? (
          <div className="card public-readings-empty">
            <TrendingUp size={34} className="public-readings-empty-icon" />
            <div className="public-readings-empty-title">Nenhuma leitura registrada</div>
            <div className="public-readings-empty-sub">As leituras fechadas aparecerão aqui</div>
          </div>
        ) : yearKeys.map(year => (
          <YearSection key={year} year={year} months={grouped[year]} />
        ))}

      </div>
    </div>
  )
}
