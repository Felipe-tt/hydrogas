import { useState, useEffect, useRef, useCallback } from 'react'

interface TiltState {
  needsPermission: boolean
  active: boolean
  isMobile: boolean
}

/**
 * Aplica o tilt via CSS custom properties no :root para evitar re-renders React
 * no RAF. Os cards lêem --gyro-x e --gyro-y direto no CSS/style inline.
 * 
 * - Mobile: usa DeviceOrientation (giroscópio/acelerômetro)
 * - Desktop: usa resize/movimento da janela
 */
export function useGyroTilt(maxTilt = 8): TiltState & {
  requestPermission: () => void
} {
  const [state, setState] = useState<TiltState>({
    needsPermission: false,
    active: false,
    isMobile: false,
  })

  const valuesRef  = useRef({ x: 0, y: 0 })
  const targetRef  = useRef({ x: 0, y: 0 })
  const currentRef = useRef({ x: 0, y: 0 })
  const rafRef     = useRef<number | null>(null)
  const activeRef  = useRef(false)
  const isMobileRef = useRef(false)

  const clamp = useCallback((v: number, max: number) => Math.max(-max, Math.min(max, v)), [])

  const stopRAF = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startRAF = useCallback(() => {
    if (rafRef.current !== null) return

    const animate = () => {
      const LERP = 0.12
      currentRef.current.x += (targetRef.current.x - currentRef.current.x) * LERP
      currentRef.current.y += (targetRef.current.y - currentRef.current.y) * LERP

      const nx = +currentRef.current.x.toFixed(3)
      const ny = +currentRef.current.y.toFixed(3)

      // Escreve direto no CSS — zero re-render React
      document.documentElement.style.setProperty('--gyro-x', String(nx))
      document.documentElement.style.setProperty('--gyro-y', String(ny))

      valuesRef.current = { x: nx, y: ny }
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  // Mobile: DeviceOrientation
  const startMobileListening = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    isMobileRef.current = true

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null && e.beta === null) return
      const gamma = e.gamma ?? 0
      const beta  = e.beta  ?? 45
      targetRef.current.y = clamp(gamma / 3, maxTilt)
      targetRef.current.x = clamp((beta - 45) / 6, maxTilt)
    }

    window.addEventListener('deviceorientation', onOrientation, { passive: true })
    startRAF()
    setState(prev => ({ ...prev, active: true, isMobile: true }))

    return () => {
      window.removeEventListener('deviceorientation', onOrientation)
      stopRAF()
      activeRef.current = false
    }
  }, [maxTilt, startRAF, stopRAF, clamp])

  // Desktop: resize da janela
  const startDesktopListening = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    isMobileRef.current = false

    const updateFromWindowSize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      
      // Calcula tilt baseado nas proporções da janela
      // Quanto mais diferente de 16:9 (1.77), mais tilt
      const baseRatio = 1.77 // 16:9 como referência
      const currentRatio = width / height
      const ratioDiff = (currentRatio - baseRatio) / baseRatio
      
      // Normaliza altura (1080p como referência)
      const heightNorm = (height - 1080) / 1080
      
      // Aplica tilt (invertido pra sensação natural)
      targetRef.current.x = clamp(ratioDiff * maxTilt * 1.5, maxTilt)
      targetRef.current.y = clamp(heightNorm * maxTilt * 0.8, maxTilt)
    }

    // Listeners
    window.addEventListener('resize', updateFromWindowSize)
    
    // Detector de movimento da janela (mudança de posição/monitor)
    let lastX = window.screenX
    let lastY = window.screenY
    const checkWindowMove = () => {
      if (window.screenX !== lastX || window.screenY !== lastY) {
        lastX = window.screenX
        lastY = window.screenY
        // Movimento lateral influencia Y, movimento vertical influencia X
        targetRef.current.x = clamp((lastY % 200 - 100) / 100 * maxTilt * 0.5, maxTilt)
        targetRef.current.y = clamp((lastX % 200 - 100) / 100 * maxTilt * 0.5, maxTilt)
      }
      requestAnimationFrame(checkWindowMove)
    }
    
    const moveInterval = setInterval(checkWindowMove, 100)
    
    updateFromWindowSize()
    startRAF()
    setState(prev => ({ ...prev, active: true, isMobile: false }))

    return () => {
      window.removeEventListener('resize', updateFromWindowSize)
      clearInterval(moveInterval)
      stopRAF()
      activeRef.current = false
    }
  }, [maxTilt, startRAF, stopRAF, clamp])

  const requestPermission = useCallback(async () => {
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission !== 'function') {
      setState(prev => ({ ...prev, needsPermission: false }))
      startMobileListening()
      return
    }
    try {
      const result = await DOE.requestPermission()
      if (result === 'granted') {
        setState(prev => ({ ...prev, needsPermission: false }))
        startMobileListening()
      }
    } catch {
      /* user denied */
    }
  }, [startMobileListening])

  // Detecta se é mobile
  const isMobileDevice = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isMobile = isMobileDevice()

    if (!isMobile) {
      // Desktop: usa resize/movimento da janela
      const cleanup = startDesktopListening()
      return () => {
        cleanup?.()
        stopRAF()
        activeRef.current = false
      }
    }

    // Mobile: usa DeviceOrientation
    if (!('DeviceOrientationEvent' in window)) return

    const DOE = DeviceOrientationEvent as any

    // iOS 13+: precisa de permissão explícita
    if (typeof DOE.requestPermission === 'function') {
      setState(prev => ({ ...prev, needsPermission: true, isMobile: true }))
      return
    }

    // Android: inicia direto
    const cleanup = startMobileListening()
    return () => {
      cleanup?.()
      stopRAF()
      activeRef.current = false
    }
  }, [isMobileDevice, startDesktopListening, startMobileListening, stopRAF])

  return {
    ...state,
    requestPermission,
  }
}
