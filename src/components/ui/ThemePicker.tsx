import { useState } from 'react'
import { Check, Droplets, Flame, Sparkles } from 'lucide-react'
import type { ThemeDefinition, ThemeName } from '../../store'

const CATEGORIES: { id: string; label: string; ids: ThemeName[] }[] = [
  { id: 'all',      label: 'Todos',    ids: [] },
  { id: 'natureza', label: 'Natureza', ids: ['ocean','emerald','forest','mint','teal','arctic'] },
  { id: 'vibrante', label: 'Vibrante', ids: ['rose','violet','candy','sakura','grape','peach'] },
  { id: 'quente',   label: 'Quente',   ids: ['amber','sunset','lava','copper','sand','crimson'] },
  { id: 'tech',     label: 'Tech',     ids: ['neon','cyberpunk','dracula','monokai','nord','midnight'] },
  { id: 'sutil',    label: 'Sutil',    ids: ['slate','indigo','solarized','steel','obsidian','aurora'] },
]

function MiniPreview({ theme, dark }: { theme: ThemeDefinition; dark: boolean }) {
  const bg    = dark ? theme.bgDark  : theme.bgLight
  const card  = dark ? '#1a1f2e' : '#ffffff'
  const text2 = dark ? '#64748b' : '#94a3b8'
  const bdr   = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'
  return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect width="120" height="80" fill={bg} />
      <rect width="20" height="80" fill={dark ? '#06090f' : '#0a0e1a'} />
      {[14,24,34,44].map((y,i) => (
        <rect key={i} x="6" y={y} width="8" height="2.5" rx="1.25"
          fill={i===0 ? theme.water : (dark ? '#2a3040' : '#1e2a3a')} opacity={i===0?1:0.35} />
      ))}
      <rect x="26" y="5" width="89" height="70" rx="4" fill={card} stroke={bdr} strokeWidth="0.5" />
      <rect x="26" y="5" width="89" height="13" rx="4" fill={dark?'#151d2d':'#f8fafc'} />
      <rect x="26" y="13" width="89" height="5" rx="0" fill={dark?'#151d2d':'#f8fafc'} />
      <rect x="31" y="9.5" width="24" height="2.5" rx="1.25" fill={dark?'#e2e8f0':'#0d1117'} opacity="0.85" />
      <rect x="88" y="8.5" width="20" height="5" rx="2" fill={theme.water} opacity="0.9" />
      <rect x="31" y="24" width="37" height="14" rx="2.5" fill={dark?'#1e2a3d':'#f1f5f9'} stroke={bdr} strokeWidth="0.5" />
      <rect x="72" y="24" width="37" height="14" rx="2.5" fill={dark?'#1e2a3d':'#f1f5f9'} stroke={bdr} strokeWidth="0.5" />
      <circle cx="36" cy="29.5" r="2.5" fill={theme.water} />
      <rect x="40.5" y="28" width="11" height="2" rx="1" fill={theme.water} opacity="0.8" />
      <rect x="40.5" y="31.5" width="7" height="1.5" rx="0.75" fill={text2} opacity="0.7" />
      <circle cx="77" cy="29.5" r="2.5" fill={theme.gas} />
      <rect x="81.5" y="28" width="10" height="2" rx="1" fill={theme.gas} opacity="0.8" />
      <rect x="81.5" y="31.5" width="7" height="1.5" rx="0.75" fill={text2} opacity="0.7" />
      <rect x="31" y="44" width="78" height="22" rx="2.5" fill={dark?'#1e2a3d':'#f8fafc'} stroke={bdr} strokeWidth="0.5" />
      {[0,1,2,3,4,5].map(i => {
        const hw=[7,11,6,13,9,10][i], hg=[5,8,10,5,12,7][i]
        const x = 35 + i*11
        return (
          <g key={i}>
            <rect x={x}   y={66-hw} width="4" height={hw} rx="1" fill={theme.water} opacity="0.75" />
            <rect x={x+5} y={66-hg} width="4" height={hg} rx="1" fill={theme.gas}   opacity="0.75" />
          </g>
        )
      })}
    </svg>
  )
}

