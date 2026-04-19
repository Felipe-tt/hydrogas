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
    <div className="card skeleton-kpi-card">
      <div className="skeleton-kpi-inner">
        <div className="skeleton-kpi-left">
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
    <div className="card skeleton-apt-card">
      {/* Header */}
      <div className="skeleton-apt-header">
        <div className="skeleton-apt-header-left">
          <Skeleton width={36} height={36} borderRadius={8} />
          <div className="skeleton-apt-header-meta">
            <Skeleton width={80} height={16} />
            <Skeleton width={55} height={12} />
          </div>
        </div>
        <div className="skeleton-apt-header-actions">
          <Skeleton width={34} height={34} borderRadius={6} />
          <Skeleton width={34} height={34} borderRadius={6} />
        </div>
      </div>

      {/* Divider */}
      <div className="skeleton-divider" />

      {/* Senha */}
      <div className="skeleton-col">
        <Skeleton width="45%" height={12} />
        <Skeleton width="100%" height={34} borderRadius={7} />
      </div>

      {/* Divider */}
      <div className="skeleton-divider" />

      {/* Link */}
      <div className="skeleton-col">
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
        <td key={i} className="skeleton-table-td">
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
        <div className="skeleton-reading-card-header-inner">
          <Skeleton width={24} height={24} borderRadius={6} />
          <Skeleton width={90} height={15} />
        </div>
        <Skeleton width={60} height={22} borderRadius={20} />
      </div>
      <div className="reading-card-grid">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton-reading-grid-item">
            <Skeleton width="60%" height={11} />
            <Skeleton width="80%" height={14} />
          </div>
        ))}
      </div>
      <div className="reading-card-actions skeleton-reading-actions">
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
        <td key={i} className="skeleton-table-td">
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
        <div className="skeleton-reading-card-header-inner">
          <Skeleton width={24} height={24} borderRadius={6} />
          <Skeleton width={100} height={15} />
        </div>
        <Skeleton width={60} height={22} borderRadius={20} />
      </div>
      <div className="reading-card-grid">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton-reading-grid-item">
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
        <div className="skeleton-dash-header-left">
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
        <div className="card skeleton-kpi-card">
          <Skeleton width="50%" height={16} style={{ marginBottom: 18 }} />
          <Skeleton width="100%" height={200} borderRadius={8} />
        </div>
        <div className="card skeleton-kpi-card">
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
        <div className="skeleton-apts-header">
          <Skeleton width={160} height={22} />
          <Skeleton width={100} height={14} />
        </div>
        <Skeleton width={160} height={36} borderRadius={8} />
      </div>
      <div className="skeleton-apt-grid">
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
        <div className="skeleton-col">
          <Skeleton width={100} height={22} />
          <Skeleton width={180} height={14} />
        </div>
        <div className="skeleton-readings-actions">
          <Skeleton width={160} height={36} borderRadius={8} />
          <Skeleton width={130} height={36} borderRadius={8} />
        </div>
      </div>

      {/* Filtros */}
      <div className="skeleton-readings-filters">
        <Skeleton width={120} height={34} borderRadius={8} />
        <Skeleton width={120} height={34} borderRadius={8} />
      </div>

      {/* Tabela desktop */}
      <div className="card readings-table-wrap">
        <table className="readings-table">
          <thead>
            <tr className="skeleton-table-head-row">
              {['Apartamento', 'Tipo', 'Mês/Ano', 'Consumo', 'Custo', 'Status', 'Ações'].map(h => (
                <th key={h} className="skeleton-table-th">
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
        <div className="skeleton-col">
          <Skeleton width={120} height={22} />
          <Skeleton width={200} height={14} />
        </div>
        <Skeleton width={160} height={36} borderRadius={8} />
      </div>

      {/* Cards de resumo */}
      <div className="summary-grid-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="card skeleton-kpi-card">
            <div className="skeleton-col">
              <Skeleton width="55%" height={12} />
              <Skeleton width="70%" height={22} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabela desktop */}
      <div className="card readings-table-wrap">
        <table className="readings-table">
          <thead>
            <tr className="skeleton-table-head-row">
              {['Apartamento', 'Tipo', 'Período', 'Consumo', 'Custo', 'Fechado em'].map(h => (
                <th key={h} className="skeleton-table-th">
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
    <div className="page skeleton-config-page">
      <div className="skeleton-config-header">
        <Skeleton width={160} height={22} style={{ marginBottom: 8 }} />
        <Skeleton width={280} height={14} />
      </div>

      {[1, 2, 3].map((_, i) => (
        <React.Fragment key={i}>
          <div className="skeleton-config-row">
            <div className="skeleton-config-row-left">
              <div className="skeleton-config-row-icon">
                <Skeleton width={28} height={28} borderRadius={8} />
                <Skeleton width={90} height={14} />
              </div>
              <Skeleton width="70%" height={12} style={{ marginLeft: 37 }} />
            </div>
            <div className="skeleton-config-row-right">
              <Skeleton width="40%" height={13} />
              <Skeleton width="100%" height={38} borderRadius={8} />
            </div>
          </div>
          {i < 2 && <div className="skeleton-config-divider" />}
        </React.Fragment>
      ))}

      <div className="skeleton-config-save">
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
      className="spinner-svg"
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="2" strokeOpacity="0.25" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
