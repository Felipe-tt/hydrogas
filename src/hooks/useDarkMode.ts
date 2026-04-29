import { useEffect, useState } from 'react'

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('hidrogas-dark-mode')
      if (saved !== null) return saved === 'true'
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.setAttribute('data-theme', 'dark')
    } else {
      root.removeAttribute('data-theme')
    }
    try { localStorage.setItem('hidrogas-dark-mode', String(dark)) } catch {}
  }, [dark])

  return { dark, toggle: () => setDark(d => !d), setDark }
}
