import { useState, useEffect, useRef, useCallback } from 'react'

interface TiltState {
  needsPermission: boolean
  active: boolean
  isMobile: boolean
}

/**
 * Aplica o tilt via CSS custom properties no :root para evitar re-renders React.
 *
 * Estratégia por ambiente:
 *   iOS 13+          → pede permissão explícita (requestPermission)
 *   Android Chrome   → DeviceOrientation direto
 *   Brave / Firefox  → DeviceOrientation bloqueado → fallback mouse/touch
 *   PWA              → mesma lógica do browser base, com detecção de touch
 *   Desktop          → mousemove (parallax natural)
 *
 * Detecção de bloqueio do Brave/Firefox:
 *   Registra o listener e aguarda até 1 s por um evento com valores não-nulos.
 *   Se não chegar nenhum, cai para o fallback de mouse/touch.
 */
export function useGyroTilt(maxTilt = 8): TiltState & {
  requestPermission: () => void
} {
  const [state, setState] = useState<TiltState>({
    needsPermission: false,
    active: false,
    isMobile: false,
  })

  const targetRef  = useRef({ x: 0, y: 0 })
  const currentRef = useRef({ x: 0, y: 0 })
  const rafRef     = useRef<number | null>(null)
  const activeRef  = useRef(false)

  const clamp = useCallback((v: number, max: number) =>
    Math.max(-max, Math.min(max, v)), [])

  const stopRAF = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startRAF = useCallback(() => {
    if (rafRef.current !== null) return
    const animate = () => {
      const LERP = 0.1
      currentRef.current.x += (targetRef.current.x - currentRef.current.x) * LERP
      currentRef.current.y += (targetRef.current.y - currentRef.current.y) * LERP
      const nx = +currentRef.current.x.toFixed(3)
      const ny = +currentRef.current.y.toFixed(3)
      document.documentElement.style.setProperty('--gyro-x', String(nx))
      document.documentElement.style.setProperty('--gyro-y', String(ny))
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [])

  // ── Fallback: mouse (desktop) ou touch (mobile bloqueado) ──────────────────
  const startPointerFallback = useCallback((isMobile: boolean) => {
    if (activeRef.current) return
    activeRef.current = true

    if (isMobile) {
      const onTouch = (e: TouchEvent) => {
        const t = e.touches[0]
        if (!t) return
        const cx = window.innerWidth  / 2
        const cy = window.innerHeight / 2
        targetRef.current.y = clamp(((t.clientX - cx) / cx) * maxTilt, maxTilt)
        targetRef.current.x = clamp(((t.clientY - cy) / cy) * maxTilt * -1, maxTilt)
      }
      window.addEventListener('touchmove', onTouch, { passive: true })
      startRAF()
      setState(prev => ({ ...prev, active: true, isMobile: true }))
      return () => {
        window.removeEventListener('touchmove', onTouch)
        stopRAF()
        activeRef.current = false
      }
    }

    const onMouse = (e: MouseEvent) => {
      const cx = window.innerWidth  / 2
      const cy = window.innerHeight / 2
      targetRef.current.y = clamp(((e.clientX - cx) / cx) * maxTilt, maxTilt)
      targetRef.current.x = clamp(((e.clientY - cy) / cy) * maxTilt * -1, maxTilt)
    }
    window.addEventListener('mousemove', onMouse, { passive: true })
    startRAF()
    setState(prev => ({ ...prev, active: true, isMobile: false }))
    return () => {
      window.removeEventListener('mousemove', onMouse)
      stopRAF()
      activeRef.current = false
    }
  }, [maxTilt, startRAF, stopRAF, clamp])

  // ── DeviceOrientation com detecção de bloqueio (Brave/Firefox) ────────────
  const startMobileListening = useCallback((onBlocked?: () => void) => {
    if (activeRef.current) return
    activeRef.current = true

    let gotRealEvent = false
    const TIMEOUT_MS = 1000

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null && e.beta === null) return
      gotRealEvent = true
      const gamma = e.gamma ?? 0
      const beta  = e.beta  ?? 45
      targetRef.current.y = clamp(gamma / 3, maxTilt)
      targetRef.current.x = clamp((beta - 45) / 6, maxTilt)
    }

    window.addEventListener('deviceorientation', onOrientation, { passive: true })
    startRAF()
    setState(prev => ({ ...prev, active: true, isMobile: true }))

    const timeoutId = setTimeout(() => {
      if (!gotRealEvent) {
        window.removeEventListener('deviceorientation', onOrientation)
        stopRAF()
        activeRef.current = false
        onBlocked?.()
      }
    }, TIMEOUT_MS)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('deviceorientation', onOrientation)
      stopRAF()
      activeRef.current = false
    }
  }, [maxTilt, startRAF, stopRAF, clamp])

  const requestPermission = useCallback(async () => {
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission !== 'function') {
      setState(prev => ({ ...prev, needsPermission: false }))
      startMobileListening(() => startPointerFallback(true))
      return
    }
    try {
      const result = await DOE.requestPermission()
      if (result === 'granted') {
        setState(prev => ({ ...prev, needsPermission: false }))
        startMobileListening(() => startPointerFallback(true))
      }
    } catch {
      setState(prev => ({ ...prev, needsPermission: false }))
      startPointerFallback(true)
    }
  }, [startMobileListening, startPointerFallback])

  const isMobileDevice = useCallback(() => {
    const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
    const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      .test(navigator.userAgent)
    return hasTouch || uaMobile
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isMobile = isMobileDevice()

    if (!isMobile) {
      const cleanup = startPointerFallback(false)
      return () => { cleanup?.(); stopRAF(); activeRef.current = false }
    }

    if (!('DeviceOrientationEvent' in window)) {
      const cleanup = startPointerFallback(true)
      return () => { cleanup?.(); stopRAF(); activeRef.current = false }
    }

    const DOE = DeviceOrientationEvent as any

    if (typeof DOE.requestPermission === 'function') {
      setState(prev => ({ ...prev, needsPermission: true, isMobile: true }))
      return
    }

    const cleanup = startMobileListening(() => {
      startPointerFallback(true)
    })
    return () => { cleanup?.(); stopRAF(); activeRef.current = false }

  }, [isMobileDevice, startMobileListening, startPointerFallback, stopRAF])

  return { ...state, requestPermission }
}
