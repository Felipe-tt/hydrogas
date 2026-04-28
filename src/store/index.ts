import { create }                          from 'zustand'
import type { Apartment, Reading, Config } from '../domain/entities'

// ── App Store ─────────────────────────────────────────────────────────────────

interface AppStore {
  apartments:    Apartment[]
  readings:      Reading[]
  config:        Config | null
  setApartments: (a: Apartment[]) => void
  setReadings:   (r: Reading[])   => void
  setConfig:     (c: Config)      => void
}

export const useAppStore = create<AppStore>(set => ({
  apartments: [],
  readings: [],
  config: null,
  setApartments: apartments => set({ apartments }),
  setReadings:   readings   => set({ readings }),
  setConfig:     config     => set({ config }),
}))

// ── UI Store ──────────────────────────────────────────────────────────────────

export type ThemeName =
  | 'ocean'     | 'emerald'   | 'rose'      | 'violet'    | 'amber'
  | 'slate'     | 'teal'      | 'crimson'   | 'indigo'    | 'mint'
  | 'sunset'    | 'nord'      | 'dracula'   | 'monokai'   | 'solarized'
  | 'sakura'    | 'arctic'    | 'forest'    | 'candy'     | 'lava'
  | 'neon'      | 'copper'    | 'midnight'  | 'sand'      | 'grape'
  | 'steel'     | 'peach'     | 'obsidian'  | 'aurora'    | 'cyberpunk'

export interface ThemeDefinition {
  id:       ThemeName
  label:    string
  /** Cor principal de water para preview */
  water:    string
  /** Cor principal de gas para preview */
  gas:      string
  /** Cor de fundo do card de preview (light) */
  bgLight:  string
  /** Cor de fundo do card de preview (dark) */
  bgDark:   string
}

export const THEMES: ThemeDefinition[] = [
  { id: 'ocean',      label: 'Ocean',      water: '#2563eb', gas: '#ea580c', bgLight: '#f0f4f8',  bgDark: '#080c14' },
  { id: 'emerald',    label: 'Emerald',    water: '#059669', gas: '#d97706', bgLight: '#ecfdf5',  bgDark: '#020f09' },
  { id: 'rose',       label: 'Rose',       water: '#e11d48', gas: '#7c3aed', bgLight: '#fff1f2',  bgDark: '#100008' },
  { id: 'violet',     label: 'Violet',     water: '#7c3aed', gas: '#db2777', bgLight: '#f5f3ff',  bgDark: '#08001a' },
  { id: 'amber',      label: 'Amber',      water: '#d97706', gas: '#0891b2', bgLight: '#fffbeb',  bgDark: '#100a00' },
  { id: 'slate',      label: 'Slate',      water: '#475569', gas: '#0f766e', bgLight: '#f1f5f9',  bgDark: '#060a12' },
  { id: 'teal',       label: 'Teal',       water: '#0d9488', gas: '#7c3aed', bgLight: '#f0fdfa',  bgDark: '#010f0e' },
  { id: 'crimson',    label: 'Crimson',    water: '#dc2626', gas: '#2563eb', bgLight: '#fff5f5',  bgDark: '#100000' },
  { id: 'indigo',     label: 'Indigo',     water: '#4338ca', gas: '#0891b2', bgLight: '#eef2ff',  bgDark: '#060514' },
  { id: 'mint',       label: 'Mint',       water: '#16a34a', gas: '#0891b2', bgLight: '#f0fdf4',  bgDark: '#010a04' },
  { id: 'sunset',     label: 'Sunset',     water: '#f97316', gas: '#7c3aed', bgLight: '#fff7ed',  bgDark: '#0f0500' },
  { id: 'nord',       label: 'Nord',       water: '#5e81ac', gas: '#bf616a', bgLight: '#eceff4',  bgDark: '#1c2030' },
  { id: 'dracula',    label: 'Dracula',    water: '#6272a4', gas: '#ff79c6', bgLight: '#f8f8fc',  bgDark: '#1e1f29' },
  { id: 'monokai',    label: 'Monokai',    water: '#75715e', gas: '#f92672', bgLight: '#f9f8f5',  bgDark: '#1c1d18' },
  { id: 'solarized',  label: 'Solarized',  water: '#268bd2', gas: '#cb4b16', bgLight: '#fdf6e3',  bgDark: '#002b36' },
  { id: 'sakura',     label: 'Sakura',     water: '#db2777', gas: '#059669', bgLight: '#fdf2f8',  bgDark: '#12000c' },
  { id: 'arctic',     label: 'Arctic',     water: '#0ea5e9', gas: '#64748b', bgLight: '#f0f9ff',  bgDark: '#020d18' },
  { id: 'forest',     label: 'Forest',     water: '#15803d', gas: '#92400e', bgLight: '#f0fdf4',  bgDark: '#010f06' },
  { id: 'candy',      label: 'Candy',      water: '#ec4899', gas: '#8b5cf6', bgLight: '#fff0fa',  bgDark: '#120010' },
  { id: 'lava',       label: 'Lava',       water: '#dc2626', gas: '#ea580c', bgLight: '#fff5f5',  bgDark: '#130000' },
  { id: 'neon',       label: 'Neon',       water: '#06b6d4', gas: '#84cc16', bgLight: '#f0fffe',  bgDark: '#020d10' },
  { id: 'copper',     label: 'Copper',     water: '#b45309', gas: '#065f46', bgLight: '#fffbf0',  bgDark: '#0e0800' },
  { id: 'midnight',   label: 'Midnight',   water: '#312e81', gas: '#1e40af', bgLight: '#f0f0ff',  bgDark: '#030310' },
  { id: 'sand',       label: 'Sand',       water: '#a16207', gas: '#b45309', bgLight: '#fefce8',  bgDark: '#100e00' },
  { id: 'grape',      label: 'Grape',      water: '#6d28d9', gas: '#be185d', bgLight: '#f6f0ff',  bgDark: '#0a0018' },
  { id: 'steel',      label: 'Steel',      water: '#1e3a5f', gas: '#374151', bgLight: '#f0f4f8',  bgDark: '#04090f' },
  { id: 'peach',      label: 'Peach',      water: '#ea580c', gas: '#db2777', bgLight: '#fff8f0',  bgDark: '#100500' },
  { id: 'obsidian',   label: 'Obsidian',   water: '#334155', gas: '#475569', bgLight: '#f8fafc',  bgDark: '#020408' },
  { id: 'aurora',     label: 'Aurora',     water: '#0891b2', gas: '#7c3aed', bgLight: '#f0fffe',  bgDark: '#010e14' },
  { id: 'cyberpunk',  label: 'Cyberpunk',  water: '#7c3aed', gas: '#eab308', bgLight: '#f5f0ff',  bgDark: '#06000f' },
]

