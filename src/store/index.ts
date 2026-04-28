import { create } from 'zustand'
import { persist }  from 'zustand/middleware'
import type { Apartment, Reading, Config } from '../domain/entities'

// ── Theme definitions ─────────────────────────────────────────────────────────
export const THEMES = [
  { id: 'blue',   label: 'Azul',    water: '#3b82f6', gas: '#f59e0b' },
  { id: 'purple', label: 'Roxo',    water: '#8b5cf6', gas: '#ec4899' },
  { id: 'green',  label: 'Verde',   water: '#10b981', gas: '#f97316' },
  { id: 'teal',   label: 'Teal',    water: '#06b6d4', gas: '#f43f5e' },
] as const

export type ThemeId = typeof THEMES[number]['id']

// ── App store (data) ──────────────────────────────────────────────────────────
interface AppState {
  apartments: Apartment[]
  readings:   Reading[]
  config:     Config | null

  setApartments: (apartments: Apartment[]) => void
  setReadings:   (readings: Reading[])     => void
  setConfig:     (config: Config)          => void
}

export const useAppStore = create<AppState>()((set) => ({
  apartments: [],
  readings:   [],
  config:     null,

  setApartments: (apartments) => set({ apartments }),
  setReadings:   (readings)   => set({ readings }),
  setConfig:     (config)     => set({ config }),
}))

// ── UI store (persisted preferences) ─────────────────────────────────────────
interface UIState {
  darkMode:      boolean
  theme:         ThemeId
  selectedMonth: number
  selectedYear:  number

  setDarkMode: (v: boolean)   => void
  setTheme:    (v: ThemeId)   => void
  setMonth:    (v: number)    => void
  setYear:     (v: number)    => void
}

const now = new Date()

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      darkMode:      true,
      theme:         'blue',
      selectedMonth: now.getMonth() + 1,
      selectedYear:  now.getFullYear(),

      setDarkMode: (darkMode) => set({ darkMode }),
      setTheme:    (theme)    => set({ theme }),
      setMonth:    (selectedMonth) => set({ selectedMonth }),
      setYear:     (selectedYear)  => set({ selectedYear }),
    }),
    { name: 'hidrogas-ui-prefs' },
  ),
)
