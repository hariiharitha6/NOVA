import { useEffect } from 'react'
import { useVoiceStore } from '../store/useVoiceStore'
import { isNova } from './useNovaBridge'

/** Subscribes the renderer to main-process voice state changes. */
export function useVoiceBridge(): void {
  const setState = useVoiceStore((s) => s.setState)

  useEffect(() => {
    if (!isNova()) return
    window.nova
      .voiceStatus()
      .then(setState)
      .catch(() => {})
    const off = window.nova.onVoiceState(setState)
    return off
  }, [setState])
}
