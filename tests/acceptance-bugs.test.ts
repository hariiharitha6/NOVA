/**
 * V0.3 acceptance bugs (1–8) — regression suite.
 *
 * Each block locks the behaviour the acceptance report asked for:
 *   1/7  a spoken command submits when the ENGINE says the speaker finished
 *        (endpoint detection), not only on a second PTT press or a timeout.
 *   2    a pending confirmation can be answered with a spoken "yes"/"no".
 *   3/4  favorites / recents are recognised (incl. "Show recent") and returned
 *        as the same list result the overlay renders.
 *   5    "Open Windows settings" reaches the OS Settings app, while "Open
 *        settings" still means NOVA's own settings window.
 *   6    focus on a non-running app keeps the V03-S3-003 wording and now tells
 *        the user how to start it.
 *   8    re-arming the keyword spotter frees the previous stream (no leak) and
 *        a KWS failure can never break the voice state machine.
 *
 * No GUI, no microphone, no network.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCommand } from '../electron/core/command-engine'
import type { CommandSource } from '../electron/core/command-engine'
import { confirmPendingCommand, executeCommand } from '../electron/core/command-pipeline'
import type { CommandPipelineDeps } from '../electron/core/command-pipeline'
import { classifyRisk, requiresConfirmation, trustedTargets } from '../electron/core/risk-policy'
import {
  CONFIRMATION_TIMEOUT_MS,
  createConfirmationGate,
} from '../electron/core/confirmation'
import type { ConfirmationGate, ConfirmationOutcome } from '../electron/core/confirmation'
import { createVoiceController } from '../electron/core/speech/voice-controller'
import type { SpeechRecognizer } from '../electron/core/speech/recognizer'
import type { CommandResponse, StructuredAction } from '../electron/core/types'
import { defaultConfig } from '../electron/core/types'
import { executeFocusApplication } from '../electron/core/app-focus-executor'
import { createWakeWordController } from '../electron/core/speech/wake-controller'
import { SherpaKeywordSpotter } from '../electron/core/speech/sherpa-kws'
import {
  DEFAULT_KWS_MODEL_NAME,
  INACTIVITY_TIMEOUT_MS,
} from '../electron/core/speech/constants'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPS = [
  {
    id: 'app-notepad',
    name: 'Notepad',
    aliases: ['notepad'],
    path: 'C:\\Windows\\notepad.exe',
  },
]

const registry: CommandSource = {
  apps: APPS,
  websites: [],
  fileFolders: [],
}

const SNAPSHOT = { apps: APPS, websites: [], fileFolders: [] }

const openGates: ConfirmationGate[] = []

interface Harness {
  deps: CommandPipelineDeps
  gate: ConfirmationGate
  launched: StructuredAction[]
  settled: Array<{ outcome: ConfirmationOutcome; token: string }>
}

function makeHarness(): Harness {
  const launched: StructuredAction[] = []
  const settled: Array<{ outcome: ConfirmationOutcome; token: string }> = []
  const gate = createConfirmationGate({
    timeoutMs: CONFIRMATION_TIMEOUT_MS,
    onSettled: (outcome, request) => settled.push({ outcome, token: request.token }),
  })
  openGates.push(gate)

  const config = {
    ...defaultConfig(),
    favorites: ['app-notepad'],
    recents: [{ id: 'open_application:notepad', label: 'Notepad' }],
  }

  const deps: CommandPipelineDeps = {
    registry: { snapshot: async () => SNAPSHOT },
    launcher: {
      launch: async (action: StructuredAction) => {
        launched.push(action)
        return { ok: true, message: '', label: action.label }
      },
    },
    configStore: {
      get: () => config,
      update: () => config,
      recordRecent: () => config,
    },
    openSettings: () => {},
    confirmation: gate,
  }
  return { deps, gate, launched, settled }
}

afterEach(() => {
  while (openGates.length > 0) openGates.pop()?.dispose()
})

// ---------------------------------------------------------------------------
// Voice-controller fixtures
// ---------------------------------------------------------------------------

interface TestRecognizer extends SpeechRecognizer {
  calls: string[]
  setPartial: (value: string) => void
  setFinal: (value: string) => void
  setEndpoint: (value: boolean) => void
}

function makeRecognizer(options: { endpointSupport?: boolean } = {}): TestRecognizer {
  const calls: string[] = []
  let partialText = ''
  let finalText = ''
  let endpoint = false

  const rec: TestRecognizer = {
    kind: 'stub',
    calls,
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
    setPartial: (value) => {
      partialText = value
    },
    setFinal: (value) => {
      finalText = value
    },
    setEndpoint: (value) => {
      endpoint = value
    },
  }
  if (options.endpointSupport !== false) {
    rec.isEndpoint = () => {
      calls.push('endpoint')
      return endpoint
    }
  }
  return rec
}

function launched(label: string): CommandResponse {
  return {
    kind: 'launched',
    action: { intent: 'OPEN_APPLICATION', target: 'notepad', label } as StructuredAction,
    result: { ok: true, message: '', label },
  }
}

function listResult(kind: 'favorites' | 'recents'): CommandResponse {
  return {
    kind: 'result',
    result: {
      success: true,
      intent: kind === 'favorites' ? 'SHOW_FAVORITES' : 'SHOW_RECENTS',
      message: kind === 'favorites' ? 'Here are your favorites.' : 'Here are your recent apps.',
      data: { kind, items: [{ id: 'app-notepad', label: 'Notepad' }], total: 1 },
    },
  }
}

function confirmationResponse(): CommandResponse {
  return {
    kind: 'confirmation',
    request: {
      token: 'tok-1',
      risk: 'MEDIUM',
      intent: 'OPEN_APPLICATION',
      prompt: 'Open Notepad?',
      expiresInMs: CONFIRMATION_TIMEOUT_MS,
    },
  }
}

function drain(): Promise<void> {
  return vi.advanceTimersByTimeAsync(0).then(() => undefined)
}

// ===========================================================================
// Bugs 1 & 7 — endpoint-driven auto-submit
// ===========================================================================

describe('acceptance Bugs 1/7: a spoken command submits when the speaker stops', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('finalises on the engine endpoint without a second PTT press', async () => {
    const rec = makeRecognizer()
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Notepad')
      },
      emit: () => {},
    })

    ctrl.togglePtt()
    expect(ctrl.getState().phase).toBe('listening')

    rec.setPartial('open notepad')
    rec.setFinal('open notepad')
    rec.setEndpoint(true)
    ctrl.acceptAudio(new Float32Array(4096))
    // Only microtasks are drained — no timer was advanced, so the command was
    // NOT submitted by the inactivity or max-listening timeouts.
    await drain()

    expect(executed).toEqual(['open notepad'])
    expect(ctrl.getState().phase).toBe('success')
    expect(rec.calls).toContain('finish')
  })

  it('endpoint silence with no speech never kills the session', async () => {
    const rec = makeRecognizer()
    rec.setEndpoint(true)
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched('x')
      },
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.acceptAudio(new Float32Array(4096))
    await drain()

    expect(executed).toEqual([])
    expect(ctrl.getState().phase).toBe('listening')
  })

  it('the wake-word hand-off also auto-submits on endpoint (Bug 7)', async () => {
    const rec = makeRecognizer()
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Notepad')
      },
      emit: () => {},
    })

    // This is exactly what the wake controller calls on a detection.
    ctrl.beginListening()
    expect(ctrl.getState().phase).toBe('listening')

    rec.setPartial('open notepad')
    rec.setFinal('open notepad')
    rec.setEndpoint(true)
    ctrl.acceptAudio(new Float32Array(4096))
    await drain()

    expect(executed).toEqual(['open notepad'])
    expect(ctrl.getState().phase).toBe('success')
  })

  it('a recognizer without endpoint support keeps the timer fallback', async () => {
    const rec = makeRecognizer({ endpointSupport: false })
    rec.setFinal('open notepad')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Notepad')
      },
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.acceptAudio(new Float32Array(4096))
    expect(executed).toEqual([])

    await vi.advanceTimersByTimeAsync(INACTIVITY_TIMEOUT_MS + 1)
    expect(executed).toEqual(['open notepad'])
  })

  it('endpoint-driven submit never waits for the max-listening timeout', async () => {
    const rec = makeRecognizer()
    rec.setPartial('open notepad')
    rec.setFinal('open notepad')
    rec.setEndpoint(true)
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return launched('Notepad')
      },
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.acceptAudio(new Float32Array(4096))
    await drain()
    expect(executed).toHaveLength(1)

    // Any later chunk must not execute the command a second time.
    ctrl.acceptAudio(new Float32Array(4096))
    await drain()
    expect(executed).toHaveLength(1)
  })
})

// ===========================================================================
// Bug 2 — spoken "yes" / "no" while a confirmation is pending
// ===========================================================================

describe('acceptance Bug 2: the pending prompt can be answered by voice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the session hot and reopens the stream for the spoken answer', async () => {
    const rec = makeRecognizer()
    rec.setFinal('open notepad')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        executed.push(input)
        return executed.length === 1 ? confirmationResponse() : launched('Notepad')
      },
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.togglePtt()
    await drain()

    expect(executed).toEqual(['open notepad'])
    expect(ctrl.getState().phase).toBe('confirming')
    expect(ctrl.getState().message).toContain('Say "yes" to confirm')
    // The stream is reopened immediately so the answer needs no second press.
    expect(rec.calls.filter((c) => c === 'start').length).toBeGreaterThanOrEqual(2)

    rec.setPartial('yes')
    rec.setFinal('yes')
    rec.setEndpoint(true)
    ctrl.acceptAudio(new Float32Array(4096))
    await drain()

    expect(executed).toEqual(['open notepad', 'yes'])
    expect(ctrl.getState().phase).toBe('success')
  })

  it('accepts audio while confirming (the answer is captured, not dropped)', async () => {
    const rec = makeRecognizer()
    rec.setFinal('open notepad')
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => confirmationResponse(),
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.togglePtt()
    await drain()
    expect(ctrl.getState().phase).toBe('confirming')

    const before = rec.calls.length
    rec.setPartial('ye')
    ctrl.acceptAudio(new Float32Array(4096))
    expect(rec.calls.length).toBeGreaterThan(before)
    expect(ctrl.getState().partial).toBe('ye')
  })

  it('silence while confirming keeps the prompt alive (never drops to idle, never churns)', async () => {
    const rec = makeRecognizer()
    rec.setFinal('open notepad')
    rec.setEndpoint(true)
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => confirmationResponse(),
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.togglePtt()
    await drain()
    expect(ctrl.getState().phase).toBe('confirming')

    const startsBefore = rec.calls.filter((c) => c === 'start').length
    const finishesBefore = rec.calls.filter((c) => c === 'finish').length
    // A silence-only endpoint (empty partial) must NOT finalise the prompt: no
    // 'finish', no stream restart, no inactivity churn. The gate's own timeout
    // remains the only thing that expires it.
    ctrl.acceptAudio(new Float32Array(4096))
    await drain()

    expect(ctrl.getState().phase).toBe('confirming')
    expect(rec.calls.filter((c) => c === 'start').length).toBe(startsBefore)
    expect(rec.calls.filter((c) => c === 'finish').length).toBe(finishesBefore)
  })

  it('clearConfirmation (overlay button / timeout) stops capture and goes idle', async () => {
    const rec = makeRecognizer()
    rec.setFinal('open notepad')
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => confirmationResponse(),
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.togglePtt()
    await drain()
    expect(ctrl.getState().phase).toBe('confirming')

    ctrl.clearConfirmation()
    expect(ctrl.getState().phase).toBe('idle')
    expect(rec.calls).toContain('cancel')
  })

  it('a NEW command spoken during the prompt supersedes it (gate stays single-use)', async () => {
    const rec = makeRecognizer()
    const spoken = ['open notepad', 'show recents']
    const responses: CommandResponse[] = [confirmationResponse(), listResult('recents')]
    let call = 0
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        expect(input).toBe(spoken[call])
        call += 1
        return responses[call - 1] ?? listResult('recents')
      },
      emit: () => {},
    })

    ctrl.togglePtt()
    rec.setFinal(spoken[0])
    await drain()
    ctrl.acceptAudio(new Float32Array(4096))
    rec.setEndpoint(false)
    ctrl.togglePtt()
    await drain()
    expect(ctrl.getState().phase).toBe('confirming')

    // Speak a different command instead of yes/no.
    ctrl.beginListening()
    rec.setFinal(spoken[1])
    rec.setPartial(spoken[1])
    rec.setEndpoint(true)
    ctrl.acceptAudio(new Float32Array(4096))
    await drain()

    expect(call).toBe(2)
    expect(ctrl.getState().phase).toBe('success')
  })
})

// ===========================================================================
// Bugs 3 & 4 — favorites / recents recognition and delivery
// ===========================================================================

describe('acceptance Bugs 3/4: favorites and recents', () => {
  it('recognises the singular "Show recent" as SHOW_RECENTS (was a clarification)', () => {
    expect(resolveCommand('Show recent', registry)).toMatchObject({
      intent: 'SHOW_RECENTS',
    })
    expect(resolveCommand('Show recents', registry)).toMatchObject({ intent: 'SHOW_RECENTS' })
    expect(resolveCommand('recent', registry)).toMatchObject({ intent: 'SHOW_RECENTS' })
  })

  it('recognises favorites in singular and plural', () => {
    expect(resolveCommand('Show favorites', registry)).toMatchObject({
      intent: 'SHOW_FAVORITES',
    })
    expect(resolveCommand('Show favorite', registry)).toMatchObject({
      intent: 'SHOW_FAVORITES',
    })
    expect(resolveCommand('favorites', registry)).toMatchObject({ intent: 'SHOW_FAVORITES' })
  })

  it('typed and voice "Show recents" return the SAME list payload', async () => {
    const { deps } = makeHarness()

    const typed = await executeCommand('Show recents', deps)
    const voice = await executeCommand('Show recent', deps, { source: 'voice' })

    for (const response of [typed, voice]) {
      expect(response.kind).toBe('result')
      if (response.kind !== 'result') throw new Error('unreachable')
      expect(response.result.success).toBe(true)
      const data = response.result.data
      if (!data || data.kind !== 'recents') throw new Error('unreachable')
      expect(data.items).toEqual([{ id: 'open_application:notepad', label: 'Notepad' }])
      expect(data.total).toBe(1)
    }
  })

  it('typed and voice "Show favorites" return the SAME list payload', async () => {
    const { deps } = makeHarness()

    const typed = await executeCommand('Show favorites', deps)
    const voice = await executeCommand('Show favorites', deps, { source: 'voice' })

    for (const response of [typed, voice]) {
      expect(response.kind).toBe('result')
      if (response.kind !== 'result') throw new Error('unreachable')
      const data = response.result.data
      if (!data || data.kind !== 'favorites') throw new Error('unreachable')
      expect(data.items).toEqual([{ id: 'app-notepad', label: 'Notepad' }])
      expect(data.total).toBe(1)
    }
  })

  it('an empty favorites list still answers with a result (never a clarification)', async () => {
    const { deps } = makeHarness()
    const empty: CommandPipelineDeps = {
      ...deps,
      configStore: { ...deps.configStore, get: () => ({ ...defaultConfig(), favorites: [] }) },
    }
    const response = await executeCommand('Show favorites', empty)
    expect(response.kind).toBe('result')
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.message).toContain('No favorites')
  })

  it('a spoken list result flows through the exact same pipeline as typed input', async () => {
    const { deps } = makeHarness()
    const rec = makeRecognizer({ endpointSupport: false })
    rec.setFinal('Show recents')
    const captured: CommandResponse[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => {
        const response = await executeCommand(input, deps, { source: 'voice' })
        captured.push(response)
        return response
      },
      emit: () => {},
    })

    ctrl.togglePtt()
    ctrl.togglePtt()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(captured).toHaveLength(1)
    const response = captured[0]
    if (!response || response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.data?.kind).toBe('recents')
    expect(ctrl.getState().phase).toBe('success')
    ctrl.dispose()
  })
})

// ===========================================================================
// Bug 5 — Windows Settings vs NOVA settings
// ===========================================================================

describe('acceptance Bug 5: Windows Settings intent', () => {
  it('recognises Windows/system settings, while "Open settings" stays NOVA settings', () => {
    expect(resolveCommand('Open Windows settings', registry)).toMatchObject({
      intent: 'OPEN_SYSTEM_SETTINGS',
    })
    expect(resolveCommand('Open system settings', registry)).toMatchObject({
      intent: 'OPEN_SYSTEM_SETTINGS',
    })
    expect(resolveCommand('open windows settings', registry)).toMatchObject({
      intent: 'OPEN_SYSTEM_SETTINGS',
    })
    expect(resolveCommand('Open settings', registry)).toMatchObject({ intent: 'OPEN_SETTINGS' })
    expect(resolveCommand('settings', registry)).toMatchObject({ intent: 'OPEN_SETTINGS' })
  })

  it('classifies OPEN_SYSTEM_SETTINGS as MEDIUM (starts a process)', () => {
    const action: StructuredAction = {
      intent: 'OPEN_SYSTEM_SETTINGS',
      target: '',
      label: 'Open Windows Settings',
    }
    expect(classifyRisk(action, trustedTargets(SNAPSHOT))).toBe('MEDIUM')
    expect(requiresConfirmation('MEDIUM')).toBe(true)
  })

  it('is gated: nothing runs until the prompt is answered, then the launcher is called', async () => {
    const { deps, gate, launched } = makeHarness()

    const held = await executeCommand('Open Windows settings', deps)
    expect(held.kind).toBe('confirmation')
    expect(launched).toHaveLength(0)

    if (held.kind !== 'confirmation') throw new Error('unreachable')
    const approved = await confirmPendingCommand(held.request.token, deps)
    expect(approved.kind).toBe('launched')
    expect(launched).toHaveLength(1)
    expect(launched[0].intent).toBe('OPEN_SYSTEM_SETTINGS')
    expect(gate.pending()).toBeNull()
  })

  it('the typed and voice paths are gated identically', async () => {
    const { deps, launched } = makeHarness()

    const typed = await executeCommand('Open Windows settings', deps)
    const voice = await executeCommand('Open Windows settings', deps, { source: 'voice' })

    expect(typed.kind).toBe('confirmation')
    expect(voice.kind).toBe('confirmation')
    expect(launched).toHaveLength(0)
  })

  it('NOVA settings stays a LOW-risk local action (never reaches the launcher)', async () => {
    const { deps, launched } = makeHarness()
    const response = await executeCommand('Open settings', deps)
    expect(response.kind).toBe('result')
    expect(launched).toHaveLength(0)
  })
})

// ===========================================================================
// Bug 6 — focus on a non-running application
// ===========================================================================

describe('acceptance Bug 6: focus on an app that is not running', () => {
  it('keeps the required wording and tells the user how to start it', async () => {
    const result = await executeFocusApplication(
      { intent: 'FOCUS_APPLICATION', target: APPS[0].path, label: 'Notepad' },
      { focusService: { focusApplication: async () => ({ outcome: 'not-running' }) } },
    )

    expect(result.ok).toBe(false)
    // V03-S3-003 requires this exact phrase to remain visible…
    expect(result.message).toContain("Notepad isn't currently running.")
    // …and acceptance Bug 6 requires the actionable follow-up.
    expect(result.message).toContain('Open Notepad')
  })

  it('still never converts not-running into a launch', async () => {
    const launches: string[] = []
    const result = await executeFocusApplication(
      { intent: 'FOCUS_APPLICATION', target: APPS[0].path, label: 'Notepad' },
      {
        focusService: {
          focusApplication: async () => {
            launches.push('focus')
            return { outcome: 'not-running' }
          },
        },
      },
    )
    expect(result.ok).toBe(false)
    expect(launches).toEqual(['focus'])
  })
})

// ===========================================================================
// Bug 8 — wake-word reliability
// ===========================================================================

const MODEL_DIR = join(__dirname, '..', 'resources', 'models', DEFAULT_KWS_MODEL_NAME)

describe.skipIf(!existsSync(MODEL_DIR))('acceptance Bug 8: keyword spotter lifecycle', () => {
  it('every re-arm frees the previous stream instead of leaking it', () => {
    const spotter = new SherpaKeywordSpotter({ modelDir: MODEL_DIR, sampleRate: 16000 })
    spotter.setPhrase('Hey NOVA')
    spotter.initialize()

    const kws = (spotter as unknown as { kws: { createStream(): { free(): void } } }).kws
    const originalCreate = kws.createStream.bind(kws)
    let created = 0
    let freed = 0
    kws.createStream = () => {
      created += 1
      const stream = originalCreate()
      const originalFree = stream.free.bind(stream)
      stream.free = () => {
        freed += 1
        originalFree()
      }
      return stream
    }

    // The wake controller arms and disarms once per voice phase change, i.e.
    // several times per command — each of these used to leak one stream.
    spotter.start()
    spotter.start()
    spotter.start()
    expect(created).toBe(3)
    expect(freed).toBe(2)

    spotter.dispose()
    expect(freed).toBe(3)
  })
})

describe('acceptance Bug 8: wake controller never lets KWS break voice', () => {
  function failingSpotter(message: string) {
    return {
      kind: 'stub',
      initialize: () => {},
      setPhrase: () => {},
      start: () => {
        throw new Error(message)
      },
      acceptAudio: () => {},
      isDetected: () => false,
      reset: () => {},
      dispose: () => {},
    }
  }

  it('a spotter that cannot open a stream reports unavailable instead of throwing', () => {
    const controller = createWakeWordController({
      spotter: failingSpotter('wasm exploded'),
      isVoiceEnabled: () => true,
      isWakeEnabled: () => true,
      getPhase: () => 'idle',
      onWake: () => {},
    })

    expect(() => controller.reconcile()).not.toThrow()
    expect(controller.isArmed()).toBe(false)
    expect(controller.isAvailable()).toBe(false)
    expect(controller.getStatus()).toContain('wasm exploded')

    // Audio fed into a failed detector is ignored, not fatal.
    expect(() => controller.acceptAudio(new Float32Array(2048))).not.toThrow()
    controller.dispose()
  })
})
