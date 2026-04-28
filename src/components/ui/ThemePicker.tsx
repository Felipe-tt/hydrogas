import { useState } from 'react'
import { Check, Droplets, Flame, Sparkles } from 'lucide-react'
import type { ThemeDefinition, ThemeName } from '../../store'

// ── Categorias ────────────────────────────────────────────────────────────────

const CATS: { id: string; label: string; ids: string[] }[] = [
  { id: 'all',      label: 'Todos',    ids: [] },
  { id: 'natureza', label: 'Natureza', ids: ['ocean','emerald','forest','mint','teal','arctic'] },
  { id: 'vibrante', label: 'Vibrante', ids: ['rose','violet','candy','sakura','grape','peach'] },
  { id: 'quente',   label: 'Quente',   ids: ['amber','sunset','lava','copper','sand','crimson'] },
  { id: 'tech',     label: 'Tech',     ids: ['neon','cyberpunk','dracula','monokai','nord','midnight'] },
  { id: 'sutil',    label: 'Sutil',    ids: ['slate','indigo','solarized','steel','obsidian','aurora'] },
]

// ── Mini UI SVG ───────────────────────────────────────────────────────────────

function MiniUI({ t, dark }: { t: ThemeDefinition; dark: boolean }) {
  const bg   = dark ? t.bgDark  : t.bgLight
  const card = dark ? '#1a1f2e' : '#ffffff'
  const mute = dark ? '#64748b' : '#94a3b8'
  const bdr  = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'
  return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect width="120" height="80" fill={bg} />
      {/* sidebar */}
      <rect width="20" height="80" fill={dark ? '#06090f' : '#0a0e1a'} />
      {[13,23,33,43].map((y,i)=>(
        <rect key={i} x="6" y={y} width="8" height="2.5" rx="1.25"
          fill={i===0 ? t.water : (dark?'#2a3040':'#1e2a3a')} opacity={i===0?1:0.3}/>
      ))}
      {/* main card */}
      <rect x="26" y="5" width="89" height="70" rx="4" fill={card} stroke={bdr} strokeWidth="0.5"/>
      {/* header */}
      <rect x="26" y="5" width="89" height="13" rx="4" fill={dark?'#151d2d':'#f8fafc'}/>
      <rect x="26" y="13" width="89" height="5" fill={dark?'#151d2d':'#f8fafc'}/>
      <rect x="31" y="9.5" width="22" height="2.5" rx="1.25" fill={dark?'#e2e8f0':'#0d1117'} opacity="0.8"/>
      <rect x="88" y="8.5" width="21" height="5" rx="2.5" fill={t.water} opacity="0.9"/>
      {/* kpi */}
      <rect x="31" y="24" width="37" height="14" rx="2.5" fill={dark?'#1e2a3d':'#f1f5f9'} stroke={bdr} strokeWidth="0.5"/>
      <rect x="72" y="24" width="37" height="14" rx="2.5" fill={dark?'#1e2a3d':'#f1f5f9'} stroke={bdr} strokeWidth="0.5"/>
      <circle cx="36" cy="29.5" r="2.5" fill={t.water}/>
      <rect x="41" y="28.5" width="10" height="2" rx="1" fill={t.water} opacity="0.8"/>
      <rect x="41" y="32"   width="7"  height="1.5" rx="0.75" fill={mute} opacity="0.7"/>
      <circle cx="77" cy="29.5" r="2.5" fill={t.gas}/>
      <rect x="82" y="28.5" width="10" height="2" rx="1" fill={t.gas} opacity="0.8"/>
      <rect x="82" y="32"   width="7"  height="1.5" rx="0.75" fill={mute} opacity="0.7"/>
      {/* chart */}
      <rect x="31" y="44" width="78" height="22" rx="2.5" fill={dark?'#1e2a3d':'#f8fafc'} stroke={bdr} strokeWidth="0.5"/>
      {([0,1,2,3,4,5] as number[]).map(i=>{
        const hw=[7,11,6,13,9,10][i], hg=[5,8,10,5,12,7][i], x=35+i*11
        return (
          <g key={i}>
            <rect x={x}   y={66-hw} width="4" height={hw} rx="1" fill={t.water} opacity="0.75"/>
            <rect x={x+5} y={66-hg} width="4" height={hg} rx="1" fill={t.gas}   opacity="0.75"/>
          </g>
        )
      })}
    </svg>
  )
}

