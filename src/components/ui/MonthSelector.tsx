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
    <div className="month-selector">
      <button onClick={prev} className="month-selector-btn">
        <ChevronLeft size={16} />
      </button>
      <span className="month-selector-label">
        {MONTHS[selectedMonth - 1]} {selectedYear}
      </span>
      <button onClick={next} className="month-selector-btn">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