function ThemeCard({ theme, dark, isActive, onSelect, onHover, onLeave }: {
  theme: ThemeDefinition; dark: boolean; isActive: boolean
  onSelect: () => void; onHover: () => void; onLeave: () => void
}) {
  return (
    <button
      onClick={onSelect} onMouseEnter={onHover} onMouseLeave={onLeave}
      onFocus={onHover} onBlur={onLeave}
      title={theme.label}
      className={`tp-card ${isActive ? 'tp-card--active' : ''}`}
      style={{ '--tc-water': theme.water, '--tc-gas': theme.gas } as React.CSSProperties}
    >
      <div className="tp-card-preview">
        <MiniPreview theme={theme} dark={dark} />
      </div>
      <div className="tp-card-footer">
        <div className="tp-card-dots">
          <span style={{ background: theme.water }} />
          <span style={{ background: theme.gas }} />
        </div>
        <span className="tp-card-name">{theme.label}</span>
        {isActive && (
          <span className="tp-card-check">
            <Check size={8} strokeWidth={3.5} />
          </span>
        )}
      </div>
      {isActive && <div className="tp-card-glow" />}
    </button>
  )
}

interface ThemePickerProps {
  themes: ThemeDefinition[]
  currentTheme: ThemeName
  darkMode: boolean
  onSelect: (id: ThemeName) => void
}

export function ThemePicker({ themes, currentTheme, darkMode, onSelect }: ThemePickerProps) {
  const [activeCat, setActiveCat] = useState('all')
  const [hovered, setHovered]     = useState<ThemeName | null>(null)

  const active     = themes.find(t => t.id === currentTheme)!
  const previewing = hovered ? (themes.find(t => t.id === hovered) ?? active) : active

  const filtered = activeCat === 'all'
    ? themes
    : themes.filter(t => CATEGORIES.find(c => c.id === activeCat)?.ids.includes(t.id))

  return (
    <div className="tp-root">
      <div className="tp-top">
        <div className="tp-screen" style={{ '--tc-water': previewing.water } as React.CSSProperties}>
          <MiniPreview theme={previewing} dark={darkMode} />
          <div className="tp-screen-label">
            <span className="tp-screen-dot" style={{ background: previewing.water }} />
            <span>{previewing.label}</span>
            {!hovered && (
              <span className="tp-screen-badge"><Sparkles size={8} />ativo</span>
            )}
          </div>
        </div>
        <div className="tp-info">
          <div className="tp-info-pill">
            <Droplets size={10} color={previewing.water} />
            <span style={{ color: previewing.water }}>{previewing.water}</span>
          </div>
          <div className="tp-info-pill">
            <Flame size={10} color={previewing.gas} />
            <span style={{ color: previewing.gas }}>{previewing.gas}</span>
          </div>
          <div className="tp-info-hint">{themes.length} temas</div>
        </div>
      </div>

      <div className="tp-cats">
        {CATEGORIES.map(cat => {
          const count = cat.id === 'all' ? themes.length : cat.ids.length
          return (
            <button key={cat.id} onClick={() => setActiveCat(cat.id)}
              className={`tp-cat ${activeCat === cat.id ? 'tp-cat--on' : ''}`}>
              {cat.label}
              {activeCat === cat.id && <span className="tp-cat-n">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="tp-grid-scroll">
        <div className="tp-grid">
          {filtered.map(t => (
            <ThemeCard key={t.id} theme={t} dark={darkMode}
              isActive={currentTheme === t.id}
              onSelect={() => onSelect(t.id)}
              onHover={() => setHovered(t.id)}
              onLeave={() => setHovered(null)} />
          ))}
        </div>
      </div>
    </div>
  )
}
