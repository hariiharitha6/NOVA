// Voice controller state machine. Platform-neutral and dependency-injected so
// the whole PTT/listening/finalize flow is unit-testable without WASM/microphone.
//
// Voice only ever produces TEXT. The controller hands the final transcript to
// the exact same command pipeline used by typed commands (executeCommand);
// it never re-implements app matching, aliases, or launching.

import type { CommandResponse } from '../types'
import type { SpeechRecognizer } from './recognizer'
import type { VoiceState } from './types'
import { idleVoiceState } from './types'
import { INACTIVITY_TIMEOUT_MS, MAX_LISTENING_MS, RESULT_DISPLAY_MS } from './constants'

export interface VoiceControllerDeps {
  recognizer: SpeechRecognizer
  /** Whether voice is currently enabled (read live from config). */
  isEnabled: () => boolean
  /** The shared command pipeline (identical to typed-command execution). */
  executeCommand: (input: string) => Promise<CommandResponse>
  /** Broadcast a state change to the UI (main process -> renderer windows). */
  emit: (state: VoiceState) => void
}

export interface VoiceController {
  getState(): VoiceState
  /** PTT toggle: IDLE -> LISTENING, LISTENING -> stop & execute. */
  togglePtt(): void
  /**
   * Begin listening explicitly from a non-active state. Shared by PTT and the
   * wake-word hand-off so both converge onto the same STT pipeline. Ignored
   * unless the phase is IDLE/success/error and voice is enabled.
   */
  beginListening(): void
  /** Escape: cancel the active listening session. */
  cancelListening(): void
  /** Incoming Float32 PCM chunk from the renderer mic capture. */
  acceptAudio(samples: Float32Array): void
  /** Renderer reported a microphone failure (permission/unavailable). */
  micError(message: string): void
  /** React to the voiceEnabled config flag changing. */
  setEnabled(enabled: boolean): void
  dispose(): void
}

export function createVoiceController(deps: VoiceControllerDeps): VoiceController {
  const { recognizer, isEnabled, executeCommand, emit } = deps

  let state: VoiceState = idleVoiceState()
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null
  let resultTimer: ReturnType<typeof setTimeout> | null = null
  let sessionId = 0

  function setState(next: VoiceState): void {
    state = next
    emit(state)
  }

  function clearTimers(): void {
    if (maxTimer !== null) clearTimeout(maxTimer)
    if (inactivityTimer !== null) clearTimeout(inactivityTimer)
    if (resultTimer !== null) clearTimeout(resultTimer)
    maxTimer = null
    inactivityTimer = null
    resultTimer = null
  }

  function toIdle(): void {
    clearTimers()
    setState(idleVoiceState())
  }

  function fail(message: string): void {
    clearTimers()
    try {
      recognizer.cancel()
    } catch {
      // ignore: recognizer teardown must never throw into the caller
    }
    setState({
      phase: 'error',
      partial: '',
      transcript: '',
      message,
    })
    resultTimer = setTimeout(toIdle, RESULT_DISPLAY_MS)
  }

  function armInactivity(): void {
    if (inactivityTimer !== null) clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(stopAndExecute, INACTIVITY_TIMEOUT_MS)
  }

  function beginListening(): void {
    clearTimers()
    try {
      recognizer.initialize()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      fail(`Speech engine unavailable (${detail})`)
      return
    }
    recognizer.start()
    sessionId += 1
    setState({ phase: 'listening', partial: '', transcript: '', message: '' })
    maxTimer = setTimeout(stopAndExecute, MAX_LISTENING_MS)
  }

  async function stopAndExecute(): Promise<void> {
    if (state.phase !== 'listening') return
    clearTimers()

    const sid = sessionId
    let transcript = ''
    try {
      transcript = recognizer.finishAndGetTranscript().trim()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      fail(`Recognition failed (${detail})`)
      return
    }

    if (!transcript) {
      toIdle()
      return
    }

    setState({ phase: 'processing', partial: '', transcript, message: '' })

    let response: CommandResponse
    try {
      response = await executeCommand(transcript)
    } catch (error) {
      if (sid !== sessionId) return
      const detail = error instanceof Error ? error.message : String(error)
      fail(`Command failed (${detail})`)
      return
    }
    if (sid !== sessionId) return

    if (response.kind === 'launched') {
      if (response.result.ok) {
        setState({
          phase: 'success',
          partial: '',
          transcript,
          message: `Launched ${response.result.label}`,
        })
      } else {
        setState({
          phase: 'error',
          partial: '',
          transcript,
          message: response.result.message || `Could not launch ${response.result.label}`,
        })
      }
    } else {
      const suggestion = response.action.suggestions?.length
        ? ` Did you mean: ${response.action.suggestions.join(', ')}?`
        : ''
      setState({
        phase: 'error',
        partial: '',
        transcript,
        message: `${response.action.label}${suggestion}`,
      })
    }
    resultTimer = setTimeout(toIdle, RESULT_DISPLAY_MS)
  }

  return {
    getState(): VoiceState {
      return { ...state }
    },
    beginListening(): void {
      if (!isEnabled()) return
      if (state.phase === 'idle' || state.phase === 'success' || state.phase === 'error') {
        beginListening()
      }
    },
    togglePtt(): void {
      if (!isEnabled()) return
      if (state.phase === 'idle' || state.phase === 'success' || state.phase === 'error') {
        beginListening()
      } else if (state.phase === 'listening') {
        void stopAndExecute()
      }
      // processing: ignore the toggle until the current command settles.
    },
    cancelListening(): void {
      if (state.phase !== 'listening') return
      clearTimers()
      try {
        recognizer.cancel()
      } catch {
        // ignore
      }
      toIdle()
    },
    acceptAudio(samples: Float32Array): void {
      if (state.phase !== 'listening') return
      try {
        recognizer.acceptAudio(samples)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        fail(`Recognition error (${detail})`)
        return
      }
      const partial = recognizer.partialTranscript()
      if (inactivityTimer === null) armInactivity()
      if (partial !== state.partial) {
        setState({ ...state, partial })
        armInactivity()
      }
    },
    micError(message: string): void {
      if (state.phase !== 'listening') return
      fail(`Microphone unavailable (${message})`)
    },
    setEnabled(enabled: boolean): void {
      if (!enabled) {
        if (state.phase === 'listening') {
          clearTimers()
          try {
            recognizer.cancel()
          } catch {
            // ignore
          }
          setState(idleVoiceState())
        } else if (state.phase !== 'processing') {
          toIdle()
        }
        try {
          recognizer.dispose()
        } catch {
          // ignore
        }
      }
    },
    dispose(): void {
      clearTimers()
      try {
        recognizer.dispose()
      } catch {
        // ignore
      }
    },
  }
}
