import { useState, useRef, useEffect } from 'react'
import { Check, Droplets, Flame, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import type { ThemeDefinition, ThemeName } from '../../store'

// ── Theme categories ──────────────────────────────────────────────────────────

const CATEGORIES: { id: string; label: string; emoji: string; ids: ThemeName[] }[] = [
  {
    id: 'all',
    label: 'Todos',
    emoji: '✦',
    ids: [],
  },
  {
    id: 'natureza',
    label: 'Natureza',
    emoji: '🌿',
    ids: ['ocean', 'emerald', 'forest', 'mint', 'teal', 'arctic'],
  },
  {
    id: 'vibrante',
    label: 'Vibrante',
    emoji: '🎨',
    ids: ['rose', 'violet', 'candy', 'sakura', 'grape', 'peach'],
  },
  {
    id: 'quente',
    label: 'Quente',
    emoji: '🔥',
    ids: ['amber', 'sunset', 'lava', 'copper', 'sand', 'crimson'],
  },
  {
    id: 'tech',
    label: 'Tech',
    emoji: '💻',
    ids: ['neon', 'cyberpunk', 'dracula', 'monokai', 'nord', 'midnight'],
  },
  {
    id: 'sutil',
    label: 'Sutil',
    emoji: '🪨',
    ids: ['slate', 'indigo', 'solarized', 'steel', 'obsidian', 'aurora'],
  },
]

// ── Mini UI Preview ───────────────────────────────────────────────────────────

function MiniPreview({
  theme,
  dark,
}: {
  theme: ThemeDefinition
  dark: boolean
}) {
  const bg     = dark ? theme.bgDark  : theme.bgLight
  const card   = dark ? '#1a1f2e'     : '#ffffff'
  const text1  = dark ? '#e2e8f0'     : '#0d1117'
  const text2  = dark ? '#64748b'     : '#94a3b8'
  const border = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'

  return (
    <svg
      viewBox="0 0 120 80"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', display: 'block', borderRadius: 6 }}
    >
      {/* Background */}
      <rect width="120" height="80" fill={bg} />

      {/* Sidebar strip */}
      <rect width="22" height="80" fill={dark ? '#06090f' : '#0a0e1a'} />

      {/* Sidebar dots nav */}
      {[16, 28, 40, 52].map((y, i) => (
        <rect key={i} x="7" y={y} width="8" height="3" rx="1.5"
          fill={i === 0 ? theme.water : (dark ? '#2a3040' : '#1e2a3a')}
          opacity={i === 0 ? 1 : 0.4}
        />
      ))}

      {/* Main content area */}
      <rect x="28" y="6" width="86" height="68" rx="4" fill={card}
        stroke={border} strokeWidth="0.5" />

      {/* Header bar in card */}
      <rect x="28" y="6" width="86" height="14" rx="4" fill={dark ? '#151d2d' : '#f8fafc'} />
      <rect x="28" y="14" width="86" height="6" rx="0" fill={dark ? '#151d2d' : '#f8fafc'} />

      {/* Title text sim */}
      <rect x="34" y="11" width="28" height="3" rx="1.5" fill={text1} opacity="0.9" />
      <rect x="90" y="10" width="18" height="5" rx="2" fill={theme.water} opacity="0.9" />

      {/* KPI cards row */}
      <rect x="34" y="26" width="36" height="14" rx="3" fill={dark ? '#1e2a3d' : '#f1f5f9'}
        stroke={border} strokeWidth="0.5" />
      <rect x="75" y="26" width="33" height="14" rx="3" fill={dark ? '#1e2a3d' : '#f1f5f9'}
        stroke={border} strokeWidth="0.5" />

      {/* Water dot + value */}
      <circle cx="39" cy="31" r="3" fill={theme.water} />
      <rect x="44" y="29.5" width="12" height="2" rx="1" fill={theme.water} opacity="0.8" />
      <rect x="44" y="33.5" width="8"  height="1.5" rx="0.75" fill={text2} opacity="0.7" />

      {/* Gas dot + value */}
      <circle cx="80" cy="31" r="3" fill={theme.gas} />
      <rect x="85" y="29.5" width="10" height="2" rx="1" fill={theme.gas} opacity="0.8" />
      <rect x="85" y="33.5" width="7"  height="1.5" rx="0.75" fill={text2} opacity="0.7" />

      {/* Chart area */}
      <rect x="34" y="46" width="74" height="20" rx="3" fill={dark ? '#1e2a3d' : '#f8fafc'}
        stroke={border} strokeWidth="0.5" />

      {/* Chart bars - water */}
      {[0, 1, 2, 3, 4].map(i => {
        const heights = [8, 12, 7, 14, 10]
        const h = heights[i]
        return (
          <rect
            key={`w${i}`}
            x={38 + i * 9}
            y={66 - h}
            width="3"
            height={h}
            rx="1"
            fill={theme.water}
            opacity="0.75"
          />
        )
      })}

      {/* Chart bars - gas */}
      {[0, 1, 2, 3, 4].map(i => {
        const heights = [5, 9, 11, 6, 13]
        const h = heights[i]
        return (
          <rect
            key={`g${i}`}
            x={42 + i * 9}
            y={66 - h}
            width="3"
            height={h}
            rx="1"
            fill={theme.gas}
            opacity="0.75"
          />
        )
      })}

      {/* Bottom text sim */}
      <rect x="34" y="69" width="20" height="2" rx="1" fill={text2} opacity="0.4" />
      <rect x="80" y="69" width="14" height="2" rx="1" fill={text2} opacity="0.3" />
    </svg>
  )
}

// ── ThemeCard ─────────────────────────────────────────────────────────────────

function ThemeCard({
  theme,
  dark,
  isActive,
  onClick,
}: {
  theme: ThemeDefinition
  dark: boolean
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={theme.label}
      className={`theme-card-v2 ${isActive ? 'theme-card-v2--active' : ''}`}
      style={{
        '--tc-water': theme.water,
        '--tc-gas':   theme.gas,
        '--tc-bg':    dark ? theme.bgDark : theme.bgLight,
      } as React.CSSProperties}
    >
      {/* Mini UI preview */}
      <div className="theme-card-v2-preview">
        <MiniPreview theme={theme} dark={dark} />
      </div>

      {/* Footer bar */}
      <div className="theme-card-v2-footer">
        <div className="theme-card-v2-dots">
          <span style={{ background: theme.water }} />
          <span style={{ background: theme.gas }} />
        </div>
        <span className="theme-card-v2-name">{theme.label}</span>
        {isActive && (
          <span className="theme-card-v2-check">
            <Check size={9} strokeWidth={3} />
          </span>
        )}
      </div>

      {/* Active glow ring */}
      {isActive && (
        <div
          className="theme-card-v2-ring"
          style={{ '--ring-color': theme.water } as React.CSSProperties}
        />
      )}
    </button>
  )
}

// ── Main ThemePicker Component ────────────────────────────────────────────────

interface ThemePickerProps {
  themes: ThemeDefinition[]
  currentTheme: ThemeName
  darkMode: boolean
  onSelect: (id: ThemeName) => void
}

export function ThemePicker({ themes, currentTheme, darkMode, onSelect }: ThemePickerProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [hoveredTheme, setHoveredTheme]     = useState<ThemeName | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const catScrollRef = useRef<HTMLDivElement>(null)

  const filteredThemes =
    activeCategory === 'all'
      ? themes
      : themes.filter(t =>
          CATEGORIES.find(c => c.id === activeCategory)?.ids.includes(t.id),
        )

  const previewTheme = hoveredTheme
    ? themes.find(t => t.id === hoveredTheme) ?? themes.find(t => t.id === currentTheme)!
    : themes.find(t => t.id === currentTheme)!

  const scrollGrid = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir === 'right' ? 220 : -220, behavior: 'smooth' })
  }

  // Sync category tabs scrolling on mobile
  useEffect(() => {
    const el = catScrollRef.current
    if (!el) return
    const active = el.querySelector('.tp-cat--active') as HTMLElement
    if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' })
  }, [activeCategory])

  return (
    <div className="tp-root">

      {/* ── Large Preview Panel ── */}
      <div className="tp-preview-panel">
        <div
          className="tp-preview-screen"
          style={{ '--tc-water': previewTheme.water, '--tc-gas': previewTheme.gas } as React.CSSProperties}
        >
          <MiniPreview theme={previewTheme} dark={darkMode} />

          {/* Overlaid label */}
          <div className="tp-preview-label">
            <span style={{ background: previewTheme.water }} className="tp-preview-dot" />
            <span>{hoveredTheme
              ? themes.find(t => t.id === hoveredTheme)?.label
              : themes.find(t => t.id === currentTheme)?.label}
            </span>
            {!hoveredTheme && (
              <span className="tp-preview-active-badge">
                <Sparkles size={9} />
                Ativo
              </span>
            )}
          </div>
        </div>

        {/* Water + Gas color pills */}
        <div className="tp-preview-colors">
          <div className="tp-color-pill">
            <Droplets size={11} color={previewTheme.water} />
            <span style={{ color: previewTheme.water }}>{previewTheme.water}</span>
          </div>
          <div className="tp-color-pill">
            <Flame size={11} color={previewTheme.gas} />
            <span style={{ color: previewTheme.gas }}>{previewTheme.gas}</span>
          </div>
        </div>
      </div>

      {/* ── Category Filter Tabs ── */}
      <div className="tp-cats-wrap" ref={catScrollRef}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`tp-cat ${activeCategory === cat.id ? 'tp-cat--active' : ''}`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
            {activeCategory === cat.id && (
              <span className="tp-cat-count">{cat.id === 'all' ? themes.length : cat.ids.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Grid + scroll buttons ── */}
      <div className="tp-grid-wrap">
        <button className="tp-scroll-btn tp-scroll-btn--left"  onClick={() => scrollGrid('left')}>
          <ChevronLeft size={14} />
        </button>

        <div
          className="tp-grid"
          ref={scrollRef}
        >
          {filteredThemes.map(t => (
            <div
              key={t.id}
              onMouseEnter={() => setHoveredTheme(t.id)}
              onMouseLeave={() => setHoveredTheme(null)}
            >
              <ThemeCard
                theme={t}
                dark={darkMode}
                isActive={currentTheme === t.id}
                onClick={() => onSelect(t.id)}
              />
            </div>
          ))}
        </div>

        <button className="tp-scroll-btn tp-scroll-btn--right" onClick={() => scrollGrid('right')}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Active theme name strip ── */}
      <div className="tp-active-strip">
        <span className="tp-active-label">Tema atual:</span>
        <span
          className="tp-active-name"
          style={{ color: themes.find(t => t.id === currentTheme)?.water }}
        >
          {themes.find(t => t.id === currentTheme)?.label}
        </span>
        <span className="tp-active-count">{themes.length} temas disponíveis</span>
      </div>

    </div>
  )
}
