import { useEffect } from 'react'
import { useNovaStore } from '../store/useNovaStore'

export const isNova = (): boolean => typeof window !== 'undefined' && 'nova' in window

export function useNovaBridge(onOverlayShown?: () => void): void {
  const setConfig = useNovaStore((s) => s.setConfig)
  const hydrate = useNovaStore((s) => s.hydrate)

  useEffect(() => {
    if (!isNova()) return
    hydrate().catch(() => {})
    const offConfig = window.nova.onConfigChanged(setConfig)
    const offShown = onOverlayShown ? window.nova.onOverlayShown(onOverlayShown) : () => {}
    return () => {
      offConfig()
      offShown()
    }
  }, [hydrate, setConfig, onOverlayShown])
}
