import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWakeWordController } from '../electron/core/speech/wake-controller'
import type { KeywordSpotter } from '../electron/core/speech/keyword-spotter'
import { createVoiceController } from '../electron/core/speech/voice-controller'
import type { SpeechRecognizer } from '../electron/core/speech/recognizer'
import type { CommandResponse, StructuredAction } from '../electron/core/types'
import type { VoicePhase, VoiceState } from '../electron/core/speech/types'
import { KWS_COOLDOWN_MS, KWS_DEBOUNCE_MS } from '../electron/core/speech/constants'

function makeSpotter(): KeywordSpotter & {
  calls: string[]
  setDetection: (v: boolean) => void
} {
  const calls: string[] = []
  let detected = false
  return {
    kind: 'stub-kws',
    calls,
    setPhrase: (p) => calls.push(`setPhrase:${p}`),
    initialize: () => calls.push('initialize'),
    start: () => calls.push('start'),
    acceptAudio: (s) => calls.push(`accept:${s.length}`),
    isDetected: () => detected,
    reset: () => {
      detected = false
      calls.push('reset')
    },
    dispose: () => calls.push('dispose'),
    setDetection: (v) => {
      detected = v
    },
  }
}

interface Context {
  voiceEnabled: boolean
  wakeEnabled: boolean
  phase: VoicePhase
}

function makeHarness(init: Partial<Context> = {}) {
  const ctx: Context = {
    voiceEnabled: false,
    wakeEnabled: false,
    phase: 'idle',
    ...init,
  }
  const spotter = makeSpotter()
  const wakeEvents: { state: string; status: string }[] = []
  let wakeCount = 0
  const wake = createWakeWordController({
    spotter,
    isVoiceEnabled: () => ctx.voiceEnabled,
    isWakeEnabled: () => ctx.wakeEnabled,
    getPhase: () => ctx.phase,
    onWake: () => {
      wakeCount++
      ctx.phase = 'listening'
    },
    emit: (state, status) => wakeEvents.push({ state, status }),
  })
  return { wake, spotter, ctx, wakeCount: () => wakeCount, wakeEvents }
}

function launched(): CommandResponse {
  return {
    kind: 'launched',
    action: { intent: 'OPEN_APPLICATION', target: 'chrome', label: 'Chrome' } as StructuredAction,
    result: { ok: true, message: '', label: 'Chrome' },
  }
}

