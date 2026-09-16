// Wake-word controller. Owns the KWS lifecycle and false-trigger guardrails.
// Platform-neutral and dependency-injected so the whole flow (arm/disarm,
// detection, hand-off to STT, teardown) is unit-testable without a microphone,
// model, or WASM.
//
// Waking hand-off: when the wake phrase is detected while idle, this controller
// invokes `onWake()` (a thin wrapper around the voice controller's
// beginListening()), so the wake word converges onto the SAME STT /
// executeCommand pipeline as PTT. The wake phrase itself is never an input to
// executeCommand — the spotter only ever reports a boolean latch, never text.

import type { KeywordSpotter } from './keyword-spotter'
import type { VoicePhase } from './types'
import { KWS_COOLDOWN_MS, KWS_DEBOUNCE_MS } from './constants'
import { normalizeWakePhrase } from './wake-phrase'

export type WakeArmState = 'idle' | 'ready' | 'muted'

export interface WakeWordController {
  /** Whether the wake detector is currently armed and capturing. */
  isArmed(): boolean
  /** Whether the last (re)arm attempt succeeded; false when the keyword model
   * is missing/unsupported (detector genuinely unavailable). */
  isAvailable(): boolean
  /** Human-readable reason when the detector is unavailable. */
  getStatus(): string
  /** Recomputed from live state — arms when voice+wake enabled AND phase idle. */
  reconcile(): void
  /** Renderer microphone chunk fed while the detector is armed. */
  acceptAudio(samples: Float32Array): void
  /** React to the wakeWordEnabled config flag changing. */
  setEnabled(enabled: boolean): void
  /** Change the active wake phrase (normalizes; re-arms the detector). */
  setPhrase(phrase: string): boolean
  /** Shut down the detector and release all resources (idempotent). */
  dispose(): void
}

export interface WakeWordControllerDeps {
  spotter: KeywordSpotter
  isVoiceEnabled: () => boolean
  isWakeEnabled: () => boolean
  getPhase: () => VoicePhase
  /** Start a fresh STT listening session (the shared voice pipeline). */
  onWake: () => void
  /** Optional status broadcaster (e.g. surfaced to the renderer). */
  emit?: (armed: WakeArmState, status: string) => void
  /** Injectable clock for deterministic debounce/cooldown tests. */
  now?: () => number
}

export function createWakeWordController(deps: WakeWordControllerDeps): WakeWordController {
  const { spotter, isVoiceEnabled, isWakeEnabled, getPhase, onWake, emit } = deps
  const clock = deps.now ?? (() => Date.now())

  let armed = false
  let available = false
  let status = ''
  let initAttempted = false
  let phrase = ''
  let lastDetection = -Infinity
  let lastWakeAt = -Infinity
  let disposed = false
  // An explicit setEnabled() overrides isWakeEnabled(); null means "read live
  // from config". Keeps setEnabled and the enabled flag from ever diverging.
  let forcedEnabled: boolean | null = null

  function broadcast(state: WakeArmState, message: string): void {
    emit?.(state, message)
  }

  function wakeEnabledNow(): boolean {
    return forcedEnabled ?? isWakeEnabled()
  }

  function canRun(): boolean {
    return isVoiceEnabled() && wakeEnabledNow() && getPhase() === 'idle'
  }

  function initializeSpotter(): boolean {
    if (initAttempted) return available
    initAttempted = true
    try {
      spotter.setPhrase(phrase)
      spotter.initialize()
      available = true
      status = ''
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      available = false
      status = detail
      // Do not let an unusable spotter keep a stale stream.
      try {
        spotter.dispose()
      } catch {
        // ignore
      }
    }
    return available
  }

  function arm(): void {
    if (!initializeSpotter()) {
      broadcast('idle', status)
      return
    }
    spotter.start()
    armed = true
    broadcast('ready', '')
  }

  function disarm(): void {
    armed = false
    try {
      spotter.reset()
    } catch {
      // ignore
    }
    broadcast('idle', status)
  }

  function reconcile(): void {
    if (disposed) return
    if (canRun()) {
      if (!armed) arm()
    } else if (armed) {
      disarm()
    }
      // When not enabled we also tear down so no resources linger.
      if (!isVoiceEnabled() || !wakeEnabledNow()) {
        // initAttempted stays false so we re-verify lazily on next arm.
        initAttempted = false
        available = false
        try {
          spotter.dispose()
        } catch {
          // ignore
        }
      }
  }

  return {
    isArmed(): boolean {
      return armed
    },
    isAvailable(): boolean {
      return available
    },
    getStatus(): string {
      return status
    },
    reconcile,
    acceptAudio(samples: Float32Array): void {
      if (!armed || !canRun()) return
      const now = clock()
      if (now - lastDetection < KWS_DEBOUNCE_MS) return
      try {
        spotter.acceptAudio(samples)
      } catch {
        // A spotter failure must never crash NOVA; fall back to idle.
        disarm()
        return
      }
      if (!spotter.isDetected()) return
      if (now - lastWakeAt < KWS_COOLDOWN_MS) {
        // Cooldown: the phrase was just used; ignore repeated triggering.
        lastDetection = now
        spotter.reset()
        return
      }
      lastDetection = now
      lastWakeAt = now
      // Hand off to a fresh STT listening session. The wake phrase is never
      // sent anywhere — onWake() begins listening; KWS is disarmed by the
      // phase transition to 'listening' via reconcile().
      spotter.reset()
      try {
        onWake()
      } finally {
        broadcast('muted', '')
        // If the phase did not change (e.g. voice got disabled mid-trigger),
        // make sure KWS returns to a consistent (disarmed) state.
        reconcile()
      }
    },
    setEnabled(enabled: boolean): void {
      forcedEnabled = enabled
      if (!enabled) {
        armed = false
        initAttempted = false
        available = false
        spotter.dispose()
        broadcast('idle', '')
      }
      reconcile()
    },
    setPhrase(raw: string): boolean {
      const normalized = normalizeWakePhrase(raw)
      if (normalized === null) return false
      if (normalized === phrase) {
        reconcile()
        return true
      }
      phrase = normalized
      // The phrase changed: the previous model may no longer be valid.
      initAttempted = false
      available = false
      armed = false
      try {
        spotter.dispose()
      } catch {
        // ignore
      }
      spotter.setPhrase(phrase)
      reconcile()
      return true
    },
    dispose(): void {
      disposed = true
      armed = false
      initAttempted = false
      available = false
      status = ''
      try {
        spotter.dispose()
      } catch {
        // ignore
      }
      broadcast('idle', '')
    },
  }
}
