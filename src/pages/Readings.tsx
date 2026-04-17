import { useState, useMemo, useRef, useEffect }                    from 'react'
import { Plus, Droplets, Flame, CheckCircle, Clock, Trash2, Lock,
         Search, ChevronDown, Building2, Check, TrendingUp,
         LayoutGrid, List, Filter }                                from 'lucide-react'
import { useAppStore, useUIStore }                                 from '../store'
import { readingUseCases, readingRepo }                            from '../lib/container'
import { useToast }                                                from '../components/ui/Toast'
import { friendlyError }                                           from '../lib/friendlyError'
import { Modal }                                                   from '../components/ui/Modal'
import { ConfirmDialog }                                           from '../components/ui/ConfirmDialog'
import { MonthSelector }                                           from '../components/ui/MonthSelector'
import { ReadingsSkeleton, Spinner }                               from '../components/ui/Skeleton'
import type { Reading, UtilityType }                               from '../domain/entities'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─────────────────────────────────────────────
// ApartmentSelect (unchanged, keep working)
// ─────────────────────────────────────────────
interface Apartment {
  id: string
  number: string
  block?: string
  responsible?: string
}

interface ApartmentSelectProps {
  apartments: Apartment[]
  value: string
  onChange: (id: string) => void
  utilityType?: 'water' | 'gas'
}

