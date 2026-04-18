import { useEffect, useState, useRef, useCallback } from 'react'
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
    <button onClick={onToggle} aria-pressed={on} style={{
      width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
      background: on ? 'var(--water)' : 'var(--surface-4)',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      WebkitTapHighlightColor: 'transparent',
    }}>
      <span style={{
        position: 'absolute', top: 4, left: on ? 22 : 4,
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', display: 'block',
      }} />
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
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: isMobile ? '15px 18px' : '12px 16px',
      borderBottom: '1px solid var(--border)',
      cursor: onClick ? 'pointer' : 'default',
      WebkitTapHighlightColor: 'transparent',
    }}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)')}
      onMouseLeave={e => onClick && ((e.currentTarget as HTMLDivElement).style.background = '')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--text-3)' }}>{icon}</span>
        <span style={{ fontSize: isMobile ? 15 : 14, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
      </div>
      {control ?? (onClick && <ChevronDown size={13} color="var(--text-3)" style={{ transform: 'rotate(-90deg)' }} />)}
    </div>
  )

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <>
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 190, WebkitTapHighlightColor: 'transparent',
        }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          zIndex: 200, overflow: 'hidden',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.22)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 6px' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--surface-4)' }} />
          </div>
          <div style={{ padding: '4px 18px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Menu</span>
          </div>
          <Row icon={<BarChart2 size={17} />} label="Meu consumo" onClick={() => { onOpenSubView('consumo'); onClose() }} />
          <Row icon={<Info size={17} />} label="Sobre o condomínio" onClick={() => { onOpenSubView('sobre'); onClose() }} />
          <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <div style={{ padding: '4px 18px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preferências</div>
            <Row icon={darkMode ? <Moon size={17} /> : <Sun size={17} />} label={darkMode ? 'Modo escuro' : 'Modo claro'} control={<Toggle on={darkMode} onToggle={() => setDarkMode(!darkMode)} />} />
            <Row icon={<Type size={17} />} label="Texto grande" control={<Toggle on={fontSize === 'large'} onToggle={() => setFontSize(fontSize === 'large' ? 'normal' : 'large')} />} />
          </div>
          <div style={{ padding: '10px 18px 32px', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)' }}>
            Salvo neste dispositivo
          </div>
        </div>
      </>
    )
  }

  // Desktop: dropdown
  return (
    <div ref={panelRef} style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      width: 270, background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 200, overflow: 'hidden',
    }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Menu</span>
      </div>
      <Row icon={<BarChart2 size={15} />} label="Meu consumo" onClick={() => { onOpenSubView('consumo'); onClose() }} />
      <Row icon={<Info size={15} />} label="Sobre o condomínio" onClick={() => { onOpenSubView('sobre'); onClose() }} />
      <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <div style={{ padding: '4px 16px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preferências</div>
        <Row icon={darkMode ? <Moon size={15} /> : <Sun size={15} />} label={darkMode ? 'Modo escuro' : 'Modo claro'} control={<Toggle on={darkMode} onToggle={() => setDarkMode(!darkMode)} />} />
        <Row icon={<Type size={15} />} label="Texto grande" control={<Toggle on={fontSize === 'large'} onToggle={() => setFontSize(fontSize === 'large' ? 'normal' : 'large')} />} />
      </div>
      <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-2)' }}>Salvo neste dispositivo</div>
    </div>
  )
}

// ── SubView Shell ─────────────────────────────────────────────────────────────
function SubViewShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 50,
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
      fontSize: 'calc(1rem * var(--resident-scale, 1))',
      WebkitOverflowScrolling: 'touch',
    }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)',
        height: 56, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
      }}>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
          color: 'white', borderRadius: 9, width: 38, height: 38,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, WebkitTapHighlightColor: 'transparent',
        }}>
          <ChevronLeft size={20} />
        </button>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>{title}</span>
      </div>
      <div style={{ flex: 1, maxWidth: 680, width: '100%', margin: '0 auto', padding: '18px 14px 64px' }}>
        {children}
      </div>
    </div>
  )
}

