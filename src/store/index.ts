import { create }                          from 'zustand'
import type { Apartment, Reading, Config } from '../domain/entities'

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

interface UIStore {
  selectedMonth: number
  selectedYear:  number
  darkMode:      boolean
  setMonth:      (m: number)  => void
  setYear:       (y: number)  => void
  setDarkMode:   (d: boolean) => void
}

const now = new Date()
const savedDark = (() => {
  try { const s = localStorage.getItem('hidrogas-dark-mode'); if (s !== null) return s === 'true' } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
})()

export const useUIStore = create<UIStore>(set => ({
  selectedMonth: now.getMonth() + 1,
  selectedYear:  now.getFullYear(),
  darkMode:      savedDark,
  setMonth:      selectedMonth => set({ selectedMonth }),
  setYear:       selectedYear  => set({ selectedYear }),
  setDarkMode:   darkMode => {
    try { localStorage.setItem('hidrogas-dark-mode', String(darkMode)) } catch {}
    const root = document.documentElement
    darkMode ? root.setAttribute('data-theme', 'dark') : root.removeAttribute('data-theme')
    set({ darkMode })
  },
}))
