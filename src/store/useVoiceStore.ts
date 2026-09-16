import { create } from 'zustand'
import type { VoiceState } from '../../electron/core/speech/types'

interface VoiceStore {
  state: VoiceState
  setState: (state: VoiceState) => void
}

const INITIAL: VoiceState = { phase: 'idle', partial: '', transcript: '', message: '' }

export const useVoiceStore = create<VoiceStore>((set) => ({
  state: INITIAL,
  setState: (state) => set({ state }),
}))

export function useVoiceState(): VoiceState {
  return useVoiceStore((s) => s.state)
}
