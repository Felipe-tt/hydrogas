import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '../../store'

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export function MonthSelector() {
  const { selectedMonth, selectedYear, setMonth, setYear } = useUIStore()

  const prev = () => {
    if (selectedMonth === 1) { setMonth(12); setYear(selectedYear - 1) }
    else setMonth(selectedMonth - 1)
  }
  const next = () => {
    if (selectedMonth === 12) { setMonth(1); setYear(selectedYear + 1) }
    else setMonth(selectedMonth + 1)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '6px 10px',
    }}>
      <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}>
        <ChevronLeft size={16} />
      </button>
      <span style={{ fontWeight: 600, fontSize: 13, minWidth: 72, textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text)' }}>
        {MONTHS[selectedMonth - 1]} {selectedYear}
      </span>
      <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