// ── View: Meu Consumo ─────────────────────────────────────────────────────────
function ConsumoView({ readings, onClose }: { readings: PublicReading[]; onClose: () => void }) {
  const w        = useWindowWidth()
  const isMobile = w < 480
  const isSmall  = w < 360
  const [activeBar, setActiveBar] = useState<number | null>(null)

  const sorted = [...readings].sort((a, b) => a.year - b.year || a.month - b.month)
  const last12 = sorted.slice(-12)

  const barData = last12.reduce<{ label: string; shortLabel: string; water: number; gas: number }[]>((acc, r) => {
    const label      = `${MONTHS[r.month - 1].slice(0, 3)}/${String(r.year).slice(2)}`
    const shortLabel = `${String(r.month).padStart(2, '0')}/${String(r.year).slice(2)}`
    const item = acc.find(x => x.label === label) ?? (() => { const o = { label, shortLabel, water: 0, gas: 0 }; acc.push(o); return o })()
    if (r.type === 'water') item.water += r.totalCost; else item.gas += r.totalCost
    return acc
  }, [])

  const maxVal  = Math.max(...barData.map(d => d.water + d.gas), 1)
  const totalW  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.totalCost, 0)
  const totalG  = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.totalCost, 0)
  const totalC  = readings.filter(r => r.type === 'water').reduce((a, r) => a + r.consumption, 0)
  const totalGC = readings.filter(r => r.type === 'gas').reduce((a, r) => a + r.consumption, 0)

  const lastWater = sorted.filter(r => r.type === 'water').slice(-2)
  const lastGas   = sorted.filter(r => r.type === 'gas').slice(-2)
  const waterDiff = lastWater.length === 2 ? ((lastWater[1].consumption - lastWater[0].consumption) / lastWater[0].consumption) * 100 : null
  const gasDiff   = lastGas.length   === 2 ? ((lastGas[1].consumption   - lastGas[0].consumption)   / lastGas[0].consumption)   * 100 : null

  const BAR_H    = isMobile ? 116 : 148
  const LABEL_H  = 20
  const Y_AXIS_W = isSmall ? 32 : 40
  const activeData = activeBar !== null ? barData[activeBar] : null

  return (
    <SubViewShell title="Meu Consumo" onClose={onClose}>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Água', value: fmt(totalW), sub: fmtM3(totalC),  color: 'var(--water)', bg: 'var(--water-light)', Icon: Droplets },
          { label: 'Total Gás',  value: fmt(totalG), sub: fmtM3(totalGC), color: 'var(--gas)',   bg: 'var(--gas-light)',   Icon: Flame   },
        ].map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} className="card" style={{ padding: isMobile ? '13px 12px' : '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={13} color={color} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3 }}>{label}</span>
            </div>
            <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color, fontFamily: 'DM Mono, monospace' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sub} consumidos</div>
          </div>
        ))}
      </div>

      {/* Comparativo */}
      {(waterDiff !== null || gasDiff !== null) && (
        <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Comparativo com mês anterior
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[{ label: 'Água', diff: waterDiff }, { label: 'Gás', diff: gasDiff }]
              .filter(x => x.diff !== null)
              .map(({ label, diff }) => {
                const up  = diff! > 0
                const pct = Math.abs(diff!).toFixed(1)
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{label}</span>
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
        <div className="card" style={{ padding: isMobile ? '14px 10px 14px 12px' : '18px 16px 16px', marginBottom: 14 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Histórico mensal</span>
            <div style={{ display: 'flex', gap: 12 }}>
              {[{ color: 'var(--water)', label: 'Água' }, { color: 'var(--gas)', label: 'Gás' }].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {isMobile && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px', textAlign: 'center' }}>
              Toque em uma barra para ver detalhes
            </p>
          )}

          {/* Chart */}
          <div style={{ display: 'flex', gap: 4 }}>
            {/* Y axis */}
            <div style={{
              width: Y_AXIS_W, flexShrink: 0,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              height: BAR_H + LABEL_H, paddingBottom: LABEL_H,
            }}>
              {[maxVal, maxVal * 0.5, 0].map((v, i) => (
                <span key={i} style={{ fontSize: 8, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', textAlign: 'right', lineHeight: 1, display: 'block' }}>
                  {v > 0 ? `R$${v.toFixed(0)}` : '0'}
                </span>
              ))}
            </div>

            {/* Bars + grid */}
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              {/* Grid lines */}
              {[0, 50, 100].map(pct => (
                <div key={pct} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${(1 - pct / 100) * BAR_H}px`,
                  borderTop: `1px ${pct === 0 ? 'solid' : 'dashed'} var(--border)`,
                  pointerEvents: 'none', zIndex: 0,
                }} />
              ))}

              <div style={{ display: 'flex', alignItems: 'flex-end', height: BAR_H + LABEL_H, paddingBottom: LABEL_H, gap: 3, position: 'relative', zIndex: 1 }}>
                {barData.map((d, i) => {
                  const total    = d.water + d.gas
                  const pct      = total / maxVal
                  const wH       = total > 0 ? Math.max(pct * BAR_H * (d.water / total), 2) : 0
                  const gH       = total > 0 ? Math.max(pct * BAR_H * (d.gas   / total), 2) : 0
                  const isLast   = i === barData.length - 1
                  const isActive = activeBar === i
                  const dimmed   = activeBar !== null && !isActive

                  return (
                    <div
                      key={d.label}
                      onClick={() => setActiveBar(prev => prev === i ? null : i)}
                      onMouseEnter={() => { if (!isMobile) setActiveBar(i) }}
                      onMouseLeave={() => { if (!isMobile) setActiveBar(null) }}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                        minWidth: 0, cursor: 'pointer', position: 'relative',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div style={{
                        width: '78%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                        height: BAR_H, borderRadius: '4px 4px 0 0', overflow: 'hidden',
                        outline: (isLast || isActive) ? '2px solid var(--water)' : '2px solid transparent',
                        outlineOffset: 1,
                        opacity: dimmed ? 0.38 : 1,
                        transition: 'opacity 0.15s, outline-color 0.15s',
                      }}>
                        {wH > 0 && <div style={{ height: wH, background: 'var(--water)', opacity: isLast ? 1 : 0.7 }} />}
                        {gH > 0 && <div style={{ height: gH, background: 'var(--gas)',   opacity: isLast ? 1 : 0.7 }} />}
                        {total === 0 && <div style={{ height: 2, background: 'var(--border)' }} />}
                      </div>
                      <div style={{
                        fontSize: isSmall ? 7 : 8,
                        color: (isLast || isActive) ? 'var(--text)' : 'var(--text-3)',
                        fontWeight: (isLast || isActive) ? 700 : 400,
                        whiteSpace: 'nowrap', textAlign: 'center', overflow: 'hidden',
                        maxWidth: '100%', lineHeight: `${LABEL_H}px`, marginTop: 2,
                      }}>
                        {isMobile ? d.shortLabel : d.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Info panel — shown under chart when a bar is active */}
          {activeData !== null && (
            <div style={{
              marginTop: 10,
              padding: '11px 13px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {activeData.label}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {activeData.water > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--water)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Água</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--water)', fontFamily: 'DM Mono, monospace' }}>{fmt(activeData.water)}</span>
                  </div>
                )}
                {activeData.gas > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gas)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Gás</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gas)', fontFamily: 'DM Mono, monospace' }}>{fmt(activeData.gas)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Total</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
                    {fmt(activeData.water + activeData.gas)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Mês atual resumo */}
          {(() => {
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
  const info     = condoInfo
  const lat      = -26.763457
  const lng      = -48.674538
  const addr     = info?.address || 'R. Orestes Figueiredo, 110, Balneário Piçarras - SC'
  const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`

  return (
    <SubViewShell title="Sobre o Condomínio" onClose={onClose}>
      <div className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 50, height: 50, background: 'var(--water-light)', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={22} color="var(--water)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', wordBreak: 'break-word' }}>{condoName}</div>
            {info?.address && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, wordBreak: 'break-word' }}>{info.address}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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

      <div className="card" style={{ overflow: 'hidden', marginBottom: 14 }}>
        <a href={mapsLink} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{ height: 180, background: 'var(--surface-2)', position: 'relative', overflow: 'hidden' }}>
            <iframe
              title="Localização"
              src={`https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`}
              style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
              loading="lazy" referrerPolicy="no-referrer-when-downgrade"
            />
            <div style={{ position: 'absolute', inset: 0 }} />
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Ver no mapa</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--water)', fontWeight: 600, flexShrink: 0 }}>Abrir →</div>
          </div>
        </a>
      </div>
    </SubViewShell>
  )
}

function InfoRow({ icon, label, value, href, linkLabel }: {
  icon: React.ReactNode; label: string; value: string; href?: string; linkLabel?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-3)', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 12, color: 'var(--water)', fontWeight: 600, textDecoration: 'none',
          background: 'var(--water-light)', borderRadius: 6, padding: '6px 12px',
          flexShrink: 0, WebkitTapHighlightColor: 'transparent',
        }}>
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
    <div className="card" style={{ overflow: 'hidden', marginBottom: 8 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        padding: isMobile ? '14px 14px' : '13px 16px',
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        WebkitTapHighlightColor: 'transparent', minHeight: 52,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{MONTHS[month - 1]}</span>
          <span style={{ display: 'inline-flex', gap: 4, marginLeft: 8, verticalAlign: 'middle' }}>
            {water && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--water)', background: 'var(--water-light)', borderRadius: 20, padding: '2px 7px' }}>Água</span>}
            {gas   && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gas)',   background: 'var(--gas-light)',   borderRadius: 20, padding: '2px 7px' }}>Gás</span>}
          </span>
        </div>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{fmt(total)}</span>
        <ChevronDown size={15} color="var(--text-3)" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: isMobile ? '8px 10px 12px' : '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {readings.map(r => {
            const isWater   = r.type === 'water'
            const color     = isWater ? 'var(--water)' : 'var(--gas)'
            const bgIcon    = isWater ? 'var(--water-light)' : 'var(--gas-light)'
            const Icon      = isWater ? Droplets : Flame
            const hasMeters = r.startValue != null && r.endValue != null
            return (
              <div key={r.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: isMobile ? '11px 12px' : '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, background: bgIcon, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{isWater ? 'Água' : 'Gás'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{fmtM3(r.consumption)} consumidos</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{fmt(r.totalCost)}</div>
                </div>
                {hasMeters && (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 7 }}>Medidor</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 9px' }}>
                        {fmtM3(r.startValue!)}
                      </span>
                      <ArrowRight size={11} color="var(--text-3)" />
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 9px' }}>
                        {fmtM3(r.endValue!)}
                      </span>
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
    <div style={{ marginBottom: 24 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left', marginBottom: 10, padding: '4px 0',
        WebkitTapHighlightColor: 'transparent', minHeight: 36,
      }}>
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
  const w        = useWindowWidth()
  const isMobile = w < 480
  const isSmall  = w < 360

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

  // Header defined outside JSX so it works for all status screens
  const Header = () => (
    <header style={{
      background: 'var(--sidebar-bg)', padding: '0 14px',
      borderBottom: '1px solid var(--sidebar-border)',
      height: 56, display: 'flex', alignItems: 'center',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Droplets size={16} color="white" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>HidroGás</div>
          <div style={{ color: 'var(--sidebar-text)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{condoName}</div>
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowSettings(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 10,
              background: showSettings ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', color: 'rgba(255,255,255,0.82)',
              WebkitTapHighlightColor: 'transparent',
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
        <div style={{ textAlign: 'center', maxWidth: 300 }}>
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
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 62, height: 62, background: 'var(--water-light)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Building2 size={28} color="var(--water)" />
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Área do Morador</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>Digite a senha para acessar seu histórico</p>
          </div>
          <div className="card" style={{ padding: isMobile ? '18px 16px' : 22 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Senha de acesso</label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: `1px solid ${passError ? '#dc2626' : 'var(--border)'}`, borderRadius: 10, padding: '0 12px', gap: 8, marginBottom: passError ? 10 : 16 }}>
              <KeyRound size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setPassError('') }}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                placeholder="••••••••"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', padding: '13px 0', fontSize: 16, fontFamily: 'DM Mono, monospace', letterSpacing: 2, color: 'var(--text)' }}
                autoFocus disabled={authLoading}
              />
              <button onClick={() => setShowPass(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', display: 'flex', color: 'var(--text-3)', WebkitTapHighlightColor: 'transparent' }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
                <AlertCircle size={13} />{passError}
              </div>
            )}
            <button
              onClick={handleAuth} disabled={authLoading}
              style={{ width: '100%', padding: '13px 0', background: 'var(--water)', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, fontSize: 15, cursor: authLoading ? 'not-allowed' : 'pointer', opacity: authLoading ? 0.7 : 1, WebkitTapHighlightColor: 'transparent' }}
            >
              {authLoading ? 'Verificando...' : 'Acessar'}
            </button>
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontSize: 'calc(1rem * var(--resident-scale, 1))' }}>
      <Header />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: `14px ${hPad} 64px` }}>

        {/* Apt header */}
        <div className="card" style={{ padding: isMobile ? '13px 14px' : '16px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, background: 'var(--water-light)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={19} color="var(--water)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Apt {data!.number}{data!.block ? ` — Bloco ${data!.block}` : ''}
            </h1>
            {data!.responsible && (
              <p style={{ margin: '3px 0 0', color: 'var(--text-2)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data!.responsible}
              </p>
            )}
          </div>
        </div>

        {/* KPI grid — always 3 cols, values shrink gracefully */}
        {readings.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? 7 : 10, marginBottom: 16 }}>
            {[
              { label: isMobile ? 'Água'  : 'Total Água',  value: fmt(totalWater),            color: 'var(--water)', Icon: Droplets,   bg: 'var(--water-light)' },
              { label: isMobile ? 'Gás'   : 'Total Gás',   value: fmt(totalGas),              color: 'var(--gas)',   Icon: Flame,      bg: 'var(--gas-light)'   },
              { label: isMobile ? 'Total' : 'Total Geral', value: fmt(totalWater + totalGas), color: '#7c3aed',      Icon: TrendingUp, bg: 'rgba(124,58,237,0.1)' },
            ].map(({ label, value, color, Icon, bg }) => (
              <div key={label} className="card" style={{ padding: isSmall ? '9px 7px' : isMobile ? '10px 9px' : '12px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <div style={{ width: isSmall ? 18 : 22, height: isSmall ? 18 : 22, borderRadius: 5, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={isSmall ? 9 : 11} color={color} />
                  </div>
                  <span style={{ fontSize: isSmall ? 8 : 9, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
                </div>
                <div style={{ fontSize: isSmall ? 10 : isMobile ? 11 : 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace', wordBreak: 'break-all', lineHeight: 1.2 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