// ── Card individual ───────────────────────────────────────────────────────────

function ThemeCard({ t, dark, active, onSelect, onHover, onLeave }: {
  t: ThemeDefinition; dark: boolean; active: boolean
  onSelect:()=>void; onHover:()=>void; onLeave:()=>void
}) {
  return (
    <button
      onClick={onSelect} onMouseEnter={onHover} onMouseLeave={onLeave}
      onFocus={onHover}  onBlur={onLeave}
      title={t.label}
      className={`tp-card${active?' tp-card--active':''}`}
      style={{'--tc-w':t.water,'--tc-g':t.gas} as React.CSSProperties}
    >
      <div className="tp-card-img"><MiniUI t={t} dark={dark}/></div>
      <div className="tp-card-foot">
        <span className="tp-dot" style={{background:t.water}}/>
        <span className="tp-dot" style={{background:t.gas}}/>
        <span className="tp-card-name">{t.label}</span>
        {active && <span className="tp-check"><Check size={8} strokeWidth={3.5}/></span>}
      </div>
      {active && <div className="tp-ring"/>}
    </button>
  )
}

// ── ThemePicker ───────────────────────────────────────────────────────────────

export function ThemePicker({ themes, currentTheme, darkMode, onSelect }: {
  themes: ThemeDefinition[]
  currentTheme: ThemeName
  darkMode: boolean
  onSelect: (id: ThemeName) => void
}) {
  const [cat, setCat]       = useState('all')
  const [hov, setHov]       = useState<string|null>(null)

  const current   = themes.find(t => t.id === currentTheme) ?? themes[0]
  const previewing = hov ? (themes.find(t=>t.id===hov) ?? current) : current

  const list = cat === 'all' ? themes
    : themes.filter(t => CATS.find(c=>c.id===cat)?.ids.includes(t.id))

  return (
    <div className="tp-root">

      {/* Preview + info */}
      <div className="tp-top">
        <div className="tp-screen" style={{'--tc-w':previewing.water} as React.CSSProperties}>
          <MiniUI t={previewing} dark={darkMode}/>
          <div className="tp-screen-foot">
            <span className="tp-sdot" style={{background:previewing.water}}/>
            <span className="tp-sname">{previewing.label}</span>
            {!hov && <span className="tp-sbadge"><Sparkles size={8}/>ativo</span>}
          </div>
        </div>
        <div className="tp-info">
          <div className="tp-pill"><Droplets size={10} color={previewing.water}/><span style={{color:previewing.water}}>{previewing.water}</span></div>
          <div className="tp-pill"><Flame    size={10} color={previewing.gas}/> <span style={{color:previewing.gas}}>{previewing.gas}</span></div>
          <span className="tp-count">{themes.length} temas</span>
        </div>
      </div>

      {/* Categorias */}
      <div className="tp-cats">
        {CATS.map(c=>(
          <button key={c.id} onClick={()=>setCat(c.id)}
            className={`tp-cat${cat===c.id?' tp-cat--on':''}`}>
            {c.label}
            {cat===c.id && <span className="tp-cat-n">{c.id==='all'?themes.length:c.ids.length}</span>}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="tp-scroll">
        <div className="tp-grid">
          {list.map(t=>(
            <ThemeCard key={t.id} t={t} dark={darkMode} active={currentTheme===t.id}
              onSelect={()=>onSelect(t.id as ThemeName)}
              onHover={()=>setHov(t.id)} onLeave={()=>setHov(null)}/>
          ))}
        </div>
      </div>

    </div>
  )
}
