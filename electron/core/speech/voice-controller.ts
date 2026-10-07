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
import { stripWakePhraseFromTranscript } from './wake-phrase'
import { DEFAULT_WAKE_PHRASE, INACTIVITY_TIMEOUT_MS, MAX_LISTENING_MS, RESULT_DISPLAY_MS } from './constants'

export interface VoiceControllerDeps {
  recognizer: SpeechRecognizer
  /** Whether voice is currently enabled (read live from config). */
  isEnabled: () => boolean
  /**
   * The user's configured wake phrase as a string (used to strip the phrase
   * that bleeds into the STT transcript when a wake hand-off starts mid-phrase).
   * Defaults to the canonical "Hey NOVA" when not provided.
   */
  getWakePhrase?: () => string
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
  /**
   * V03-S4: the pending confirmation was settled somewhere else (the overlay's
   * Confirm/Cancel buttons, a spoken "yes"/"no", or the gate's timeout). Return
   * to IDLE so the indicator never claims to still be waiting.
   */
  clearConfirmation(): void
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
  const getWakePhrase = deps.getWakePhrase ?? (() => DEFAULT_WAKE_PHRASE)

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
    // While a confirmation is pending the ONLY thing that should settle the
    // prompt is a spoken answer, the overlay buttons, or the gate's own
    // timeout. Silently finalising an empty "confirmation session" over and
    // over (restart stream -> idle -> restart) just churns the recognizer, so
    // the inactivity timer is never armed in that phase.
    if (state.phase === 'confirming') return
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

  /** Phase from which a new listening session (PTT or wake hand-off) may start. */
  function canStartListening(): boolean {
    return (
      state.phase === 'idle' ||
      state.phase === 'success' ||
      state.phase === 'error' ||
      // A pending confirmation must stay answerable by voice ("yes" / "no").
      state.phase === 'confirming'
    )
  }

  /**
   * Open a fresh STT stream after a session was finished. Used to keep the
   * microphone path warm while a confirmation prompt is pending so the spoken
   * answer is captured without a second PTT press.
   */
  function restartRecognizerSession(): void {
    try {
      recognizer.start()
    } catch {
      // The gate (not the recognizer) owns the prompt lifetime; if the engine
      // cannot reopen a stream, the answer simply has to come from the overlay.
    }
  }

  async function stopAndExecute(): Promise<void> {
    const fromPhase = state.phase
    // 'confirming' is accepted as well: that is how a spoken "yes" / "no"
    // (or a superseding command) is captured while the prompt is on screen.
    if (fromPhase !== 'listening' && fromPhase !== 'confirming') return
    clearTimers()

    const sid = sessionId
    let transcript = ''
    try {
      const raw = recognizer.finishAndGetTranscript().trim()
      // A wake hand-off starts the STT session mid-phrase, so the wake phrase
      // itself often bleeds into the first partial ("Hey NOVA open chrome").
      // Strip it here so the shared pipeline only ever sees the real command;
      // a bare wake phrase ("Hey NOVA" alone) must execute nothing.
      transcript = stripWakePhraseFromTranscript(raw, getWakePhrase()).trim()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      fail(`Recognition failed (${detail})`)
      return
    }

    if (!transcript) {
      if (fromPhase === 'confirming') {
        // Silence is not an answer: reopen a clean stream so the user can still
        // say "yes"/"no", but do NOT re-arm the inactivity loop. The gate's own
        // timeout remains the only way an unanswered prompt expires, and a
        // silence-only session no longer churns the recognizer.
        restartRecognizerSession()
        return
      }
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
    } else if (response.kind === 'clarification') {
      const suggestion = response.action.suggestions?.length
        ? ` Did you mean: ${response.action.suggestions.join(', ')}?`
        : ''
      setState({
        phase: 'error',
        partial: '',
        transcript,
        message: `${response.action.label}${suggestion}`,
      })
    } else if (response.kind === 'result') {
      setState({
        phase: response.result.success ? 'success' : 'error',
        partial: '',
        transcript,
        message: response.result.message,
      })
    } else if (response.kind === 'confirmation') {
      // V03-S4: HELD at the gate. Nothing was executed. This phase owns no
      // result timer — the gate owns the lifetime and settles the prompt via
      // Confirm/Cancel, a spoken "yes"/"no", or its own timeout.
      setState({
        phase: 'confirming',
        partial: '',
        transcript,
        message: `${response.request.prompt} Say "yes" to confirm or "no" to cancel.`,
      })
      // Stay hot: reopen the STT stream immediately so the spoken answer is
      // captured without the user having to press PTT again.
      restartRecognizerSession()
      return
    } else if (response.kind === 'cancelled') {
      if (response.reason === 'user') {
        // An explicit rejection is not an error: straight back to idle.
        toIdle()
        return
      }
      setState({
        phase: 'error',
        partial: '',
        transcript,
        message: response.message,
      })
    } else {
      setState({
        phase: 'error',
        partial: '',
        transcript,
        message: 'Unknown response',
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
      if (canStartListening()) {
        beginListening()
      }
    },
    togglePtt(): void {
      if (!isEnabled()) return
      if (canStartListening()) {
        beginListening()
      } else if (state.phase === 'listening') {
        void stopAndExecute()
      }
      // processing: ignore the toggle until the current command settles.
    },
    cancelListening(): void {
      if (state.phase !== 'listening' && state.phase !== 'confirming') return
      clearTimers()
      try {
        recognizer.cancel()
      } catch {
        // ignore
      }
      toIdle()
    },
    clearConfirmation(): void {
      if (state.phase !== 'confirming') return
      try {
        recognizer.cancel()
      } catch {
        // ignore
      }
      toIdle()
    },
    acceptAudio(samples: Float32Array): void {
      if (state.phase !== 'listening' && state.phase !== 'confirming') return
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
      // Endpoint detection (sherpa trailing-silence rules) means the speaker
      // finished. Finalise NOW instead of waiting for the inactivity/max
      // timers: that is what makes "say the command and stop talking" submit
      // immediately, and what lets a spoken "yes"/"no" settle the prompt
      // without a second PTT press.
      //
      // A bare endpoint is NEVER enough on its own: if the partial is empty we
      // are still in the silence-before-speech region (sherpa rule 1) and must
      // not finalise — doing so would submit nothing and drop the session
      // before the user had a chance to speak. This applies to 'confirming'
      // too, so a silence-only "answer attempt" never churns the recognizer.
      if (recognizer.isEndpoint?.() && partial.trim()) {
        void stopAndExecute()
      }
    },
    micError(message: string): void {
      if (state.phase !== 'listening' && state.phase !== 'confirming') return
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
