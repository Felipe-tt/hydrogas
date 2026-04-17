import { useMemo } from 'react'
import { Droplets, Flame, Building2, TrendingUp, AlertCircle, Smartphone, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts'
import { useAppStore, useUIStore } from '../store'
import { MonthSelector } from '../components/ui/MonthSelector'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { useGyroTilt } from '../hooks/useGyroTilt'

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const fmt    = (v: number) => `R$ ${v.toFixed(2)}`
const fmtK   = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : fmt(v)

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, icon: Icon, index, trend }: any) {
  const mult = 1 + index * 0.06

  const rotateX = `calc(var(--gyro-x, 0) * ${-mult}deg)`
  const rotateY = `calc(var(--gyro-y, 0) * ${mult}deg)`

  const shineX = `calc(52% + var(--gyro-y, 0) * ${6 * mult}%)`
  const shineY = `calc(48% - var(--gyro-x, 0) * ${6 * mult}%)`

  const TrendIcon = trend > 0 ? ArrowUpRight : ArrowDownRight
  const trendColor = trend > 0 ? '#10b981' : '#f43f5e'

  return (
    <div
      className="kpi-card fade-up"
      style={{
        animationDelay: `${index * 60}ms`,
        transform: `perspective(700px) rotateX(${rotateX}) rotateY(${rotateY}) translateZ(2px)`,
        transition: 'transform 0.06s linear',
        willChange: 'transform',
        backgroundImage: `radial-gradient(ellipse at ${shineX} ${shineY}, ${color}1a 0%, transparent 60%)`,
      } as React.CSSProperties}
    >
      <div className="kpi-top">
        <div className="kpi-icon" style={{ background: `${color}18`, color }}>
          <Icon size={17} />
        </div>
        {trend !== undefined && (
          <span className="kpi-trend" style={{ color: trendColor }}>
            <TrendIcon size={13} />
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      <div className="kpi-value font-mono-num">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      <div className="kpi-accent" style={{ background: color }} />
    </div>
  )
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, formatter, darkMode }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: darkMode ? '#1e293b' : '#fff',
      border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      color: darkMode ? '#f1f5f9' : '#0f172a',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: darkMode ? '#94a3b8' : '#64748b' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.fill || p.color, flexShrink: 0 }} />
          <span style={{ color: darkMode ? '#cbd5e1' : '#475569' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-sub">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function Dashboard() {
  const { apartments, readings, config } = useAppStore()
  const { selectedMonth, selectedYear, darkMode } = useUIStore()
  const { needsPermission, requestPermission } = useGyroTilt(14)

  // ── Todos os useMemo ANTES de qualquer early return ──────────────────────
  const monthReadings = useMemo(
    () => readings.filter(r => r.month === selectedMonth && r.year === selectedYear),
    [readings, selectedMonth, selectedYear]
  )

  const closed = useMemo(() => monthReadings.filter(r => r.closedAt), [monthReadings])
  const open   = useMemo(() => monthReadings.filter(r => !r.closedAt), [monthReadings])

  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
  const prevYear  = selectedMonth === 1 ? selectedYear - 1 : selectedYear

  const prevClosed = useMemo(
    () => readings.filter(r => r.month === prevMonth && r.year === prevYear && r.closedAt),
    [readings, prevMonth, prevYear]
  )

  const totalWaterCost = useMemo(
    () => closed.filter(r => r.type === 'water').reduce((a, r) => a + (r.totalCost ?? 0), 0),
    [closed]
  )
  const totalGasCost = useMemo(
    () => closed.filter(r => r.type === 'gas').reduce((a, r) => a + (r.totalCost ?? 0), 0),
    [closed]
  )
  const totalWaterM3 = useMemo(
    () => closed.filter(r => r.type === 'water').reduce((a, r) => a + (r.consumption ?? 0), 0),
    [closed]
  )
  const totalGasM3 = useMemo(
    () => closed.filter(r => r.type === 'gas').reduce((a, r) => a + (r.consumption ?? 0), 0),
    [closed]
  )

  const prevWaterCost = useMemo(
    () => prevClosed.filter(r => r.type === 'water').reduce((a, r) => a + (r.totalCost ?? 0), 0),
    [prevClosed]
  )
  const prevGasCost = useMemo(
    () => prevClosed.filter(r => r.type === 'gas').reduce((a, r) => a + (r.totalCost ?? 0), 0),
    [prevClosed]
  )

  const currTotal = totalWaterCost + totalGasCost
  const prevTotal = prevWaterCost + prevGasCost

  const chartData = useMemo(() => {
    const map = new Map<string, { apt: string; agua: number; gas: number }>()
    for (const r of closed) {
      const apt = apartments.find(a => a.id === r.apartmentId)
      if (!apt) continue
      const ex = map.get(apt.id) ?? { apt: `Ap ${apt.number}`, agua: 0, gas: 0 }
      if (r.type === 'water') ex.agua += r.consumption ?? 0
      else ex.gas += r.consumption ?? 0
      map.set(apt.id, ex)
    }
    return Array.from(map.values()).sort((a, b) => a.apt.localeCompare(b.apt))
  }, [closed, apartments])

  const trendData = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    let m = selectedMonth - 5 + i, y = selectedYear
    while (m < 1)  { m += 12; y-- }
    while (m > 12) { m -= 12; y++ }
    const rs = readings.filter(r => r.month === m && r.year === y && r.closedAt)
    const water = rs.filter(r => r.type === 'water').reduce((a, r) => a + (r.totalCost ?? 0), 0)
    const gas   = rs.filter(r => r.type === 'gas').reduce((a, r) => a + (r.totalCost ?? 0), 0)
    return { mes: MONTHS[m - 1], agua: +water.toFixed(2), gas: +gas.toFixed(2), total: +(water + gas).toFixed(2) }
  }), [readings, selectedMonth, selectedYear])

  // ── Early return DEPOIS de todos os hooks ────────────────────────────────
  const isLoading = config === null && apartments.length === 0 && readings.length === 0
  if (isLoading) return <DashboardSkeleton />

  const trendPct = (curr: number, prev: number) => {
    if (prev === 0) return undefined
    return +((curr - prev) / prev * 100).toFixed(1)
  }

  const gridColor = darkMode ? '#1e293b' : '#f1f5f9'
  const tickColor = darkMode ? '#64748b' : '#94a3b8'

  return (
    <div className="page dash-page">

      {/* ── Header ── */}
      <div className="dash-header">
        <div className="dash-title-group">
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">
            {MONTHS[selectedMonth - 1]} {selectedYear} · {apartments.filter(a => a.active).length} apartamentos
          </p>
        </div>
        <div className="page-header-actions">
          <MonthSelector />
        </div>
      </div>

      {/* ── Gyro permission banner (iOS) ── */}
      {needsPermission && (
        <button className="gyro-banner" onClick={requestPermission}>
          <span className="gyro-icon"><Smartphone size={15} /></span>
          <span>Ativar animação por movimento do celular</span>
          <span className="gyro-arrow">→</span>
        </button>
      )}

      {/* ── Open readings alert ── */}
      {open.length > 0 && (
        <div className="dash-alert">
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>
            <strong>{open.length}</strong> leitura{open.length > 1 ? 's' : ''} em aberto — acesse <strong>Leituras</strong> para fechar.
          </span>
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="kpi-grid-4">
        <KPICard
          label="Água" value={fmtK(totalWaterCost)} sub={`${totalWaterM3.toFixed(1)} m³ consumidos`}
          color="#3b82f6" icon={Droplets} index={0}
          trend={trendPct(totalWaterCost, prevWaterCost)}
        />
        <KPICard
          label="Gás" value={fmtK(totalGasCost)} sub={`${totalGasM3.toFixed(1)} m³ consumidos`}
          color="#f97316" icon={Flame} index={1}
          trend={trendPct(totalGasCost, prevGasCost)}
        />
        <KPICard
          label="Apartamentos" value={apartments.filter(a => a.active).length}
          sub={open.length > 0 ? `${open.length} em aberto` : 'Todos fechados'}
          color="#7c3aed" icon={Building2} index={2}
        />
        <KPICard
          label="Total Faturado" value={fmtK(currTotal)}
          sub={`${closed.length} leituras fechadas`}
          color="#0891b2" icon={TrendingUp} index={3}
          trend={trendPct(currTotal, prevTotal)}
        />
      </div>

      {/* ── Charts ── */}
      <div className="dash-charts">

        <div className="card dash-chart-card">
          <SectionHeader title="Tendência de Custos" subtitle="Últimos 6 meses" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAgua" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradGas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `R$${v}`} />
              <Tooltip
                content={<CustomTooltip darkMode={darkMode} formatter={fmt} />}
                cursor={{ stroke: darkMode ? '#334155' : '#e2e8f0', strokeWidth: 1 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: tickColor, paddingTop: 8 }} />
              <Area type="monotone" dataKey="agua" name="Água" stroke="#3b82f6" strokeWidth={2} fill="url(#gradAgua)" dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
              <Area type="monotone" dataKey="gas"  name="Gás"  stroke="#f97316" strokeWidth={2} fill="url(#gradGas)"  dot={false} activeDot={{ r: 4, fill: '#f97316' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card dash-chart-card">
          <SectionHeader title="Consumo por Apartamento" subtitle="m³ neste mês" />
          {chartData.length === 0 ? (
            <div className="chart-empty">
              <Droplets size={28} style={{ color: 'var(--text-3)', marginBottom: 8 }} />
              <span>Sem dados neste mês</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={14} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="apt" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v}m³`} />
                <Tooltip
                  content={<CustomTooltip darkMode={darkMode} formatter={(v: number) => `${v} m³`} />}
                  cursor={{ fill: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: tickColor, paddingTop: 8 }} />
                <Bar dataKey="agua" name="Água" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gas"  name="Gás"  fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  )
}
