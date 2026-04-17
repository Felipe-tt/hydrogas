import { useEffect } from 'react'
import { apartmentRepo, readingRepo, configRepo } from '../lib/container'
import { useAppStore } from '../store'

export function useFirebaseSync() {
  const { setApartments, setReadings, setConfig } = useAppStore()

  useEffect(() => {
    const unsubApts     = apartmentRepo.subscribe(setApartments)
    const unsubReadings = readingRepo.subscribe(setReadings)
    const unsubConfig   = configRepo.subscribe(setConfig)
    return () => {
      unsubApts()
      unsubReadings()
      unsubConfig()
    }
  }, [])
}
