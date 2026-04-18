import { useEffect, useState, useRef, useCallback }  from 'react'
import { useParams }                    from 'react-router-dom'
import { Droplets, Flame, Building2, AlertCircle, TrendingUp, KeyRound, Eye, EyeOff, ArrowRight, ChevronDown, Settings, Moon, Sun, Type, BarChart2, Info, Phone, MapPin, User, X, ChevronLeft } from 'lucide-react'
import { httpsCallable }                from 'firebase/functions'
import { get, ref }                     from 'firebase/database'
import { signInWithCustomToken }        from 'firebase/auth'
import { residentAuth, residentFunctions, residentDb } from '../infrastructure/firebase/residentApp'

const functions = residentFunctions

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const fmt    = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const fmtM3  = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m³`

type Status    = 'loading' | 'invalid' | 'auth' | 'found'
type SubView   = null | 'consumo' | 'sobre'

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

interface CondoInfo {
  name?:         string | null
  managerName?:  string | null
  managerPhone?: string | null
  address?:      string | null
}

interface PublicData {
  number:       string
  block?:       string | null
  responsible?: string | null
  readings:     PublicReading[]
  condoInfo?:   CondoInfo
  updatedAt:    number
}

type GroupedReadings = Record<string, Record<string, PublicReading[]>>

// ── Prefs ─────────────────────────────────────────────────────────────────────
function useResidentPrefs() {
  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    try { const s = localStorage.getItem('hidrogas-resident-dark'); if (s !== null) return s === 'true' } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })
  const [fontSize, setFontSizeState] = useState<'normal' | 'large'>(() => {
    try { return (localStorage.getItem('hidrogas-resident-font') as any) ?? 'normal' } catch { return 'normal' }
  })

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.setAttribute('data-theme', 'dark')
    else root.removeAttribute('data-theme')
    try { localStorage.setItem('hidrogas-resident-dark', String(darkMode)) } catch {}
  }, [darkMode])

  useEffect(() => {
    if (fontSize === 'large') document.body.classList.add('resident-large')
    else document.body.classList.remove('resident-large')
    try { localStorage.setItem('hidrogas-resident-font', fontSize) } catch {}
    return () => document.body.classList.remove('resident-large')
  }, [fontSize])

  return { darkMode, setDarkMode: setDarkModeState, fontSize, setFontSize: setFontSizeState }
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: on ? 'var(--water)' : 'var(--surface-4)',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', display: 'block',
      }} />
    </button>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({
  onClose, darkMode, setDarkMode, fontSize, setFontSize, onOpenSubView,
}: {
  onClose: () => void
  darkMode: boolean
  setDarkMode: (v: boolean) => void
  fontSize: 'normal' | 'large'
  setFontSize: (v: 'normal' | 'large') => void
  onOpenSubView: (v: SubView) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const Row = ({ icon, label, control, onClick }: { icon: React.ReactNode; label: string; control?: React.ReactNode; onClick?: () => void }) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)')}
      onMouseLeave={e => onClick && ((e.currentTarget as HTMLDivElement).style.background = '')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--text-3)' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
      </div>
      {control ?? (onClick && <ChevronDown size={13} color="var(--text-3)" style={{ transform: 'rotate(-90deg)' }} />)}
    </div>
  )

  return (
    <div ref={panelRef} style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      width: 270, background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      zIndex: 200, overflow: 'hidden',
    }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Menu
        </span>
      </div>

      <Row icon={<BarChart2 size={15} />} label="Meu consumo" onClick={() => { onOpenSubView('consumo'); onClose() }} />
      <Row icon={<Info size={15} />}      label="Sobre o condomínio" onClick={() => { onOpenSubView('sobre'); onClose() }} />

      <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <div style={{ padding: '4px 16px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Preferências
        </div>
        <Row
          icon={darkMode ? <Moon size={15} /> : <Sun size={15} />}
          label={darkMode ? 'Modo escuro' : 'Modo claro'}
          control={<Toggle on={darkMode} onToggle={() => setDarkMode(!darkMode)} />}
        />
        <Row
          icon={<Type size={15} />}
          label="Texto grande"
          control={<Toggle on={fontSize === 'large'} onToggle={() => setFontSize(fontSize === 'large' ? 'normal' : 'large')} />}
        />
      </div>

      <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)' }}>
        Salvo neste dispositivo
      </div>
    </div>
  )
}

// ── SubView Shell ─────────────────────────────────────────────────────────────
function SubViewShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 50, overflowY: 'auto', display: 'flex', flexDirection: 'column', fontSize: 'calc(1rem * var(--resident-scale, 1))' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--sidebar-bg)',
        borderBottom: '1px solid var(--sidebar-border)',
        height: 56, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
      }}>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
          color: 'white', borderRadius: 8, width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>{title}</span>
      </div>
      <div style={{ flex: 1, maxWidth: 680, width: '100%', margin: '0 auto', padding: '24px 16px 48px' }}>
        {children}
      </div>
    </div>
  )
}

// ── View: Meu Consumo ─────────────────────────────────────────────────────────
function ConsumoView({ readings, onClose }: { readings: PublicReading[]; onClose: () => void }) {
  const [tooltip, setTooltip] = useState<{ index: number; x: number; y: number } | null>(null)

  const sorted  = [...readings].sort((a, b) => a.year - b.year || a.month - b.month)
  const last12  = sorted.slice(-12)

  // Agrupa por mês/ano para o gráfico
  const barData = last12.reduce<{ label: string; water: number; gas: number }[]>((acc, r) => {
    const label = `${MONTHS[r.month - 1].slice(0, 3)}/${String(r.year).slice(2)}`
    const item  = acc.find(x => x.label === label) ?? { label, water: 0, gas: 0 }
    if (!acc.find(x => x.label === label)) acc.push(item)
    if (r.type === 'water') item.water += r.totalCost
    else item.gas += r.totalCost
    return acc
  }, [])

  const maxVal  = Math.max(...barData.map(d => d.water + d.gas), 1)
  const totalW  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.totalCost, 0)
  const totalG  = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.totalCost, 0)
  const totalC  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.consumption, 0)
  const totalGC = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.consumption, 0)

  // Comparativo com mês anterior
  const lastWater = sorted.filter(r => r.type === 'water').slice(-2)
  const lastGas   = sorted.filter(r => r.type === 'gas').slice(-2)
  const waterDiff = lastWater.length === 2 ? ((lastWater[1].consumption - lastWater[0].consumption) / lastWater[0].consumption) * 100 : null
  const gasDiff   = lastGas.length === 2   ? ((lastGas[1].consumption   - lastGas[0].consumption)   / lastGas[0].consumption)   * 100 : null

  const BAR_H = 140
  const yTicks = [0, 33, 66, 100]

  return (
    <SubViewShell title="Meu Consumo" onClose={onClose}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Água', value: fmt(totalW), sub: fmtM3(totalC), color: 'var(--water)', bg: 'var(--water-light)', Icon: Droplets },
          { label: 'Total Gás',  value: fmt(totalG), sub: fmtM3(totalGC), color: 'var(--gas)',   bg: 'var(--gas-light)',   Icon: Flame   },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color={color} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'DM Mono, monospace' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sub} consumidos</div>
          </div>
        ))}
      </div>

      {/* Comparativo mês anterior */}
      {(waterDiff !== null || gasDiff !== null) && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Comparativo com mês anterior
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Água', diff: waterDiff, color: 'var(--water)' },
              { label: 'Gás',  diff: gasDiff,   color: 'var(--gas)'   },
            ].filter(x => x.diff !== null).map(({ label, diff, color }) => {
              const up  = diff! > 0
              const pct = Math.abs(diff!).toFixed(1)
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: up ? '#dc2626' : '#16a34a',
                    background: up ? '#fef2f2' : '#f0fdf4',
                    borderRadius: 6, padding: '3px 10px',
                  }}>
                    {up ? '▲' : '▼'} {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Gráfico de barras */}
      {barData.length > 0 && (
        <div className="card" style={{ padding: '20px 16px 16px', marginBottom: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Histórico mensal</span>
            <div style={{ display: 'flex', gap: 14 }}>
              {[{ color: 'var(--water)', label: 'Água' }, { color: 'var(--gas)', label: 'Gás' }].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart area */}
          <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
            {/* Y axis */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: BAR_H + 22, width: 40, flexShrink: 0, paddingBottom: 22 }}>
              {[maxVal, maxVal * 0.66, maxVal * 0.33, 0].map((v, i) => (
                <span key={i} style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', textAlign: 'right', lineHeight: 1 }}>
                  {v > 0 ? `R$${v.toFixed(0)}` : '0'}
                </span>
              ))}
            </div>

            {/* Bars + grid */}
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              {/* Grid lines */}
              {yTicks.map(pct => (
                <div key={pct} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${(100 - pct) / 100 * BAR_H}px`,
                  borderTop: `1px ${pct === 0 ? 'solid' : 'dashed'} var(--border)`,
                  pointerEvents: 'none',
                }} />
              ))}

              {/* Bars */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: BAR_H + 22, paddingBottom: 22, position: 'relative' }}>
                {barData.map((d, i) => {
                  const total  = d.water + d.gas
                  const pct    = total / maxVal
                  const wH     = total > 0 ? Math.max(pct * BAR_H * (d.water / total), 2) : 0
                  const gH     = total > 0 ? Math.max(pct * BAR_H * (d.gas   / total), 2) : 0
                  const isLast = i === barData.length - 1
                  const isHov  = tooltip?.index === i

                  return (
                    <div
                      key={d.label}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, minWidth: 0, cursor: 'pointer', position: 'relative' }}
                      onMouseEnter={e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const parent = (e.currentTarget as HTMLElement).closest('.card')?.getBoundingClientRect()
                        setTooltip({ index: i, x: rect.left - (parent?.left ?? 0) + rect.width / 2, y: rect.top - (parent?.top ?? 0) - 8 })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onTouchStart={e => {
                        e.preventDefault()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const parent = (e.currentTarget as HTMLElement).closest('.card')?.getBoundingClientRect()
                        setTooltip(t => t?.index === i ? null : { index: i, x: rect.left - (parent?.left ?? 0) + rect.width / 2, y: rect.top - (parent?.top ?? 0) - 8 })
                      }}
                    >
                      {/* Bar */}
                      <div style={{
                        width: '80%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                        height: BAR_H, borderRadius: '5px 5px 0 0', overflow: 'hidden',
                        boxShadow: (isLast || isHov) ? '0 0 0 2px var(--water)' : 'none',
                        transition: 'box-shadow 0.15s',
                        opacity: isHov && tooltip !== null && tooltip.index !== i ? 0.5 : 1,
                      }}>
                        {wH > 0 && <div style={{ height: wH, background: 'var(--water)', opacity: isLast ? 1 : 0.6, transition: 'opacity 0.15s' }} />}
                        {gH > 0 && <div style={{ height: gH, background: 'var(--gas)',   opacity: isLast ? 1 : 0.6, transition: 'opacity 0.15s' }} />}
                        {total === 0 && <div style={{ height: 2, background: 'var(--border)' }} />}
                      </div>
                      {/* Label */}
                      <div style={{ marginTop: 5, fontSize: 9, color: isLast ? 'var(--text)' : 'var(--text-3)', fontWeight: isLast ? 700 : 400, whiteSpace: 'nowrap', textAlign: 'center', overflow: 'hidden', maxWidth: '100%' }}>
                        {d.label}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Tooltip */}
              {tooltip !== null && (() => {
                const d = barData[tooltip.index]
                const total = d.water + d.gas
                return (
                  <div style={{
                    position: 'absolute',
                    left: Math.min(Math.max(tooltip.x - 72, 0), 9999),
                    bottom: BAR_H + 22 - tooltip.y + 14,
                    width: 144,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
                    zIndex: 50,
                    pointerEvents: 'none',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {d.water > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--water)', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Água</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--water)', fontFamily: 'DM Mono, monospace' }}>{fmt(d.water)}</span>
                        </div>
                      )}
                      {d.gas > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gas)', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Gás</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gas)', fontFamily: 'DM Mono, monospace' }}>{fmt(d.gas)}</span>
                        </div>
                      )}
                      {total > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Total</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>{fmt(total)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Resumo do mês atual */}
          {barData.length > 0 && (() => {
            const last = barData[barData.length - 1]
            return (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Mês atual ({last.label})</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
                  {fmt(last.water + last.gas)}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {readings.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <BarChart2 size={34} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.2, color: 'var(--text-3)' }} />
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Nenhum dado ainda</div>
        </div>
      )}
    </SubViewShell>
  )
}
  const last12  = sorted.slice(-12)

  // Agrupa por mês/ano para o gráfico
  const barData = last12.reduce<{ label: string; water: number; gas: number }[]>((acc, r) => {
    const label = `${MONTHS[r.month - 1].slice(0, 3)}/${String(r.year).slice(2)}`
    const item  = acc.find(x => x.label === label) ?? { label, water: 0, gas: 0 }
    if (!acc.find(x => x.label === label)) acc.push(item)
    if (r.type === 'water') item.water += r.totalCost
    else item.gas += r.totalCost
    return acc
  }, [])

  const maxVal  = Math.max(...barData.map(d => d.water + d.gas), 1)
  const totalW  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.totalCost, 0)
  const totalG  = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.totalCost, 0)
  const totalC  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.consumption, 0)
  const totalGC = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.consumption, 0)

  // Comparativo com mês anterior
  const lastWater = sorted.filter(r => r.type === 'water').slice(-2)
  const lastGas   = sorted.filter(r => r.type === 'gas').slice(-2)
  const waterDiff = lastWater.length === 2 ? ((lastWater[1].consumption - lastWater[0].consumption) / lastWater[0].consumption) * 100 : null
  const gasDiff   = lastGas.length === 2   ? ((lastGas[1].consumption   - lastGas[0].consumption)   / lastGas[0].consumption)   * 100 : null

  return (
    <SubViewShell title="Meu Consumo" onClose={onClose}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Água', value: fmt(totalW), sub: fmtM3(totalC), color: 'var(--water)', bg: 'var(--water-light)', Icon: Droplets },
          { label: 'Total Gás',  value: fmt(totalG), sub: fmtM3(totalGC), color: 'var(--gas)',   bg: 'var(--gas-light)',   Icon: Flame   },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color={color} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'DM Mono, monospace' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sub} consumidos</div>
          </div>
        ))}
      </div>

      {/* Comparativo mês anterior */}
      {(waterDiff !== null || gasDiff !== null) && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Comparativo com mês anterior
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Água', diff: waterDiff, color: 'var(--water)' },
              { label: 'Gás',  diff: gasDiff,   color: 'var(--gas)'   },
            ].filter(x => x.diff !== null).map(({ label, diff, color }) => {
              const up  = diff! > 0
              const pct = Math.abs(diff!).toFixed(1)
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: up ? '#dc2626' : '#16a34a',
                    background: up ? '#fef2f2' : '#f0fdf4',
                    borderRadius: 6, padding: '3px 10px',
                  }}>
                    {up ? '▲' : '▼'} {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Gráfico de barras */}
      {barData.length > 0 && (
        <div className="card" style={{ padding: '20px 16px 16px', marginBottom: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Histórico mensal</span>
            <div style={{ display: 'flex', gap: 14 }}>
              {[{ color: 'var(--water)', label: 'Água' }, { color: 'var(--gas)', label: 'Gás' }].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Área do gráfico com eixo Y */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Eixo Y */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 22, width: 44, flexShrink: 0 }}>
              {[maxVal, maxVal * 0.66, maxVal * 0.33, 0].map((v, i) => (
                <span key={i} style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', textAlign: 'right', lineHeight: 1 }}>
                  {v > 0 ? `R$${v.toFixed(0)}` : '0'}
                </span>
              ))}
            </div>
            {/* Barras */}
            <div style={{ flex: 1, position: 'relative' }}>
              {/* Linhas de grade */}
              {[0, 33, 66, 100].map(pct => (
                <div key={pct} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${100 - pct}%`,
                  borderTop: `1px ${pct === 0 ? 'solid' : 'dashed'} var(--border)`,
                  pointerEvents: 'none', bottom: pct === 0 ? 22 : undefined,
                }} />
              ))}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, paddingBottom: 22 }}>
                {barData.map((d, i) => {
                  const total  = d.water + d.gas
                  const pct    = total / maxVal
                  const BAR_H  = 138
                  const wH     = total > 0 ? Math.max(pct * BAR_H * (d.water / total), 2) : 0
                  const gH     = total > 0 ? Math.max(pct * BAR_H * (d.gas   / total), 2) : 0
                  const isLast = i === barData.length - 1
                  return (
                    <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, minWidth: 0 }}>
                      {/* Barra */}
                      <div style={{
                        width: '72%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                        height: BAR_H, borderRadius: '6px 6px 0 0', overflow: 'hidden',
                        boxShadow: isLast ? '0 0 0 2px var(--water)' : 'none',
                      }}>
                        {wH > 0 && <div style={{ height: wH, background: 'var(--water)', opacity: isLast ? 1 : 0.55 }} />}
                        {gH > 0 && <div style={{ height: gH, background: 'var(--gas)',   opacity: isLast ? 1 : 0.55 }} />}
                        {total === 0 && <div style={{ height: 2, background: 'var(--border)' }} />}
                      </div>
                      {/* Label */}
                      <div style={{ marginTop: 6, fontSize: 9, color: isLast ? 'var(--text)' : 'var(--text-3)', fontWeight: isLast ? 700 : 400, whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {d.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {/* Resumo do mês atual */}
          {barData.length > 0 && (() => {
            const last = barData[barData.length - 1]
            return (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Mês atual ({last.label})</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
                  {fmt(last.water + last.gas)}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {readings.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <BarChart2 size={34} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.2, color: 'var(--text-3)' }} />
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Nenhum dado ainda</div>
        </div>
      )}
    </SubViewShell>
  )
}

// ── View: Sobre o Condomínio ──────────────────────────────────────────────────
function SobreView({ condoName, condoInfo, onClose }: { condoName: string; condoInfo?: CondoInfo; onClose: () => void }) {
  const info = condoInfo

  const lat  = -26.763457
  const lng  = -48.674538
  const addr = info?.address || 'R. Orestes Figueiredo, 110, Balneário Piçarras - SC'

  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=600x300&scale=2&markers=color:blue%7C${lat},${lng}&key=`
  const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`

  return (
    <SubViewShell title="Sobre o Condomínio" onClose={onClose}>

      {/* Card principal */}
      <div className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, background: 'var(--water-light)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={24} color="var(--water)" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>{condoName}</div>
            {info?.address && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{info.address}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {info?.managerName && (
            <InfoRow icon={<User size={14} />} label="Síndico" value={info.managerName} />
          )}
          {info?.managerPhone && (
            <InfoRow
              icon={<Phone size={14} />}
              label="Contato"
              value={info.managerPhone}
              href={`https://wa.me/55${info.managerPhone.replace(/\D/g,'')}`}
              linkLabel="WhatsApp"
            />
          )}
          {info?.address && (
            <InfoRow icon={<MapPin size={14} />} label="Endereço" value={info.address} />
          )}
        </div>
      </div>

      {/* Mapa */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 14 }}>
        <a href={mapsLink} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{
            height: 180,
            background: 'var(--surface-2)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Google Maps embed — sem API key, sem limite para uso residencial */}
            <iframe
              title="Localização"
              src={`https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`}
              style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            {/* Overlay clicável */}
            <div style={{ position: 'absolute', inset: 0 }} />
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Ver no mapa</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{addr}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--water)', fontWeight: 600 }}>Abrir →</div>
          </div>
        </a>
      </div>

    </SubViewShell>
  )
}

function InfoRow({ icon, label, value, href, linkLabel }: { icon: React.ReactNode; label: string; value: string; href?: string; linkLabel?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-3)', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{value}</div>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 12, color: 'var(--water)', fontWeight: 600, textDecoration: 'none',
          background: 'var(--water-light)', borderRadius: 6, padding: '4px 10px', flexShrink: 0,
        }}>
          {linkLabel}
        </a>
      )}
    </div>
  )
}

