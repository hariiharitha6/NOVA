import { useEffect } from 'react'
import { useWakeStore } from '../store/useWakeStore'
import { isNova } from './useNovaBridge'

/** Subscribes the renderer to main-process wake-word status changes. */
export function useWakeBridge(): void {
  const setStatus = useWakeStore((s) => s.setStatus)

  useEffect(() => {
    if (!isNova()) return
    window.nova
      .wakeStatus()
      .then(setStatus)
      .catch(() => {})
    const off = window.nova.onWakeStatus(setStatus)
    return off
  }, [setStatus])
}