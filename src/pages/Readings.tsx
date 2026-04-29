import { useState, useMemo, useRef, useEffect }                    from 'react'
import { Plus, Droplets, Flame, CheckCircle, Clock, Trash2, Lock,
         Search, ChevronDown, Building2, Check, TrendingUp,
         Filter }                                                  from 'lucide-react'
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
// ApartmentSelect
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
    <div ref={wrapRef} className="apt-select-wrap">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="apt-select-btn"
        style={{
          border: `1.5px solid ${open ? accent : 'var(--border)'}`,
          boxShadow: open ? `0 0 0 3px ${accentBg}` : 'none',
        }}
      >
        <span
          className="apt-select-icon-wrap"
          style={{ background: selected ? accentBg : 'var(--surface)' }}
        >
          {selected
            ? isWater ? <Droplets size={14} color={accent} /> : <Flame size={14} color={accent} />
            : <Building2 size={14} color="var(--text-3)" />}
        </span>
        <span className="apt-select-text-wrap">
          {selected ? (
            <>
              <span className="apt-select-selected-name">
                Ap. {selected.number}{selected.block ? ` — Bl. ${selected.block}` : ''}
              </span>
              {selected.responsible && (
                <span className="apt-select-selected-resp">{selected.responsible}</span>
              )}
            </>
          ) : (
            <span className="apt-select-placeholder">Selecione um apartamento...</span>
          )}
        </span>
        <ChevronDown
          size={15} color="var(--text-3)"
          className="apt-select-chevron"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div className="apt-select-dropdown">
          <div className="apt-select-search-wrap">
            <div className="apt-select-search-inner">
              <Search size={13} className="apt-select-search-icon" />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por número, bloco ou responsável..."
                className="apt-select-search-input"
              />
            </div>
          </div>
          <div className="apt-select-list">
            {Object.keys(grouped).length === 0 ? (
              <div className="apt-select-empty">Nenhum apartamento encontrado</div>
            ) : (
              Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([blockLabel, apts]) => (
                  <div key={blockLabel}>
                    <div className="apt-select-group-label">{blockLabel}</div>
                    {apts.map(apt => {
                      const isSel = apt.id === value
                      return (
                        <button
                          key={apt.id}
                          type="button"
                          onClick={() => { onChange(apt.id); setOpen(false) }}
                          className="apt-select-option"
                          style={{ background: isSel ? accentBg : 'transparent' }}
                          onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                          onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                        >
                          <span
                            className="apt-select-option-num"
                            style={{
                              background: isSel ? accentBg : 'var(--surface-2)',
                              border: `1px solid ${isSel ? accent : 'var(--border)'}`,
                              color: isSel ? accent : 'var(--text-2)',
                            }}
                          >
                            {apt.number}
                          </span>
                          <span className="apt-select-option-info">
                            <span className="apt-select-option-name" style={{ color: isSel ? accent : 'var(--text)' }}>
                              Ap. {apt.number}
                            </span>
                            <span className="apt-select-option-resp">
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
// ReadingRow
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
    <div className="reading-row">
      {/* Type pill */}
      <div className="reading-row-icon" style={{ background: accentBg }}>
        {isWater
          ? <Droplets size={17} color={accent} />
          : <Flame size={17} color={accent} />}
      </div>

      {/* Middle: meters + cost */}
      <div className="reading-row-middle">
        <div className="reading-row-meters">
          <span className="font-mono-num reading-row-start">
            {r.startValue.toLocaleString('pt-BR')}
          </span>
          <span className="reading-row-arrow">→</span>
          {r.endValue != null ? (
            <span className="font-mono-num reading-row-end">
              {r.endValue.toLocaleString('pt-BR')}
            </span>
          ) : (
            <span className="reading-row-awaiting">aguardando</span>
          )}
          <span className="reading-row-unit">m³</span>

          {r.consumption != null && (
            <span className="reading-row-consumption-badge">
              <TrendingUp size={10} />
              <span className="font-mono-num">{r.consumption.toLocaleString('pt-BR')} m³</span>
            </span>
          )}
        </div>

        <div className="reading-row-cost-row">
          {r.totalCost != null ? (
            <span className="font-mono-num reading-row-cost" style={{ color: accent }}>
              {fmt(r.totalCost)}
            </span>
          ) : (
            <span className="reading-row-pending-label">Custo pendente</span>
          )}
          {isClosed
            ? <span className="badge badge-ok" style={{ fontSize: 11 }}><CheckCircle size={10} /> Fechada</span>
            : r.autoCreated
              ? <span className="badge badge-open" style={{ fontSize: 11, opacity: 0.6 }}><Clock size={10} /> Aguardando mês</span>
              : <span className="badge badge-open" style={{ fontSize: 11 }}><Clock size={10} /> Aberta</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="reading-row-actions">
        {!isClosed && !r.autoCreated && (
          <button
            onClick={() => onClose(r)}
            title="Fechar leitura"
            className="reading-row-close-btn"
            style={{ background: accentBg, color: accent }}
          >
            <Lock size={12} />
            <span className="hide-on-mobile">Fechar</span>
          </button>
        )}
        <button
          onClick={() => onDelete(r)}
          title="Excluir"
          className="reading-row-delete-btn"
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
  const hasOpen   = readings.some(r => !r.closedAt && !r.autoCreated)
  const totalCost = readings.reduce((s, r) => s + (r.totalCost ?? 0), 0)

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Card header */}
      <div className="readings-apt-card-header">
        <div className="readings-apt-card-left">
          <div className="readings-apt-card-num-badge">{apt.number}</div>
          <div>
            <div className="readings-apt-card-apt-name">
              Ap. {apt.number}
              {apt.block && <span className="readings-apt-card-block">Bl. {apt.block}</span>}
            </div>
            {apt.responsible && (
              <div className="readings-apt-card-responsible">{apt.responsible}</div>
            )}
          </div>
        </div>

        <div className="readings-apt-card-right">
          {hasOpen && (
            <span className="badge badge-open" style={{ fontSize: 11 }}><Clock size={10} /> Pendente</span>
          )}
          {totalCost > 0 && (
            <span className="font-mono-num readings-apt-card-total">
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
  const openCount  = monthReadings.filter(r => !r.closedAt && !r.autoCreated).length

  const isLoading = config === null && apartments.length === 0 && readings.length === 0
  if (isLoading) return <ReadingsSkeleton />

  // Leitura pré-criada automaticamente (aberta, com flag autoCreated) para o mês/ap/tipo selecionado
  const preCreatedReading = openForm.apartmentId
    ? readings.find(
        r =>
          r.apartmentId === openForm.apartmentId &&
          r.type        === openForm.type         &&
          r.month       === selectedMonth          &&
          r.year        === selectedYear           &&
          !r.closedAt                              &&
          !!r.autoCreated,
      ) ?? null
    : null

  const handleOpen = async () => {
    if (!openForm.apartmentId) { toast('Selecione um apartamento', 'error'); return }

    // Se já existe leitura pré-criada (autoCreated), limpa o flag e abre direto o modal de fechar
    if (preCreatedReading) {
      setLoading(true)
      try {
        await readingRepo.update(preCreatedReading.id, { autoCreated: false })
        // Usa o objeto atualizado (sem autoCreated) para o modal de fechar
        const updatedReading = { ...preCreatedReading, autoCreated: false }
        setShowOpen(false)
        setShowClose(updatedReading)
        setEndValue('')
        setOpenForm({ apartmentId: '', type: 'water', startValue: '' })
      } catch (e: any) { toast(friendlyError(e), 'error') }
      setLoading(false)
      return
    }

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
    const end = parseFloat(endValue)
    if (isNaN(end)) { toast('Leitura final inválida', 'error'); return }
    if (end < showClose.startValue) { toast('Leitura final não pode ser menor que a inicial', 'error'); return }
    setLoading(true)
    try {
      await readingUseCases.closeReading(showClose.id, end)
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

  // Filter button helpers
  const typeFilterStyle = (t: 'all' | 'water' | 'gas') => ({
    background: filterType === t
      ? t === 'water' ? 'var(--water-light)' : t === 'gas' ? 'var(--gas-light)' : 'var(--surface-3)'
      : 'var(--surface-2)',
    color: filterType === t
      ? t === 'water' ? 'var(--water)' : t === 'gas' ? 'var(--gas)' : 'var(--text)'
      : 'var(--text-2)',
  })

  const statusFilterStyle = (s: 'all' | 'open' | 'closed') => ({
    background: filterStatus === s
      ? s === 'open' ? 'var(--badge-open-bg)' : s === 'closed' ? 'var(--badge-ok-bg)' : 'var(--surface-3)'
      : 'var(--surface-2)',
    color: filterStatus === s
      ? s === 'open' ? 'var(--badge-open-text)' : s === 'closed' ? 'var(--badge-ok-text)' : 'var(--text)'
      : 'var(--text-2)',
  })

  return (
    <div className="page">
      {/* FAB mobile */}
      <button
        className="fab"
        onClick={() => setShowOpen(true)}
        disabled={apartments.length === 0}
        aria-label="Nova Leitura"
      >
        <Plus size={22} />
      </button>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Leituras</h1>
          <p className="page-subtitle">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
        </div>
        <div className="page-header-actions">
          <MonthSelector />
          <button className="btn-primary hide-on-mobile" onClick={() => setShowOpen(true)} disabled={apartments.length === 0}>
            <Plus size={16} /> Nova Leitura
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {monthReadings.length > 0 && (
        <div className="readings-summary-strip">
          {totalWater > 0 && (
            <div className="card readings-summary-card">
              <div className="readings-summary-icon readings-summary-icon-water">
                <Droplets size={16} color="var(--water)" />
              </div>
              <div>
                <div className="readings-summary-label">Total Água</div>
                <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 16, color: 'var(--water)' }}>
                  {fmt(totalWater)}
                </div>
              </div>
            </div>
          )}
          {totalGas > 0 && (
            <div className="card readings-summary-card">
              <div className="readings-summary-icon readings-summary-icon-gas">
                <Flame size={16} color="var(--gas)" />
              </div>
              <div>
                <div className="readings-summary-label">Total Gás</div>
                <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 16, color: 'var(--gas)' }}>
                  {fmt(totalGas)}
                </div>
              </div>
            </div>
          )}
          {openCount > 0 && (
            <div
              className="card readings-summary-card readings-summary-card-clickable"
              style={{ borderColor: openCount > 0 ? 'var(--badge-open-text)' : 'var(--border)' }}
              onClick={() => setFilterStatus(s => s === 'open' ? 'all' : 'open')}
            >
              <div className="readings-summary-icon readings-summary-icon-pending">
                <Clock size={16} color="var(--badge-open-text)" />
              </div>
              <div>
                <div className="readings-summary-label">Pendentes</div>
                <div className="font-mono-num" style={{ fontWeight: 700, fontSize: 16, color: 'var(--badge-open-text)' }}>
                  {openCount} leitura{openCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="readings-filter-bar" style={{ opacity: monthReadings.length === 0 ? 0.7 : 1 }}>
        <Filter size={13} color="var(--text-3)" style={{ flexShrink: 0 }} />

        {(['all', 'water', 'gas'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className="readings-filter-btn"
            style={typeFilterStyle(t)}
          >
            {t === 'all' ? 'Todos' : t === 'water' ? '💧 Água' : '🔥 Gás'}
          </button>
        ))}

        <div className="readings-filter-sep" />

        {(['all', 'open', 'closed'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="readings-filter-btn"
            style={statusFilterStyle(s)}
          >
            {s === 'all' ? 'Todos' : s === 'open' ? 'Abertas' : 'Fechadas'}
          </button>
        ))}

        <span className="readings-filter-count">
          {grouped.size} ap. · {monthReadings.length} leituras
        </span>
      </div>

      {/* Empty state */}
      {monthReadings.length === 0 ? (
        <div className="card readings-empty-state">
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
          {(filterType !== 'all' || filterStatus !== 'all') && (
            <button
              className="btn-secondary"
              style={{ fontSize: 13 }}
              onClick={() => { setFilterType('all'); setFilterStatus('all') }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="readings-list">
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
          <div className="modal-form">
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
              <div className="readings-type-selector">
                {(['water', 'gas'] as UtilityType[]).map(t => (
                  <button key={t} onClick={() => setOpenForm(f => ({ ...f, type: t }))}
                    className="readings-type-btn"
                    style={{
                      border: `2px solid ${openForm.type === t ? (t === 'water' ? 'var(--water)' : 'var(--gas)') : 'var(--border)'}`,
                      background: openForm.type === t ? (t === 'water' ? 'var(--water-light)' : 'var(--gas-light)') : 'var(--surface-2)',
                      color: openForm.type === t ? (t === 'water' ? 'var(--water)' : 'var(--gas)') : 'var(--text-2)',
                    }}>
                    {t === 'water' ? <Droplets size={16} /> : <Flame size={16} />}
                    {t === 'water' ? 'Água' : 'Gás'}
                  </button>
                ))}
              </div>
            </div>

            {/* Campo de leitura inicial: mostra pré-preenchido (somente leitura) se já existe
                leitura automática do mês anterior; caso contrário, campo editável normal */}
            {preCreatedReading ? (
              <div>
                <label className="label">Leitura inicial (m³)</label>
                <div
                  className="input"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: openForm.type === 'water' ? 'var(--water-light)' : 'var(--gas-light)',
                    color: openForm.type === 'water' ? 'var(--water)' : 'var(--gas)',
                    fontWeight: 600,
                    cursor: 'default',
                  }}
                >
                  {openForm.type === 'water'
                    ? <Droplets size={14} />
                    : <Flame size={14} />}
                  <span className="font-mono-num">{preCreatedReading.startValue.toFixed(2)} m³</span>
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 'auto', opacity: 0.8 }}>
                    preenchido automaticamente
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                  Leitura inicial herdada do fechamento do mês anterior. Clique em <strong>Registrar</strong> para ir direto ao fechamento.
                </p>
              </div>
            ) : (
              <div>
                <label className="label">Leitura inicial (m³) *</label>
                <input className="input" type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={openForm.startValue} onChange={e => setOpenForm(f => ({ ...f, startValue: e.target.value }))} />
              </div>
            )}

            <div className="readings-tariff-hint">
              Tarifa: <strong style={{ color: 'var(--text)' }}>R$ {openForm.type === 'water' ? config?.waterRate?.toFixed(4) : config?.gasRate?.toFixed(4)}/m³</strong>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleOpen} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {loading ? <><Spinner size={14} color="white" />Salvando...</> : preCreatedReading ? 'Ir para Fechamento' : 'Registrar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: fechar leitura */}
      {showClose && (
        <Modal title="Fechar Leitura" onClose={() => setShowClose(null)}>
          <div className="modal-form">
            {/* Reading info */}
            <div
              className="readings-close-info"
              style={{
                background: showClose.type === 'water' ? 'var(--water-light)' : 'var(--gas-light)',
                border: `1px solid ${showClose.type === 'water' ? 'rgba(37,99,235,0.2)' : 'rgba(234,88,12,0.2)'}`,
              }}
            >
              <div className="readings-close-info-icon">
                {showClose.type === 'water'
                  ? <Droplets size={20} color="var(--water)" />
                  : <Flame size={20} color="var(--gas)" />}
              </div>
              <div>
                <div className="readings-close-info-title">
                  Ap. {apt(showClose.apartmentId)?.number} — {showClose.type === 'water' ? 'Água' : 'Gás'}
                </div>
                <div className="readings-close-info-sub">
                  Leitura inicial: <span className="font-mono-num" style={{ fontWeight: 600 }}>{showClose.startValue.toFixed(2)} m³</span>
                </div>
              </div>
            </div>

            <div>
              <label className="label">Leitura final (m³) *</label>
              <input className="input" type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={endValue} onChange={e => setEndValue(e.target.value)} autoFocus />
            </div>

            {endValue && parseFloat(endValue) >= showClose.startValue && (
              <div className="readings-close-preview">
                <div>
                  <div className="readings-close-preview-label">Consumo</div>
                  <div className="font-mono-num readings-close-preview-value">
                    {(parseFloat(endValue) - showClose.startValue).toFixed(2)} m³
                  </div>
                </div>
                <div className="readings-close-preview-sep" />
                <div>
                  <div className="readings-close-preview-label">Custo estimado</div>
                  <div className="font-mono-num readings-close-preview-value"
                    style={{ color: showClose.type === 'water' ? 'var(--water)' : 'var(--gas)' }}>
                    R$ {((parseFloat(endValue) - showClose.startValue) * (showClose.type === 'water' ? (config?.waterRate ?? 0.033) : (config?.gasRate ?? 0.033))).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
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
