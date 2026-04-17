import { useMemo, useState }                     from 'react'
import { Download, Droplets, Flame, TrendingUp } from 'lucide-react'
import { useAppStore }                           from '../store'
import { HistorySkeleton }                       from '../components/ui/Skeleton'

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export function History() {
  const { apartments, readings, config } = useAppStore()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  // Skeleton enquanto dados do Firebase não chegaram
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
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Histórico</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 14 }}>Consolidado anual</p>
        </div>
        <div className="page-header-actions">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input" style={{ width: 'auto', padding: '7px 12px' }}>
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
          { label: 'Total Água', value: fmt(monthlyData.reduce((a, m) => a + m.totalWater, 0)), icon: Droplets, color: '#3b82f6' },
          { label: 'Total Gás',  value: fmt(monthlyData.reduce((a, m) => a + m.totalGas, 0)),   icon: Flame,    color: '#f97316' },
          { label: 'Total Geral', value: fmt(grandTotal), icon: TrendingUp, color: '#7c3aed' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{label} {year}</div>
              <div className="font-mono-num" style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ background: 'var(--table-head)', borderBottom: '1px solid var(--border)' }}>
              {['Mês','Custo Água','Custo Gás','Total do Mês','Leituras'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((m, i) => (
              <tr key={m.month} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--table-alt)', opacity: m.count === 0 ? 0.45 : 1 }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>{MONTHS[m.month - 1]}</td>
                <td style={{ padding: '12px 16px' }} className="font-mono-num">
                  <span style={{ color: 'var(--water)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {m.totalWater > 0 && <Droplets size={12} />}{fmt(m.totalWater)}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }} className="font-mono-num">
                  <span style={{ color: 'var(--gas)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {m.totalGas > 0 && <Flame size={12} />}{fmt(m.totalGas)}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text)' }} className="font-mono-num">
                  {m.total > 0 ? `R$ ${m.total.toFixed(2)}` : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>{m.count > 0 ? `${m.count}` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--table-head)', borderTop: '2px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text)' }}>Total {year}</td>
              <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--water)' }} className="font-mono-num">
                {fmt(monthlyData.reduce((a, m) => a + m.totalWater, 0))}
              </td>
              <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--gas)' }} className="font-mono-num">
                {fmt(monthlyData.reduce((a, m) => a + m.totalGas, 0))}
              </td>
              <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, color: 'var(--text)' }} className="font-mono-num">
                {fmt(grandTotal)}
              </td>
              <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>
                {monthlyData.reduce((a, m) => a + m.count, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