function applyTheme(theme: ThemeName, dark: boolean) {
  document.documentElement.setAttribute('data-theme', `${theme}-${dark ? 'dark' : 'light'}`)
}

const VALID_THEMES = new Set<string>([
  'ocean','emerald','rose','violet','amber','slate','teal','crimson','indigo','mint',
  'sunset','nord','dracula','monokai','solarized','sakura','arctic','forest','candy',
  'lava','neon','copper','midnight','sand','grape','steel','peach','obsidian','aurora','cyberpunk',
])

const savedTheme = (() => {
  try {
    const s = localStorage.getItem('hidrogas-theme')
    if (s && VALID_THEMES.has(s)) return s as ThemeName
  } catch {}
  return 'ocean' as ThemeName
})()

const savedDark = (() => {
  try { const s = localStorage.getItem('hidrogas-dark-mode'); if (s !== null) return s === 'true' } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
})()

// Apply on load
applyTheme(savedTheme, savedDark)

interface UIStore {
  selectedMonth: number
  selectedYear:  number
  darkMode:      boolean
  theme:         ThemeName
  setMonth:      (m: number)    => void
  setYear:       (y: number)    => void
  setDarkMode:   (d: boolean)   => void
  setTheme:      (t: ThemeName) => void
}

const now = new Date()

export const useUIStore = create<UIStore>(set => ({
  selectedMonth: now.getMonth() + 1,
  selectedYear:  now.getFullYear(),
  darkMode:      savedDark,
  theme:         savedTheme,

  setMonth: selectedMonth => set({ selectedMonth }),
  setYear:  selectedYear  => set({ selectedYear }),

  setDarkMode: darkMode => {
    try { localStorage.setItem('hidrogas-dark-mode', String(darkMode)) } catch {}
    set(state => {
      applyTheme(state.theme, darkMode)
      return { darkMode }
    })
  },

  setTheme: theme => {
    try { localStorage.setItem('hidrogas-theme', theme) } catch {}
    set(state => {
      applyTheme(theme, state.darkMode)
      return { theme }
    })
  },
}))
