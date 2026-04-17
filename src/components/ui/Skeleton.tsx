// src/components/ui/Skeleton.tsx
// Componente de shimmer/skeleton reutilizável para loading states

import React from 'react'

// ── CSS injetado uma vez ───────────────────────────────────────────────────────

const STYLE = `
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--surface-2) 25%,
    var(--surface-3) 50%,
    var(--surface-2) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  border-radius: 6px;
}
`

let styleInjected = false
function injectStyle() {
  if (styleInjected) return
  styleInjected = true
  const el = document.createElement('style')
  el.textContent = STYLE
  document.head.appendChild(el)
}

// ── Bloco base ────────────────────────────────────────────────────────────────

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
}: {
  width?: number | string
  height?: number | string
  borderRadius?: number | string
  style?: React.CSSProperties
}) {
  injectStyle()
  return (
    <div
      className="skeleton-shimmer"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
    />
  )
}

// ── Card KPI (Dashboard) ──────────────────────────────────────────────────────

export function KPICardSkeleton() {
  injectStyle()
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="55%" height={12} />
          <Skeleton width="70%" height={26} />
          <Skeleton width="40%" height={11} />
        </div>
        <Skeleton width={36} height={36} borderRadius={10} style={{ marginLeft: 8 }} />
      </div>
    </div>
  )
}

// ── Card de Apartamento ───────────────────────────────────────────────────────

export function ApartmentCardSkeleton() {
  injectStyle()
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Skeleton width={36} height={36} borderRadius={8} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={80} height={16} />
            <Skeleton width={55} height={12} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Skeleton width={34} height={34} borderRadius={6} />
          <Skeleton width={34} height={34} borderRadius={6} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Senha */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width="45%" height={12} />
        <Skeleton width="100%" height={34} borderRadius={7} />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Link */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="100%" height={34} borderRadius={7} />
      </div>
    </div>
  )
}

// ── Linha de leitura (tabela desktop) ─────────────────────────────────────────

export function ReadingRowSkeleton() {
  injectStyle()
  return (
    <tr>
      {[90, 60, 70, 65, 65, 65, 80].map((w, i) => (
        <td key={i} style={{ padding: '12px 14px' }}>
          <Skeleton width={`${w}%`} height={14} />
        </td>
      ))}
    </tr>
  )
}

// ── Card de leitura (mobile) ───────────────────────────────────────────────────

export function ReadingCardSkeleton() {
  injectStyle()
  return (
    <div className="reading-card">
      <div className="reading-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Skeleton width={24} height={24} borderRadius={6} />
          <Skeleton width={90} height={15} />
        </div>
        <Skeleton width={60} height={22} borderRadius={20} />
      </div>
      <div className="reading-card-grid">
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Skeleton width="60%" height={11} />
            <Skeleton width="80%" height={14} />
          </div>
        ))}
      </div>
      <div className="reading-card-actions" style={{ marginTop: 10 }}>
        <Skeleton height={34} borderRadius={7} />
      </div>
    </div>
  )
}

// ── Linha do histórico ────────────────────────────────────────────────────────

export function HistoryRowSkeleton() {
  injectStyle()
  return (
    <tr>
      {[80, 55, 50, 65, 65, 60].map((w, i) => (
        <td key={i} style={{ padding: '12px 14px' }}>
          <Skeleton width={`${w}%`} height={14} />
        </td>
      ))}
    </tr>
  )
}

// ── Card de histórico (mobile) ─────────────────────────────────────────────────