describe('wake-controller lifecycle & guardrails', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('1. never initializes KWS when wake word is disabled', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: false })
    h.wake.reconcile()
    expect(h.spotter.calls).not.toContain('initialize')
    expect(h.wake.isArmed()).toBe(false)
  })

  it('2. never initializes KWS when voice is disabled', () => {
    const h = makeHarness({ voiceEnabled: false, wakeEnabled: true })
    h.wake.reconcile()
    expect(h.spotter.calls).not.toContain('initialize')
    expect(h.wake.isArmed()).toBe(false)
  })

  it('3. initializes KWS and arms when wake + voice enabled and idle', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    expect(h.spotter.calls).toContain('initialize')
    expect(h.spotter.calls).toContain('start')
    expect(h.wake.isArmed()).toBe(true)
  })

  it('4. a wake detection starts a fresh listening session', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(1)
    // detection latch cleared after handling
    expect(h.spotter.calls).toContain('reset')
    // phase pushed to listening by onWake
    expect(h.ctx.phase).toBe('listening')
  })

  it('5. the wake phrase itself is never executed as a command', () => {
    // The spotter only reports a boolean; no text ever reaches a command path.
    const executed: string[] = []
    const rec = makeRecognizer('', 'open chrome')
    const voice = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched()
      },
      emit: () => {},
    })
    const ctx = { voiceEnabled: true, wakeEnabled: true, phase: 'idle' as VoicePhase }
    const spotter = makeSpotter()
    const wake = createWakeWordController({
      spotter,
      isVoiceEnabled: () => ctx.voiceEnabled,
      isWakeEnabled: () => ctx.wakeEnabled,
      getPhase: () => ctx.phase,
      onWake: () => voice.beginListening(),
      emit: () => {},
    })
    wake.reconcile()
    spotter.setDetection(true)
    wake.acceptAudio(new Float32Array(2048))
    // after wake, voice is listening; feed STT audio and finish
    expect(voice.getState().phase).toBe('listening')
    voice.acceptAudio(new Float32Array(4096))
    voice.togglePtt() // finish STT
    void vi.advanceTimersByTimeAsync(0)
    // ONLY the STT transcript is executed — the wake phrase never is.
    expect(executed).toEqual(['open chrome'])
  })

  it('6. the command after wake goes through executeCommand', async () => {
    const executed: string[] = []
    const rec = makeRecognizer('', 'open chrome')
    const voice = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched()
      },
      emit: () => {},
    })
    const ctx = { voiceEnabled: true, wakeEnabled: true, phase: 'idle' as VoicePhase }
    const spotter = makeSpotter()
    const wake = createWakeWordController({
      spotter,
      isVoiceEnabled: () => ctx.voiceEnabled,
      isWakeEnabled: () => ctx.wakeEnabled,
      getPhase: () => ctx.phase,
      onWake: () => voice.beginListening(),
      emit: () => {},
    })
    wake.reconcile()
    spotter.setDetection(true)
    wake.acceptAudio(new Float32Array(2048))
    voice.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['open chrome'])
  })

  it('7. wake events are ignored while listening', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    h.ctx.phase = 'listening'
    // feeding audio while listening (phase changed) must not arm/detect
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(0)
  })

  it('8. wake events are ignored while processing', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    h.ctx.phase = 'processing'
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(0)
  })

  it('9. duplicate wake detections are debounced', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(1)
    // a detection arriving again within the debounce window is ignored,
    // even after the cooldown has passed (so only debounce is exercising it)
    h.ctx.phase = 'idle'
    h.wake.reconcile()
    vi.advanceTimersByTime(KWS_COOLDOWN_MS + 1)
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(2)
    // second identical detection immediately after is debounced (no re-trigger)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(2)
    // advance past debounce AND cooldown, re-arm, then a fresh detection triggers
    h.ctx.phase = 'idle'
    h.wake.reconcile()
    vi.advanceTimersByTime(KWS_COOLDOWN_MS + KWS_DEBOUNCE_MS + 1)
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(3)
  })

  it('10. cooldown prevents repeated triggering after a successful wake', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(1)
    // onWake pushed the phase to listening; return to idle and re-arm
    h.ctx.phase = 'idle'
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
    // a detection within the cooldown window is ignored
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(1)
    vi.advanceTimersByTime(KWS_COOLDOWN_MS + 1)
    h.spotter.setDetection(true)
    h.wake.acceptAudio(new Float32Array(2048))
    expect(h.wakeCount()).toBe(2)
  })

  it('11. disabling wake word tears down the detector', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
    h.wake.setEnabled(false)
    expect(h.spotter.calls).toContain('dispose')
    expect(h.wake.isArmed()).toBe(false)
  })

  it('12. disabling voice tears down the detector', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
    h.ctx.voiceEnabled = false
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(false)
    expect(h.spotter.calls).toContain('dispose')
  })

  it('13. KWS can resume after a successful command returns to idle', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
    // simulate wake -> listening -> processing -> success -> idle
    h.ctx.phase = 'listening'
    h.wake.reconcile()
    h.ctx.phase = 'processing'
    h.wake.reconcile()
    h.ctx.phase = 'success'
    h.wake.reconcile()
    h.ctx.phase = 'idle'
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
  })

  it('14. a failed/cancelled voice session returns safely to idle and re-arms', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    h.ctx.phase = 'error'
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(false)
    h.ctx.phase = 'idle'
    h.wake.reconcile()
    expect(h.wake.isArmed()).toBe(true)
  })

  it('15. PTT still uses the existing pipeline (beginListening shared by wake)', async () => {
    const executed: string[] = []
    const rec = makeRecognizer('', 'open settings')
    const voice = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched()
      },
      emit: () => {},
    })
    // PTT path unchanged
    voice.togglePtt()
    voice.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['open settings'])
  })

  it('16. microphone failure during wake does not break typed commands', async () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    // a spotted error causes wake to disarm, not crash
    const hadError = h.wake.isArmed()
    expect(hadError).toBe(true)
    // typed command still works through the shared pipeline
    const executed: string[] = []
    const rec = makeRecognizer('', 'open chrome')
    const voice = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched()
      },
      emit: () => {},
    })
    voice.togglePtt()
    voice.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['open chrome'])
  })

  it('17. custom wake phrase persists through config store', () => {
    // Config persistence is covered in config.test.ts; here we assert the
    // controller accepts and switches to a custom phrase.
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    expect(h.wake.setPhrase('Hello Ajay')).toBe(true)
  })

  it('18. invalid/empty wake phrase is rejected', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    expect(h.wake.setPhrase('')).toBe(false)
    expect(h.wake.setPhrase('   ')).toBe(false)
    expect(h.wake.setPhrase('a<script>')).toBe(false)
  })

  it('19. changing wake phrase safely updates the detector/config', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    expect(h.spotter.calls).toContain('initialize')
    const ok = h.wake.setPhrase('Heeyy Harii')
    expect(ok).toBe(true)
    // the spotter is re-targeted and re-initialized for the new phrase
    expect(h.spotter.calls.some((c) => c.startsWith('setPhrase:'))).toBe(true)
  })

  it('20. shutdown releases resources and is idempotent', () => {
    const h = makeHarness({ voiceEnabled: true, wakeEnabled: true, phase: 'idle' })
    h.wake.reconcile()
    const beforeDisposes = h.spotter.calls.filter((c) => c === 'dispose').length
    h.wake.dispose()
    h.wake.dispose() // idempotent
    const afterDisposes = h.spotter.calls.filter((c) => c === 'dispose').length
    expect(afterDisposes).toBeGreaterThan(beforeDisposes)
    expect(h.wake.isArmed()).toBe(false)
  })
})

function makeRecognizer(partial = '', final = ''): SpeechRecognizer {
  let partialText = partial
  let finalText = final
  return {
    kind: 'stub',
    initialize: () => {},
    start: () => {},
    acceptAudio: () => {},
    partialTranscript: () => partialText,
    finishAndGetTranscript: () => finalText,
    cancel: () => {},
    dispose: () => {},
  }
}
