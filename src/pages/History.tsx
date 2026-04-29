import { useMemo, useState }                     from 'react'
import { Download, Droplets, Flame, TrendingUp } from 'lucide-react'
import { useAppStore }                           from '../store'
import { HistorySkeleton }                       from '../components/ui/Skeleton'

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export function History() {
  const { apartments, readings, config } = useAppStore()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  const isLoading = config === null && apartments.length === 0 && readings.length === 0
  if (isLoading) return <HistorySkeleton />

  const closedReadings = readings.filter(r => r.closedAt)

  const monthlyData = Array.from({ length: 12 }, (_, mi) => {
    const month = mi + 1
    const rs = closedReadings.filter(r => r.year === year && r.month === month)
    const aptMap = new Map<string, { waterCost: number; gasCost: number; waterM3: number; gasM3: number }>()
    for (const r of rs) {
      const ex = aptMap.get(r.apartmentId) ?? { waterCost: 0, gasCost: 0, waterM3: 0, gasM3: 0 }
      if (r.type === 'water') { ex.waterCost += r.totalCost ?? 0; ex.waterM3 += r.consumption ?? 0 }
      else { ex.gasCost += r.totalCost ?? 0; ex.gasM3 += r.consumption ?? 0 }
      aptMap.set(r.apartmentId, ex)
    }
    const totalWater = [...aptMap.values()].reduce((a, v) => a + v.waterCost, 0)
    const totalGas   = [...aptMap.values()].reduce((a, v) => a + v.gasCost, 0)
    return { month, aptMap, totalWater, totalGas, total: totalWater + totalGas, count: rs.length }
  })

  const grandTotal = monthlyData.reduce((a, m) => a + m.total, 0)
  const fmt = (v: number) => v > 0 ? `R$ ${v.toFixed(2)}` : '—'

  const exportCSV = () => {
    const rows = [['Mês','Apartamento','Água (m³)','Custo Água','Gás (m³)','Custo Gás','Total']]
    for (const md of monthlyData) {
      for (const [aptId, v] of md.aptMap.entries()) {
        const apt = apartments.find(a => a.id === aptId)
        rows.push([`${MONTHS[md.month - 1]}/${year}`, `Ap. ${apt?.number ?? '?'}`,
          v.waterM3.toFixed(2), v.waterCost.toFixed(2), v.gasM3.toFixed(2), v.gasCost.toFixed(2), (v.waterCost + v.gasCost).toFixed(2)])
      }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' }))
    a.download = `hidrogas-historico-${year}.csv`
    a.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Histórico</h1>
          <p className="page-subtitle">Consolidado anual</p>
        </div>
        <div className="page-header-actions">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input history-year-select"
          >
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="btn-secondary" onClick={exportCSV}>
            <Download size={15} /> <span className="hide-on-mobile">Exportar CSV</span>
          </button>
        </div>
      </div>

      <div className="summary-grid-3">
        {[
          { label: 'Total Água', value: fmt(monthlyData.reduce((a, m) => a + m.totalWater, 0)), icon: Droplets, color: '#3b82f6', bg: 'rgba(59,130,246,0.13)' },
          { label: 'Total Gás',  value: fmt(monthlyData.reduce((a, m) => a + m.totalGas, 0)),   icon: Flame,    color: '#f97316', bg: 'rgba(249,115,22,0.13)' },
          { label: 'Total Geral', value: fmt(grandTotal), icon: TrendingUp, color: '#7c3aed', bg: 'rgba(124,58,237,0.13)' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card history-summary-card">
            <div className="history-summary-icon" style={{ background: bg }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div className="history-summary-label">{label} {year}</div>
              <div className="font-mono-num history-summary-value" style={{ color }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card history-table-wrap">
        <table className="history-table">
          <thead>
            <tr className="history-table-head-row">
              {['Mês','Custo Água','Custo Gás','Total do Mês','Leituras'].map(h => (
                <th key={h} className="history-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((m, i) => (
              <tr
                key={m.month}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--table-alt)',
                  opacity: m.count === 0 ? 0.45 : 1,
                }}
              >
                <td className="history-td-month">{MONTHS[m.month - 1]}</td>
                <td className="history-td font-mono-num">
                  <span className="history-cell-water">
                    {m.totalWater > 0 && <Droplets size={12} />}{fmt(m.totalWater)}
                  </span>
                </td>
                <td className="history-td font-mono-num">
                  <span className="history-cell-gas">
                    {m.totalGas > 0 && <Flame size={12} />}{fmt(m.totalGas)}
                  </span>
                </td>
                <td className="history-td-total font-mono-num">
                  {m.total > 0 ? `R$ ${m.total.toFixed(2)}` : '—'}
                </td>
                <td className="history-td" style={{ color: 'var(--text-2)' }}>{m.count > 0 ? `${m.count}` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="history-tfoot-row">
              <td className="history-tfoot-label">Total {year}</td>
              <td className="history-tfoot-water font-mono-num">
                {fmt(monthlyData.reduce((a, m) => a + m.totalWater, 0))}
              </td>
              <td className="history-tfoot-gas font-mono-num">
                {fmt(monthlyData.reduce((a, m) => a + m.totalGas, 0))}
              </td>
              <td className="history-tfoot-total font-mono-num">{fmt(grandTotal)}</td>
              <td className="history-tfoot-count">
                {monthlyData.reduce((a, m) => a + m.count, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