export function HistoryCardSkeleton() {
  injectStyle()
  return (
    <div className="reading-card">
      <div className="reading-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Skeleton width={24} height={24} borderRadius={6} />
          <Skeleton width={100} height={15} />
        </div>
        <Skeleton width={60} height={22} borderRadius={20} />
      </div>
      <div className="reading-card-grid">
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Skeleton width="55%" height={11} />
            <Skeleton width="75%" height={14} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Skeleton do Dashboard (gráfico + KPIs) ────────────────────────────────────

export function DashboardSkeleton() {
  injectStyle()
  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width={140} height={22} />
          <Skeleton width={220} height={14} />
        </div>
        <Skeleton width={160} height={36} borderRadius={8} />
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        {[1, 2, 3, 4].map(i => <KPICardSkeleton key={i} />)}
      </div>

      {/* Charts */}
      <div className="chart-grid">
        <div className="card" style={{ padding: 20 }}>
          <Skeleton width="50%" height={16} style={{ marginBottom: 18 }} />
          <Skeleton width="100%" height={200} borderRadius={8} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <Skeleton width="50%" height={16} style={{ marginBottom: 18 }} />
          <Skeleton width="100%" height={200} borderRadius={8} />
        </div>
      </div>
    </div>
  )
}

// ── Skeleton da página Apartamentos ───────────────────────────────────────────

export function ApartmentsSkeleton() {
  injectStyle()
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width={160} height={22} />
          <Skeleton width={100} height={14} />
        </div>
        <Skeleton width={160} height={36} borderRadius={8} />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: 20,
      }}>
        {[1, 2, 3, 4].map(i => <ApartmentCardSkeleton key={i} />)}
      </div>
    </div>
  )
}

// ── Skeleton da página Leituras ───────────────────────────────────────────────

export function ReadingsSkeleton() {
  injectStyle()
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width={100} height={22} />
          <Skeleton width={180} height={14} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton width={160} height={36} borderRadius={8} />
          <Skeleton width={130} height={36} borderRadius={8} />
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Skeleton width={120} height={34} borderRadius={8} />
        <Skeleton width={120} height={34} borderRadius={8} />
      </div>

      {/* Tabela desktop */}
      <div className="card readings-table-wrap">
        <table className="readings-table">
          <thead>
            <tr style={{ background: 'var(--table-head)' }}>
              {['Apartamento', 'Tipo', 'Mês/Ano', 'Consumo', 'Custo', 'Status', 'Ações'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left' }}>
                  <Skeleton width="80%" height={13} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(i => <ReadingRowSkeleton key={i} />)}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="readings-cards">
        {[1, 2, 3, 4].map(i => <ReadingCardSkeleton key={i} />)}
      </div>
    </div>
  )
}

// ── Skeleton da página Histórico ──────────────────────────────────────────────

export function HistorySkeleton() {
  injectStyle()
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width={120} height={22} />
          <Skeleton width={200} height={14} />
        </div>
        <Skeleton width={160} height={36} borderRadius={8} />
      </div>

      {/* Cards de resumo */}
      <div className="summary-grid-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="55%" height={12} />
            <Skeleton width="70%" height={22} />
          </div>
        ))}
      </div>

      {/* Tabela desktop */}
      <div className="card readings-table-wrap">
        <table className="readings-table">
          <thead>
            <tr style={{ background: 'var(--table-head)' }}>
              {['Apartamento', 'Tipo', 'Período', 'Consumo', 'Custo', 'Fechado em'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left' }}>
                  <Skeleton width="80%" height={13} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(i => <HistoryRowSkeleton key={i} />)}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="readings-cards">
        {[1, 2, 3].map(i => <HistoryCardSkeleton key={i} />)}
      </div>
    </div>
  )
}

// ── Skeleton da página Config ─────────────────────────────────────────────────

export function ConfigSkeleton() {
  injectStyle()
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 32 }}>
        <Skeleton width={160} height={22} style={{ marginBottom: 8 }} />
        <Skeleton width={280} height={14} />
      </div>

      {[1, 2, 3].map((_, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, padding: '4px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Skeleton width={28} height={28} borderRadius={8} />
                <Skeleton width={90} height={14} />
              </div>
              <Skeleton width="70%" height={12} style={{ marginLeft: 37 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton width="40%" height={13} />
              <Skeleton width="100%" height={38} borderRadius={8} />
            </div>
          </div>
          {i < 2 && <div style={{ height: 1, background: 'var(--border)', margin: '24px 0' }} />}
        </React.Fragment>
      ))}

      <div style={{ marginTop: 24 }}>
        <Skeleton width="100%" height={40} borderRadius={8} />
      </div>
    </div>
  )
}

// ── Spinner inline (mantido para compatibilidade) ─────────────────────────────

export function Spinner({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 14 14"
      fill="none"
      style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="2" strokeOpacity="0.25" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