function ApartmentSelect({ apartments, value, onChange, utilityType = 'water' }: ApartmentSelectProps) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef           = useRef<HTMLDivElement>(null)
  const searchRef         = useRef<HTMLInputElement>(null)

  const selected = apartments.find(a => a.id === value) ?? null

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
    else setQuery('')
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const grouped = useMemo(() => {
    const q = query.toLowerCase()
    const filtered = apartments.filter(
      a =>
        a.number.includes(q) ||
        (a.block ?? '').toLowerCase().includes(q) ||
        (a.responsible ?? '').toLowerCase().includes(q),
    )
    return filtered.reduce<Record<string, Apartment[]>>((acc, apt) => {
      const key = apt.block ? `Bloco ${apt.block}` : 'Sem bloco'
      ;(acc[key] = acc[key] ?? []).push(apt)
      return acc
    }, {})
  }, [apartments, query])

  const isWater  = utilityType === 'water'
  const accent   = isWater ? 'var(--water)' : 'var(--gas)'
  const accentBg = isWater ? 'var(--water-light)' : 'var(--gas-light)'

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface-2)',
          border: `1.5px solid ${open ? accent : 'var(--border)'}`,
          borderRadius: 10, cursor: 'pointer', textAlign: 'left',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: open ? `0 0 0 3px ${accentBg}` : 'none',
        }}
      >
        <span style={{
          width: 30, height: 30, borderRadius: 8,
          background: selected ? accentBg : 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'background 0.15s',
        }}>
          {selected
            ? isWater ? <Droplets size={14} color={accent} /> : <Flame size={14} color={accent} />
            : <Building2 size={14} color="var(--text-3)" />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {selected ? (
            <>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Ap. {selected.number}{selected.block ? ` — Bl. ${selected.block}` : ''}
              </span>
              {selected.responsible && (
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>
                  {selected.responsible}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Selecione um apartamento...</span>
          )}
        </span>
        <ChevronDown
          size={15} color="var(--text-3)"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por número, bloco ou responsável..."
                style={{
                  width: '100%', padding: '7px 10px 7px 30px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 7,
                  background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {Object.keys(grouped).length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                Nenhum apartamento encontrado
              </div>
            ) : (
              Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([blockLabel, apts]) => (
                  <div key={blockLabel}>
                    <div style={{
                      padding: '7px 14px 4px', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: 'var(--text-3)', background: 'var(--surface-2)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {blockLabel}
                    </div>
                    {apts.map(apt => {
                      const isSel = apt.id === value
                      return (
                        <button
                          key={apt.id}
                          type="button"
                          onClick={() => { onChange(apt.id); setOpen(false) }}
                          style={{
                            width: '100%', padding: '9px 14px',
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: isSel ? accentBg : 'transparent',
                            border: 'none', borderBottom: '1px solid var(--border)',
                            cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                          onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                        >
                          <span style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: isSel ? accentBg : 'var(--surface-2)',
                            border: `1px solid ${isSel ? accent : 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, fontSize: 12, fontWeight: 700,
                            color: isSel ? accent : 'var(--text-2)',
                          }}>
                            {apt.number}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: isSel ? accent : 'var(--text)' }}>
                              Ap. {apt.number}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                              {apt.responsible || 'Sem responsável'}
                            </span>
                          </span>
                          {isSel && <Check size={15} color={accent} style={{ flexShrink: 0 }} />}
                        </button>
                      )
                    })}
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ReadingRow — inline row for the apartment card
// ─────────────────────────────────────────────
interface ReadingRowProps {
  reading: Reading
  config: any
  onClose: (r: Reading) => void
  onDelete: (r: Reading) => void
}

function ReadingRow({ reading: r, config, onClose, onDelete }: ReadingRowProps) {
  const isWater  = r.type === 'water'
  const isClosed = !!r.closedAt
  const accent   = isWater ? 'var(--water)' : 'var(--gas)'
  const accentBg = isWater ? 'var(--water-light)' : 'var(--gas-light)'
  const fmt      = (v: number) => `R$ ${v.toFixed(2)}`

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: '0 12px',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: '1px solid var(--border)',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Type pill */}
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: accentBg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
      }}>
        {isWater
          ? <Droplets size={17} color={accent} />
          : <Flame size={17} color={accent} />}
      </div>

      {/* Middle: meters + cost */}
      <div style={{ minWidth: 0 }}>
        {/* Meter bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="font-mono-num" style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {r.startValue.toLocaleString('pt-BR')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>→</span>
          {r.endValue != null ? (
            <span className="font-mono-num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {r.endValue.toLocaleString('pt-BR')}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>aguardando</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>m³</span>

          {r.consumption != null && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '1px 7px', fontSize: 11, color: 'var(--text-2)',
            }}>
              <TrendingUp size={10} />
              <span className="font-mono-num">{r.consumption.toLocaleString('pt-BR')} m³</span>
            </span>
          )}
        </div>

        {/* Cost + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {r.totalCost != null ? (
            <span className="font-mono-num" style={{ fontSize: 15, fontWeight: 700, color: accent }}>
              {fmt(r.totalCost)}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Custo pendente</span>
          )}
          {isClosed
            ? <span className="badge badge-ok" style={{ fontSize: 11 }}><CheckCircle size={10} /> Fechada</span>
            : <span className="badge badge-open" style={{ fontSize: 11 }}><Clock size={10} /> Aberta</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {!isClosed && (
          <button
            onClick={() => onClose(r)}
            title="Fechar leitura"
            style={{
              background: accentBg, border: 'none', borderRadius: 8,
              padding: '7px 11px', cursor: 'pointer', fontSize: 12,
              color: accent, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'filter 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            <Lock size={12} />
            <span className="hide-on-mobile">Fechar</span>
          </button>
        )}
        <button
          onClick={() => onDelete(r)}
          title="Excluir"
          style={{
            background: 'none', border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 8, padding: '7px 9px', cursor: 'pointer',
            color: '#ef4444', display: 'flex', alignItems: 'center',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(220,38,38,0.08)'
            e.currentTarget.style.borderColor = 'rgba(220,38,38,0.55)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.borderColor = 'rgba(220,38,38,0.3)'
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ApartmentCard — groups readings by apartment
// ─────────────────────────────────────────────
interface ApartmentCardProps {
  apartment: Apartment
  readings: Reading[]
  config: any
  onClose: (r: Reading) => void
  onDelete: (r: Reading) => void
}

function ApartmentCard({ apartment: apt, readings, config, onClose, onDelete }: ApartmentCardProps) {
  const hasOpen   = readings.some(r => !r.closedAt)
  const totalCost = readings.reduce((s, r) => s + (r.totalCost ?? 0), 0)

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Card header */}
      <div style={{
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: 'var(--table-head)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13, color: 'var(--text)',
            fontFamily: 'DM Mono, monospace',
          }}>
            {apt.number}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', lineHeight: 1.2 }}>
              Ap. {apt.number}
              {apt.block && <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 6, fontSize: 13 }}>Bl. {apt.block}</span>}
            </div>
            {apt.responsible && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{apt.responsible}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasOpen && (
            <span className="badge badge-open" style={{ fontSize: 11 }}><Clock size={10} /> Pendente</span>
          )}
          {totalCost > 0 && (
            <span className="font-mono-num" style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              R$ {totalCost.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Readings rows */}
      <div>
        {readings.map(r => (
          <ReadingRow
            key={r.id}
            reading={r}
            config={config}
            onClose={onClose}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Readings page
// ─────────────────────────────────────────────
export function Readings() {
  const { apartments, readings, config } = useAppStore()
  const { selectedMonth, selectedYear }  = useUIStore()
  const { toast }                        = useToast()

  const [showOpen,  setShowOpen]  = useState(false)
  const [showClose, setShowClose] = useState<Reading | null>(null)
  const [deleting,  setDeleting]  = useState<Reading | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [openForm,  setOpenForm]  = useState({ apartmentId: '', type: 'water' as UtilityType, startValue: '' })
  const [endValue,  setEndValue]  = useState('')
  const [filterType, setFilterType] = useState<'all' | 'water' | 'gas'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed'>('all')

  const monthReadings = readings
    .filter(r => r.month === selectedMonth && r.year === selectedYear)
    .filter(r => filterType === 'all' || r.type === filterType)
    .filter(r => {
      if (filterStatus === 'open')   return !r.closedAt
      if (filterStatus === 'closed') return !!r.closedAt
      return true
    })
    .sort((a, b) => {
      const aa = apartments.find(x => x.id === a.apartmentId)?.number ?? ''
      const bb = apartments.find(x => x.id === b.apartmentId)?.number ?? ''
      return aa.localeCompare(bb, undefined, { numeric: true })
    })

  const grouped = useMemo(() => {
    const map = new Map<string, Reading[]>()
    for (const r of monthReadings) {
      const existing = map.get(r.apartmentId) ?? []
      map.set(r.apartmentId, [...existing, r])
    }
    return map
  }, [monthReadings])

  const apt = (id: string) => apartments.find(a => a.id === id)
  const fmt = (v: number) => `R$ ${v.toFixed(2)}`

  const totalWater = monthReadings.filter(r => r.type === 'water' && r.closedAt).reduce((s, r) => s + (r.totalCost ?? 0), 0)
  const totalGas   = monthReadings.filter(r => r.type === 'gas'   && r.closedAt).reduce((s, r) => s + (r.totalCost ?? 0), 0)
  const openCount  = monthReadings.filter(r => !r.closedAt).length

  const isLoading = config === null && apartments.length === 0 && readings.length === 0
  
  if (isLoading) return <ReadingsSkeleton />
         
  const handleOpen = async () => {
    if (!openForm.apartmentId) { toast('Selecione um apartamento', 'error'); return }
    if (!openForm.startValue)  { toast('Informe a leitura inicial', 'error'); return }
    setLoading(true)
    try {
      await readingUseCases.openReading(openForm.apartmentId, openForm.type, selectedMonth, selectedYear, parseFloat(openForm.startValue))
      toast('Leitura inicial registrada!')
      setShowOpen(false)
      setOpenForm({ apartmentId: '', type: 'water', startValue: '' })
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setLoading(false)
  }

  const handleClose = async () => {
    if (!showClose || !endValue) { toast('Informe a leitura final', 'error'); return }
    setLoading(true)
    try {
      await readingUseCases.closeReading(showClose.id, parseFloat(endValue))
      toast('Leitura fechada! Custo calculado.')
      setShowClose(null); setEndValue('')
    } catch (e: any) { toast(friendlyError(e), 'error') }
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await readingRepo.delete(deleting.id); toast('Leitura removida') }
    catch (e: any) { toast(friendlyError(e), 'error') }
    setDeleting(null)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Leituras</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 14 }}>{MONTHS[selectedMonth - 1]} {selectedYear}</p>
        </div>
        <div className="page-header-actions">
          <MonthSelector />
          <button className="btn-primary" onClick={() => setShowOpen(true)} disabled={apartments.length === 0}>
            <Plus size={16} /><span className="hide-on-mobile">Nova Leitura</span>
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {monthReadings.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Total água */}
          {totalWater > 0 && (
            <div className="card" style={{
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
              flex: 1, minWidth: 140,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--water-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Droplets size={16} color="var(--water)" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Total Água</div>
                <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 16, color: 'var(--water)' }}>
                  {fmt(totalWater)}
                </div>
              </div>
            </div>
          )}
          {/* Total gás */}
          {totalGas > 0 && (
            <div className="card" style={{
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
              flex: 1, minWidth: 140,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--gas-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Flame size={16} color="var(--gas)" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Total Gás</div>
                <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 16, color: 'var(--gas)' }}>
                  {fmt(totalGas)}
                </div>
              </div>
            </div>
          )}
          {/* Pendentes */}
          {openCount > 0 && (
            <div className="card" style={{
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
              flex: 1, minWidth: 140, cursor: 'pointer',
              borderColor: openCount > 0 ? 'var(--badge-open-text)' : 'var(--border)',
            }}
            onClick={() => setFilterStatus(s => s === 'open' ? 'all' : 'open')}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--badge-open-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={16} color="var(--badge-open-text)" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Pendentes</div>
                <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 16, color: 'var(--badge-open-text)' }}>
                  {openCount} leitura{openCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
        opacity: monthReadings.length === 0 ? 0.7 : 1, // opcional: dar um feedback visual
      }}>
        <Filter size={13} color="var(--text-3)" style={{ flexShrink: 0 }} />
      
        {/* Type filter */}
        {(['all', 'water', 'gas'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', border: 'none', transition: 'all 0.15s',
              background: filterType === t
                ? t === 'water' ? 'var(--water-light)'
                : t === 'gas'   ? 'var(--gas-light)'
                : 'var(--surface-3)'
                : 'var(--surface-2)',
              color: filterType === t
                ? t === 'water' ? 'var(--water)'
                : t === 'gas'   ? 'var(--gas)'
                : 'var(--text)'
                : 'var(--text-2)',
            }}
          >
            {t === 'all' ? 'Todos' : t === 'water' ? '💧 Água' : '🔥 Gás'}
          </button>
        ))}
      
        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
      
        {/* Status filter */}
        {(['all', 'open', 'closed'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', border: 'none', transition: 'all 0.15s',
              background: filterStatus === s
                ? s === 'open'   ? 'var(--badge-open-bg)'
                : s === 'closed' ? 'var(--badge-ok-bg)'
                : 'var(--surface-3)'
                : 'var(--surface-2)',
              color: filterStatus === s
                ? s === 'open'   ? 'var(--badge-open-text)'
                : s === 'closed' ? 'var(--badge-ok-text)'
                : 'var(--text)'
                : 'var(--text-2)',
            }}
          >
            {s === 'all' ? 'Todos' : s === 'open' ? 'Abertas' : 'Fechadas'}
          </button>
        ))}
      
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          {grouped.size} ap. · {monthReadings.length} leituras
        </span>
      </div>

      {/* Empty state */}
      {monthReadings.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Filter size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3, color: 'var(--text-3)' }} />
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-2)' }}>
            {readings.filter(r => r.month === selectedMonth && r.year === selectedYear).length > 0
              ? 'Nenhuma leitura com esses filtros'
              : 'Nenhuma leitura neste mês'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 16 }}>
            {readings.filter(r => r.month === selectedMonth && r.year === selectedYear).length > 0
              ? 'Tente ajustar os filtros acima'
              : 'Toque no + para registrar'}
          </div>
          {/* Botão para limpar filtros rapidamente (opcional) */}
          {filterType !== 'all' || filterStatus !== 'all' ? (
            <button 
              className="btn-secondary" 
              style={{ fontSize: 13 }}
              onClick={() => {
                setFilterType('all');
                setFilterStatus('all');
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from(grouped.entries()).map(([aptId, aptReadings]) => {
            const apartment = apt(aptId)
            if (!apartment) return null
            return (
              <ApartmentCard
                key={aptId}
                apartment={apartment}
                readings={aptReadings}
                config={config}
                onClose={r => { setShowClose(r); setEndValue('') }}
                onDelete={r => setDeleting(r)}
              />
            )
          })}
        </div>
      )}

      {/* Modal: nova leitura */}
      {showOpen && (
        <Modal title="Nova Leitura" onClose={() => setShowOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Apartamento *</label>
              <ApartmentSelect
                apartments={apartments}
                value={openForm.apartmentId}
                onChange={id => setOpenForm(f => ({ ...f, apartmentId: id }))}
                utilityType={openForm.type}
              />
            </div>
            <div>
              <label className="label">Tipo *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['water', 'gas'] as UtilityType[]).map(t => (
                  <button key={t} onClick={() => setOpenForm(f => ({ ...f, type: t }))}
                    style={{
                      flex: 1, padding: '12px 0',
                      border: `2px solid ${openForm.type === t ? (t === 'water' ? 'var(--water)' : 'var(--gas)') : 'var(--border)'}`,
                      borderRadius: 8,
                      background: openForm.type === t ? (t === 'water' ? 'var(--water-light)' : 'var(--gas-light)') : 'var(--surface-2)',
                      cursor: 'pointer', fontWeight: 600, fontSize: 14,
                      color: openForm.type === t ? (t === 'water' ? 'var(--water)' : 'var(--gas)') : 'var(--text-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all 0.15s',
                    }}>
                    {t === 'water' ? <Droplets size={16} /> : <Flame size={16} />}
                    {t === 'water' ? 'Água' : 'Gás'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Leitura inicial (m³) *</label>
              <input className="input" type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={openForm.startValue} onChange={e => setOpenForm(f => ({ ...f, startValue: e.target.value }))} />
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              Tarifa: <strong style={{ color: 'var(--text)' }}>R$ {openForm.type === 'water' ? config?.waterRate?.toFixed(4) : config?.gasRate?.toFixed(4)}/m³</strong>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleOpen} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {loading ? <><Spinner size={14} color="white" />Salvando...</> : 'Registrar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: fechar leitura */}
      {showClose && (
        <Modal title="Fechar Leitura" onClose={() => setShowClose(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Reading info */}
            <div style={{
              background: showClose.type === 'water' ? 'var(--water-light)' : 'var(--gas-light)',
              borderRadius: 10, padding: '14px 16px',
              border: `1px solid ${showClose.type === 'water' ? 'rgba(37,99,235,0.2)' : 'rgba(234,88,12,0.2)'}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}>
                {showClose.type === 'water'
                  ? <Droplets size={20} color="var(--water)" />
                  : <Flame size={20} color="var(--gas)" />}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
                  Ap. {apt(showClose.apartmentId)?.number} — {showClose.type === 'water' ? 'Água' : 'Gás'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                  Leitura inicial: <span className="font-mono-num" style={{ fontWeight: 600 }}>{showClose.startValue.toFixed(2)} m³</span>
                </div>
              </div>
            </div>

            <div>
              <label className="label">Leitura final (m³) *</label>
              <input className="input" type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={endValue} onChange={e => setEndValue(e.target.value)} autoFocus />
            </div>

            {endValue && parseFloat(endValue) >= showClose.startValue && (
              <div style={{
                background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px',
                border: '1px solid var(--border)', display: 'flex', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Consumo</div>
                  <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                    {(parseFloat(endValue) - showClose.startValue).toFixed(2)} m³
                  </div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Custo estimado</div>
                  <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 15, color: showClose.type === 'water' ? 'var(--water)' : 'var(--gas)' }}>
                    R$ {((parseFloat(endValue) - showClose.startValue) * (showClose.type === 'water' ? (config?.waterRate ?? 0.033) : (config?.gasRate ?? 0.033))).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowClose(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleClose} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {loading ? <><Spinner size={14} color="white" />Calculando...</> : 'Fechar e Calcular'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Remover esta leitura de ${deleting.type === 'water' ? 'água' : 'gás'}? Esta ação não pode ser desfeita.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
