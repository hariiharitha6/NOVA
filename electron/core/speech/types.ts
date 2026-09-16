// NOVA v0.2 voice types. Platform-neutral. No Electron imports allowed here.

export type VoicePhase = 'idle' | 'listening' | 'processing' | 'success' | 'error'

export interface VoiceState {
  phase: VoicePhase
  /** Live partial transcript while listening. */
  partial: string
  /** Final transcript after a session ends. */
  transcript: string
  /** Human-readable detail for success/error/clarification states. */
  message: string
}

export const IDLE_VOICE_STATE: VoiceState = {
  phase: 'idle',
  partial: '',
  transcript: '',
  message: '',
}

export function idleVoiceState(): VoiceState {
  return { ...IDLE_VOICE_STATE }
}
