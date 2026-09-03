import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVoiceController } from '../electron/core/speech/voice-controller'
import type { SpeechRecognizer } from '../electron/core/speech/recognizer'
import type { CommandResponse, StructuredAction } from '../electron/core/types'
import type { VoiceState } from '../electron/core/speech/types'
import { RESULT_DISPLAY_MS } from '../electron/core/speech/constants'

function makeRecognizer(partial = '', final = ''): SpeechRecognizer & {
  calls: string[]
  setPartial: (v: string) => void
  setFinal: (v: string) => void
} {
  const calls: string[] = []
  let partialText = partial
  let finalText = final
  return {
    kind: 'stub',
    initialize: () => calls.push('initialize'),
    start: () => calls.push('start'),
    acceptAudio: (samples) => calls.push(`accept:${samples.length}`),
    partialTranscript: () => partialText,
    finishAndGetTranscript: () => {
      calls.push('finish')
      return finalText
    },
    cancel: () => calls.push('cancel'),
    dispose: () => calls.push('dispose'),
    setPartial: (v) => {
      partialText = v
    },
    setFinal: (v) => {
      finalText = v
    },
    calls,
  }
}

function launched(label: string): CommandResponse {
  return {
    kind: 'launched',
    action: { intent: 'OPEN_APPLICATION', target: 'chrome', label } as StructuredAction,
    result: { ok: true, message: '', label },
  }
}

function clarification(label: string): CommandResponse {
  return {
    kind: 'clarification',
    action: { intent: 'CLARIFICATION', target: '', label } as StructuredAction,
  }
}

describe('voice-controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores PTT when voice is disabled', () => {
    const rec = makeRecognizer()
    const emitted: VoiceState[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => false,
      executeCommand: async () => launched('x'),
      emit: (s) => emitted.push(s),
    })
    ctrl.togglePtt()
    expect(rec.calls).toEqual([])
    expect(emitted).toEqual([])
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('enters LISTENING on PTT toggle and initializes the engine lazily', () => {
    const rec = makeRecognizer()
    const emitted: VoiceState[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('Chrome'),
      emit: (s) => emitted.push(s),
    })
    ctrl.togglePtt()
    expect(rec.calls).toContain('initialize')
    expect(rec.calls).toContain('start')
    expect(ctrl.getState().phase).toBe('listening')
    expect(emitted.at(-1)?.phase).toBe('listening')
  })

  it('exposes partial transcripts while audio is fed in', () => {
    const rec = makeRecognizer()
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('x'),
      emit: () => {},
    })
    ctrl.togglePtt()
    rec.setPartial('launch ch')
    ctrl.acceptAudio(new Float32Array(4096))
    expect(ctrl.getState().partial).toBe('launch ch')
    rec.setPartial('launch chrome')
    ctrl.acceptAudio(new Float32Array(4096))
    expect(ctrl.getState().partial).toBe('launch chrome')
    expect(rec.calls).toContain('accept:4096')
  })

  it('flushes to IDLE when a session ends with no speech', async () => {
    const rec = makeRecognizer()
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('x'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt() // stop
    await vi.advanceTimersByTimeAsync(0)
    expect(rec.calls).toContain('finish')
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('executes the transcript through the shared pipeline and reports success', async () => {
    const rec = makeRecognizer()
    rec.setFinal('launch chrome')
    const executed: string[] = []
    const emitted: VoiceState[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Chrome')
      },
      emit: (s) => emitted.push(s),
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['launch chrome'])
    expect(ctrl.getState().phase).toBe('success')
    expect(ctrl.getState().message).toBe('Launched Chrome')
    expect(emitted.map((s) => s.phase)).toContain('processing')

    vi.advanceTimersByTime(RESULT_DISPLAY_MS + 1)
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('shows a clarification-style error for unrecognized commands', async () => {
    const rec = makeRecognizer()
    rec.setFinal('make me a sandwich')
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => clarification('Not sure what "make me a sandwich" means'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('error')
    expect(ctrl.getState().message).toContain('make me a sandwich')
  })

  it('mic error aborts the listening session and auto-returns to idle', async () => {
    const rec = makeRecognizer()
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('x'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.micError('permission denied')
    expect(ctrl.getState().phase).toBe('error')
    expect(ctrl.getState().message).toContain('permission denied')
    expect(rec.calls).toContain('cancel')
    vi.advanceTimersByTime(RESULT_DISPLAY_MS + 1)
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('cancel (Escape) returns to IDLE and discards the session', () => {
    const rec = makeRecognizer()
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('x'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.cancelListening()
    expect(rec.calls).toContain('cancel')
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('setEnabled(false) disposes the engine during a session', () => {
    const rec = makeRecognizer()
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('x'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.setEnabled(false)
    expect(rec.calls).toContain('dispose')
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('voice error returns to a recoverable state (can listen again)', async () => {
    const rec = makeRecognizer()
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('x'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.micError('permission denied')
    expect(ctrl.getState().phase).toBe('error')
    vi.advanceTimersByTime(RESULT_DISPLAY_MS + 1)
    expect(ctrl.getState().phase).toBe('idle')
    ctrl.togglePtt()
    expect(ctrl.getState().phase).toBe('listening')
  })

  it('mic error discards the session without executing a command', () => {
    const rec = makeRecognizer()
    let executed = 0
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => {
        executed++
        return launched('x')
      },
      emit: () => {},
    })
    ctrl.togglePtt()
    rec.setFinal('open chrome')
    ctrl.micError('permission denied')
    expect(ctrl.getState().phase).toBe('error')
    expect(executed).toBe(0)
  })

  it('cancellation (Escape) discards the session without executing', () => {
    const rec = makeRecognizer()
    rec.setFinal('open chrome')
    let executed = 0
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => {
        executed++
        return launched('x')
      },
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.cancelListening()
    expect(ctrl.getState().phase).toBe('idle')
    expect(executed).toBe(0)
    expect(rec.calls).toContain('cancel')
  })

  it('partial transcripts never execute — only the final result runs once', async () => {
    const rec = makeRecognizer()
    rec.setFinal('open chrome')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Chrome')
      },
      emit: () => {},
    })
    ctrl.togglePtt()
    rec.setPartial('open ch')
    ctrl.acceptAudio(new Float32Array(4096))
    rec.setPartial('open chro')
    ctrl.acceptAudio(new Float32Array(4096))
    expect(executed).toEqual([])
    ctrl.togglePtt() // finish
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['open chrome'])
    // Repeated finalization (e.g. endpoint) must not double-execute.
    ctrl.togglePtt() // from state 'success' -> ignored? success is a restart trigger
    expect(executed).toHaveLength(1)
  })

  it('ignores PTT toggles while processing a command', async () => {
    const rec = makeRecognizer()
    rec.setFinal('launch chrome')
    let resolveCommand: (r: CommandResponse) => void = () => {}
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: () =>
        new Promise<CommandResponse>((resolve) => {
          resolveCommand = resolve
        }),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt() // -> processing
    expect(ctrl.getState().phase).toBe('processing')
    ctrl.togglePtt() // must be ignored while processing
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('processing')
    resolveCommand(launched('Chrome'))
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('success')
  })
})