// ── MonthCard ────────────────────────────────────────────────────────────────
function MonthCard({ month, year, readings }: { month: number; year: number; readings: PublicReading[] }) {
  const [open, setOpen] = useState(true)
  const water  = readings.find(r => r.type === 'water')
  const gas    = readings.find(r => r.type === 'gas')
  const total  = readings.reduce((s, r) => s + r.totalCost, 0)

  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 8 }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{MONTHS[month - 1]}</span>
          <span style={{ display: 'inline-flex', gap: 5, marginLeft: 10, verticalAlign: 'middle' }}>
            {water && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--water)', background: 'var(--water-light)', borderRadius: 20, padding: '2px 7px' }}>Água</span>}
            {gas   && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gas)',   background: 'var(--gas-light)',   borderRadius: 20, padding: '2px 7px' }}>Gás</span>}
          </span>
        </div>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{fmt(total)}</span>
        <ChevronDown size={15} color="var(--text-3)" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {readings.map(r => {
            const isWater   = r.type === 'water'
            const color     = isWater ? 'var(--water)' : 'var(--gas)'
            const bgIcon    = isWater ? 'var(--water-light)' : 'var(--gas-light)'
            const Icon      = isWater ? Droplets : Flame
            const hasMeters = r.startValue != null && r.endValue != null
            return (
              <div key={r.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, background: bgIcon, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{isWater ? 'Água' : 'Gás'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{fmtM3(r.consumption)} consumidos</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{fmt(r.totalCost)}</div>
                </div>
                {hasMeters && (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>Medidor</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {[r.startValue!, r.endValue!].map((val, i, arr) => (
                        <>
                          <span key={`val-${i}`} style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px' }}>
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
  const monthKeys = Object.keys(months).map(Number).sort((a, b) => b - a)

  return (
    <div style={{ marginBottom: 24 }}>
      <button onClick={() => setOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', marginBottom: 10, padding: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>{year}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{fmt(yearTotal)}</span>
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

  const [status,       setStatus]       = useState<Status>('loading')
  const [data,         setData]         = useState<PublicData | null>(null)
  const [condoName,    setCondoName]    = useState<string>('Condomínio')
  const [password,     setPassword]     = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [passError,    setPassError]    = useState('')
  const [authLoading,  setAuthLoading]  = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [subView,      setSubView]      = useState<SubView>(null)

  const { darkMode, setDarkMode, fontSize, setFontSize } = useResidentPrefs()

  async function fetchDataFromFunction(tok: string, pwd: string) {
    const fn = httpsCallable<{ token: string; password: string }, PublicData & { _firebaseToken?: string }>(functions, 'getPublicApartment')
    const result = await fn({ token: tok, password: pwd })
    const { _firebaseToken, ...safeData } = result.data as any
    if (_firebaseToken) {
      try { await signInWithCustomToken(residentAuth, _firebaseToken) } catch (e) { console.warn('signInWithCustomToken falhou:', e) }
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
    try {
      await fetchDataFromFunction(token, password)
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'functions/unauthenticated')  setPassError('Senha incorreta. Verifique com o síndico.')
      else if (code === 'functions/not-found')   setStatus('invalid')
      else                                        setPassError('Erro ao verificar. Tente novamente.')
    } finally { setAuthLoading(false) }
  }

  const readings = (data?.readings ?? []).sort((a, b) => b.year - a.year || b.month - a.month)
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

  const Header = () => (
    <header style={{ background: 'var(--sidebar-bg)', padding: '0 20px', borderBottom: '1px solid var(--sidebar-border)', height: 56, display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Droplets size={17} color="white" />
        </div>
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>HidroGás</div>
          <div style={{ color: 'var(--sidebar-text)', fontSize: 11, marginTop: 2 }}>{condoName}</div>
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button onClick={() => setShowSettings(v => !v)} title="Menu" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, background: showSettings ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', transition: 'background 0.15s' }}>
            <Settings size={16} style={{ transition: 'transform 0.4s', transform: showSettings ? 'rotate(60deg)' : 'none' }} />
          </button>
          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              darkMode={darkMode} setDarkMode={setDarkMode}
              fontSize={fontSize} setFontSize={setFontSize}
              onOpenSubView={setSubView}
            />
          )}
        </div>
      </div>
    </header>
  )

  // Sub-views
  if (subView === 'consumo') return <ConsumoView readings={data?.readings ?? []} onClose={() => setSubView(null)} />
  if (subView === 'sobre')   return <SobreView condoName={condoName} condoInfo={data?.condoInfo} onClose={() => setSubView(null)} />

  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: 'var(--water)', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 14 }}>Carregando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  )

  if (status === 'invalid') return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 60, height: 60, background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <AlertCircle size={28} color="#dc2626" />
          </div>
          <h2 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 18 }}>Link inválido</h2>
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 14, lineHeight: 1.5 }}>Este link não corresponde a nenhum apartamento cadastrado.</p>
        </div>
      </div>
    </div>
  )

  if (status === 'auth') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 60, height: 60, background: 'var(--water-light)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Building2 size={28} color="var(--water)" />
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>Área do Morador</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>Digite a senha para acessar seu histórico</p>
          </div>
          <div className="card" style={{ padding: 22 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Senha de acesso</label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: `1px solid ${passError ? '#dc2626' : 'var(--border)'}`, borderRadius: 8, padding: '0 12px', gap: 8, marginBottom: passError ? 10 : 16 }}>
              <KeyRound size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setPassError('') }}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                placeholder="••••••••"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', padding: '11px 0', fontSize: 15, fontFamily: 'DM Mono, monospace', letterSpacing: 2, color: 'var(--text)' }}
                autoFocus disabled={authLoading}
              />
              <button onClick={() => setShowPass(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-3)' }}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {passError && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, marginBottom: 14 }}><AlertCircle size={13} />{passError}</div>}
            <button onClick={handleAuth} disabled={authLoading} style={{ width: '100%', padding: '11px 0', background: 'var(--water)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 14, cursor: authLoading ? 'not-allowed' : 'pointer', opacity: authLoading ? 0.7 : 1 }}>
              {authLoading ? 'Verificando...' : 'Acessar'}
            </button>
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>A senha é fornecida pelo síndico do condomínio.</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontSize: 'calc(1rem * var(--resident-scale, 1))' }}>
      <Header />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px' }}>

        <div className="card" style={{ padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, background: 'var(--water-light)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={20} color="var(--water)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Apartamento {data!.number}{data!.block ? ` — Bloco ${data!.block}` : ''}
            </h1>
            {data!.responsible && <p style={{ margin: '3px 0 0', color: 'var(--text-2)', fontSize: 13 }}>Responsável: {data!.responsible}</p>}
          </div>
        </div>

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

        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Histórico de Leituras
        </h2>

        {readings.length === 0 ? (
          <div className="card" style={{ padding: 44, textAlign: 'center' }}>
            <TrendingUp size={34} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.2, color: 'var(--text-3)' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, fontSize: 14 }}>Nenhuma leitura registrada</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>As leituras fechadas aparecerão aqui</div>
          </div>
        ) : yearKeys.map(year => (
          <YearSection key={year} year={year} months={grouped[year]} />
        ))}
      </div>
    </div>
  )
}
