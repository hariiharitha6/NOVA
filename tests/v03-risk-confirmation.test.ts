/**
 * V03-S4 — Risk classification + confirmation safety layer.
 *
 * Architecture exercised (identical for typed and voice input):
 *   input -> intent -> StructuredCommand -> risk classification -> validation
 *         -> confirmation gate (MEDIUM/HIGH) -> executor
 *
 * The executor must never be reachable without passing the gate, so most tests
 * assert on what did NOT happen: a held command launches nothing, a rejected
 * token executes nothing, and an expired prompt executes nothing.
 *
 * No GUI, no browser and no physical microphone are required. Voice is driven
 * through the same recognizer mock the existing suites use.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveCommand } from '../electron/core/command-engine'
import type { CommandSource } from '../electron/core/command-engine'
import {
  cancelPendingCommand,
  confirmPendingCommand,
  executeCommand,
} from '../electron/core/command-pipeline'
import type { CommandPipelineDeps } from '../electron/core/command-pipeline'
import {
  classifyRisk,
  requiresConfirmation,
  trustedTargets,
  withClassifiedRisk,
} from '../electron/core/risk-policy'
import {
  CANCEL_PHRASES,
  CONFIRMATION_TIMEOUT_MS,
  CONFIRM_PHRASES,
  createConfirmationGate,
  isConfirmationToken,
  resolveConfirmationPhrase,
} from '../electron/core/confirmation'
import type {
  ConfirmationGate,
  ConfirmationOutcome,
  ConfirmationResolution,
} from '../electron/core/confirmation'
import { createVoiceController } from '../electron/core/speech/voice-controller'
import type { SpeechRecognizer } from '../electron/core/speech/recognizer'
import type { CommandResponse, StructuredAction } from '../electron/core/types'
import { defaultConfig } from '../electron/core/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPS = [
  {
    id: 'app-chrome',
    name: 'Google Chrome',
    aliases: ['chrome'],
    path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe',
  },
  {
    id: 'app-vscode',
    name: 'Visual Studio Code',
    aliases: ['vscode', 'vs code'],
    path: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
  },
]

const WEBSITES = [
  { id: 'web-youtube', name: 'YouTube', aliases: ['youtube'], url: 'https://www.youtube.com' },
]

const FILE_FOLDERS = [
  { id: 'folder-downloads', name: 'Downloads', path: 'C:\\Users\\me\\Downloads', kind: 'folder' as const },
  { id: 'file-report', name: 'Report', path: 'C:\\Users\\me\\report.pdf', kind: 'file' as const },
]

const registry: CommandSource = {
  apps: APPS,
  websites: WEBSITES,
  fileFolders: FILE_FOLDERS,
}

const SNAPSHOT = {
  apps: APPS,
  websites: WEBSITES,
  fileFolders: FILE_FOLDERS,
}

const TRUSTED = trustedTargets(SNAPSHOT)

interface Harness {
  deps: CommandPipelineDeps
  gate: ConfirmationGate
  launched: StructuredAction[]
  recorded: string[]
  settled: Array<{ outcome: ConfirmationOutcome; token: string }>
  /** Replace the registry snapshot seen by later commands. */
  setSnapshot: (snapshot: typeof SNAPSHOT) => void
}

const openGates: ConfirmationGate[] = []

function makeHarness(options: { timeoutMs?: number } = {}): Harness {
  const launched: StructuredAction[] = []
  const recorded: string[] = []
  const settled: Array<{ outcome: ConfirmationOutcome; token: string }> = []
  let snapshot = SNAPSHOT

  const gate = createConfirmationGate({
    timeoutMs: options.timeoutMs ?? CONFIRMATION_TIMEOUT_MS,
    onSettled: (outcome, request) => settled.push({ outcome, token: request.token }),
  })
  openGates.push(gate)

  const config = { ...defaultConfig(), favorites: ['app-chrome'], recents: [] }

  const harness: Harness = {
    launched,
    recorded,
    settled,
    gate,
    setSnapshot: (next) => {
      snapshot = next
    },
    deps: {
      registry: { snapshot: async () => snapshot },
      launcher: {
        launch: async (action: StructuredAction) => {
          launched.push(action)
          return { ok: true, message: '', label: action.label }
        },
      },
      configStore: {
        get: () => config,
        update: () => config,
        recordRecent: (item) => {
          recorded.push(item.label)
          return config
        },
      },
      openSettings: () => {},
      confirmation: gate,
    },
  }
  return harness
}

afterEach(() => {
  // Never leave an armed prompt (and its timer) behind a test.
  while (openGates.length > 0) openGates.pop()?.dispose()
})

function makeRecognizer(final: string): SpeechRecognizer {
  return {
    kind: 'mock',
    initialize: () => {},
    start: () => {},
    acceptAudio: () => {},
    partialTranscript: () => '',
    finishAndGetTranscript: () => final,
    cancel: () => {},
    dispose: () => {},
  }
}

/** Speak `text` through the real voice controller into `deps`. */
function speak(text: string, deps: CommandPipelineDeps): void {
  const controller = createVoiceController({
    recognizer: makeRecognizer(text),
    isEnabled: () => true,
    executeCommand: (input) => executeCommand(input, deps, { source: 'voice' }),
    emit: () => {},
  })
  controller.togglePtt()
  controller.togglePtt()
}

/** Let the recognizer/pipeline microtask chain drain, then assert nothing moved. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

function tokenOf(response: CommandResponse): string {
  if (response.kind !== 'confirmation') throw new Error(`expected a confirmation, got ${response.kind}`)
  return response.request.token
}

function resolved(resolution: ConfirmationResolution): StructuredAction {
  if (resolution.status !== 'resolved') throw new Error(`expected resolution, got ${resolution.reason}`)
  return resolution.action
}

// ===========================================================================
// A. Risk classification
// ===========================================================================

describe('V03-S4: A — deterministic risk classification', () => {
  it('classifies every read-only / already-running intent as LOW', () => {
    const low: Array<[string, string]> = [
      ['show favorites', 'SHOW_FAVORITES'],
      ['show recents', 'SHOW_RECENTS'],
      ['open settings', 'OPEN_SETTINGS'],
      ['search for cats', 'SEARCH_WEB'],
      ['search youtube for cats', 'SEARCH_YOUTUBE'],
      ['focus chrome', 'FOCUS_APPLICATION'],
      ['open youtube', 'OPEN_WEBSITE'],
      ['open downloads', 'OPEN_FOLDER'],
      ['open report', 'OPEN_FILE'],
    ]
    for (const [text, intent] of low) {
      const action = resolveCommand(text, registry)
      expect(action.intent).toBe(intent)
      expect(classifyRisk(action, TRUSTED)).toBe('LOW')
      expect(requiresConfirmation('LOW')).toBe(false)
    }
  })

  it('classifies launching an application as MEDIUM even when registry-validated', () => {
    const action = resolveCommand('open chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    // Registry membership proves the user approved the app, but starting a
    // process is still a real system-side effect.
    expect(TRUSTED.has(action.target)).toBe(true)
    expect(classifyRisk(action, TRUSTED)).toBe('MEDIUM')
    expect(classifyRisk(action)).toBe('MEDIUM')
  })

  it('classifies an unvalidated website / file / folder target as MEDIUM', () => {
    const pasted = resolveCommand('https://example.com', registry)
    expect(pasted.intent).toBe('OPEN_WEBSITE')
    expect(classifyRisk(pasted, TRUSTED)).toBe('MEDIUM')

    const foreign: StructuredAction = {
      intent: 'OPEN_FOLDER',
      target: 'C:\\Windows\\System32',
      label: 'System32',
    }
    expect(TRUSTED.has(foreign.target)).toBe(false)
    expect(classifyRisk(foreign, TRUSTED)).toBe('MEDIUM')
  })

  it('is conservative when no registry context is supplied at all', () => {
    const action = resolveCommand('open youtube', registry)
    expect(classifyRisk(action)).toBe('MEDIUM')
    expect(classifyRisk(action, new Set<string>())).toBe('MEDIUM')
  })

  it('fails closed for any intent the policy does not know', () => {
    // An intent added later without a policy entry must never slip through as
    // LOW, even when the action itself claims nothing risky.
    const future = {
      intent: 'RUN_SCRIPT',
      target: 'C:\\Users\\me\\anything.ps1',
      label: 'Run script',
      risk: 'LOW',
    } as unknown as StructuredAction
    expect(classifyRisk(future, TRUSTED)).toBe('MEDIUM')
    expect(requiresConfirmation(classifyRisk(future, TRUSTED))).toBe(true)
  })

  it('ignores a caller-supplied risk level', () => {
    // Even if something upstream stamped "LOW", the policy decides.
    const spoofed = {
      intent: 'OPEN_APPLICATION',
      target: APPS[0].path,
      label: APPS[0].name,
      risk: 'LOW',
    } as StructuredAction
    expect(classifyRisk(spoofed, TRUSTED)).toBe('MEDIUM')
    expect(withClassifiedRisk(spoofed, TRUSTED).risk).toBe('MEDIUM')
  })

  it('treats a non-command utterance as harmless, since it has no side effect', () => {
    for (const intent of ['UNKNOWN', 'CLARIFICATION'] as const) {
      expect(classifyRisk({ intent, target: '', label: 'x' }, TRUSTED)).toBe('LOW')
    }
  })

  it('only LOW skips confirmation; MEDIUM and HIGH always require it', () => {
    expect(requiresConfirmation('LOW')).toBe(false)
    expect(requiresConfirmation('MEDIUM')).toBe(true)
    expect(requiresConfirmation('HIGH')).toBe(true)
  })

  it('assigns HIGH to nothing today, because no supported action is destructive', () => {
    // Every currently supported intent is classified LOW or MEDIUM. HIGH exists
    // so the confirmation gate already treats it as gated when a later slice adds
    // a destructive action; no dangerous command is invented to exercise it.
    const supported = [
      'show favorites',
      'show recents',
      'open settings',
      'search for cats',
      'search youtube for cats',
      'focus chrome',
      'open youtube',
      'open downloads',
      'open report',
      'open chrome',
      'https://example.com',
    ]
    for (const text of supported) {
      expect(classifyRisk(resolveCommand(text, registry), TRUSTED)).not.toBe('HIGH')
    }
  })

  it('never lets the parser assign a risk level', () => {
    // Recognition and risk are separate concerns: an interpreter cannot declare
    // its own proposal safe. The pipeline stamps the level from the policy.
    expect(resolveCommand('open chrome', registry).risk).toBeUndefined()
    expect(resolveCommand('open youtube', registry).risk).toBeUndefined()
    expect(resolveCommand('show favorites', registry).risk).toBeUndefined()
  })

  it('stamps the authoritative level onto the action the executor receives', async () => {
    // LOW: the classified action reaches the executor.
    const low = makeHarness()
    await executeCommand('search for cats', low.deps)
    expect(low.launched[0].risk).toBe('LOW')

    // MEDIUM: the gate binds the classified action, and that exact object is what
    // a later approval runs — the executor never sees the unclassified one.
    const medium = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', medium.deps))
    const bound = resolved(medium.gate.confirm(token))
    expect(bound.risk).toBe('MEDIUM')
    expect(medium.launched).toHaveLength(0)
  })

  it('withClassifiedRisk does not mutate the caller action', () => {
    const action = resolveCommand('open chrome', registry)
    const classified = withClassifiedRisk(action, TRUSTED)
    expect(classified.risk).toBe('MEDIUM')
    expect(action.risk).toBeUndefined()
  })

  it('trustedTargets only contains non-empty registry values', () => {
    const trusted = trustedTargets({
      apps: [{ id: 'a', name: 'A', aliases: [], path: 'C:\\a.exe' }],
      websites: [{ id: 'w', name: 'W', aliases: [], url: '' }],
      fileFolders: [{ id: 'f', name: 'F', path: '', kind: 'file' }],
    })
    expect(trusted.has('C:\\a.exe')).toBe(true)
    expect(trusted.has('')).toBe(false)
    expect(trustedTargets(undefined).size).toBe(0)
  })
})

// ===========================================================================
// B. LOW actions execute without confirmation
// ===========================================================================

describe('V03-S4: B — LOW actions execute with no confirmation', () => {
  it('runs a LOW search immediately', async () => {
    const h = makeHarness()
    const response = await executeCommand('search for cats', h.deps)
    expect(response.kind).toBe('launched')
    expect(h.gate.pending()).toBeNull()
    expect(h.launched.map((a) => a.intent)).toEqual(['SEARCH_WEB'])
  })

  it('runs a LOW registry website immediately', async () => {
    const h = makeHarness()
    const response = await executeCommand('open youtube', h.deps)
    expect(response.kind).toBe('launched')
    expect(h.launched[0].target).toBe('https://www.youtube.com')
    expect(h.launched[0].risk).toBe('LOW')
  })

  it('runs a LOW registry folder immediately', async () => {
    const h = makeHarness()
    await executeCommand('open downloads', h.deps)
    expect(h.launched.map((a) => a.intent)).toEqual(['OPEN_FOLDER'])
  })

  it('runs the read-only intents without touching the launcher', async () => {
    const h = makeHarness()
    await executeCommand('show favorites', h.deps)
    await executeCommand('show recents', h.deps)
    await executeCommand('open settings', h.deps)
    expect(h.launched).toHaveLength(0)
    expect(h.gate.pending()).toBeNull()
  })

  it('runs a LOW focus command immediately and records the recent', async () => {
    const h = makeHarness()
    const response = await executeCommand('focus chrome', h.deps)
    expect(response.kind).toBe('launched')
    expect(h.recorded).toEqual(['Google Chrome'])
    expect(h.launched[0].risk).toBe('LOW')
  })

  it('never opens a confirmation prompt for a LOW voice command', async () => {
    const h = makeHarness()
    speak('search for cats', h.deps)
    await vi.waitFor(() => expect(h.launched).toHaveLength(1))
    expect(h.gate.pending()).toBeNull()
  })
})

// ===========================================================================
// C. Confirmation-required actions stop before execution
// ===========================================================================

describe('V03-S4: C — MEDIUM actions are held before execution', () => {
  it('holds an application launch and executes nothing', async () => {
    const h = makeHarness()
    const response = await executeCommand('open chrome', h.deps)

    expect(response.kind).toBe('confirmation')
    expect(tokenOf(response)).toMatch(/^[0-9a-f-]{36}$/)
    expect(h.launched).toHaveLength(0)
    expect(h.recorded).toEqual([])
    expect(h.settled).toEqual([])
  })

  it('describes the pending action in the prompt', async () => {
    const h = makeHarness()
    const response = await executeCommand('open visual studio code', h.deps)
    expect(response.kind).toBe('confirmation')
    if (response.kind !== 'confirmation') throw new Error('unreachable')
    expect(response.request.prompt).toBe('Open Visual Studio Code?')
    expect(response.request.risk).toBe('MEDIUM')
    expect(response.request.intent).toBe('OPEN_APPLICATION')
    expect(response.request.expiresInMs).toBe(CONFIRMATION_TIMEOUT_MS)
  })

  it('holds an unvalidated website and shows the origin involved', async () => {
    const h = makeHarness()
    const response = await executeCommand('https://example.com', h.deps)
    expect(response.kind).toBe('confirmation')
    if (response.kind !== 'confirmation') throw new Error('unreachable')
    expect(response.request.detail).toBe('https://example.com')
    expect(h.launched).toHaveLength(0)
  })

  it('holds an unvalidated file/folder target even when the path looks harmless', async () => {
    // A folder NOVA never vetted is a real external target.
    const action: StructuredAction = {
      intent: 'OPEN_FOLDER',
      target: 'C:\\Users\\someone-else\\Documents',
      label: 'Documents',
    }
    expect(classifyRisk(action, TRUSTED)).toBe('MEDIUM')

    const h = makeHarness()
    const request = h.gate.open(withClassifiedRisk(action, TRUSTED))
    expect(h.launched).toHaveLength(0)

    expect((await confirmPendingCommand(request.token, h.deps)).kind).toBe('launched')
    expect(h.launched[0].target).toBe('C:\\Users\\someone-else\\Documents')
  })

  it('exposes no actionable payload to the renderer', async () => {
    const h = makeHarness()
    const response = await executeCommand('open chrome', h.deps)
    if (response.kind !== 'confirmation') throw new Error('unreachable')
    const request = response.request
    // Display-only fields plus one opaque token. Nothing the renderer could send
    // back as executable command data.
    expect(Object.keys(request).sort()).toEqual([
      'detail',
      'expiresInMs',
      'intent',
      'prompt',
      'risk',
      'token',
    ])
    expect(JSON.stringify(request)).not.toContain(APPS[0].path)
  })

  it('fails closed when no gate is available (never silently runs)', async () => {
    const launched: StructuredAction[] = []
    const deps: CommandPipelineDeps = {
      registry: { snapshot: async () => SNAPSHOT },
      launcher: {
        launch: async (action) => {
          launched.push(action)
          return { ok: true, message: '', label: action.label }
        },
      },
      configStore: { get: () => defaultConfig(), update: () => defaultConfig(), recordRecent: () => defaultConfig() },
    }
    const response = await executeCommand('open chrome', deps)
    expect(response.kind).toBe('cancelled')
    if (response.kind !== 'cancelled') throw new Error('unreachable')
    expect(response.reason).toBe('unavailable')
    expect(launched).toHaveLength(0)
  })
})

// ===========================================================================
// D. Confirm runs the exact pending command, once
// ===========================================================================

describe('V03-S4: D — confirm executes the bound command', () => {
  it('runs the held command on approval', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))
    expect(h.launched).toHaveLength(0)

    const response = await confirmPendingCommand(token, h.deps)

    expect(response.kind).toBe('launched')
    expect(h.launched).toHaveLength(1)
    expect(h.launched[0].intent).toBe('OPEN_APPLICATION')
    expect(h.launched[0].target).toBe(APPS[0].path)
    expect(h.recorded).toEqual(['Google Chrome'])
    expect(h.gate.pending()).toBeNull()
    expect(h.settled).toEqual([{ outcome: 'confirmed', token }])
  })

  it('executes the command that was prompted, not a re-resolved one', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))

    // The registry changes between prompt and approval.
    h.setSnapshot({ apps: [], websites: WEBSITES, fileFolders: FILE_FOLDERS })

    const response = await confirmPendingCommand(token, h.deps)
    expect(response.kind).toBe('launched')
    // The bound action is what runs — the prompt and the execution cannot diverge.
    expect(h.launched[0].target).toBe(APPS[0].path)
  })

  it('never re-classifies or re-parses on approval', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))
    const before = h.deps.registry.snapshot
    let calls = 0
    h.deps.registry = {
      snapshot: async () => {
        calls += 1
        return before()
      },
    }
    await confirmPendingCommand(token, h.deps)
    // One snapshot read for the executor's labels, and no new command parsing.
    expect(calls).toBe(1)
    expect(h.launched).toHaveLength(1)
  })
})

// ===========================================================================
// E. Cancel never executes
// ===========================================================================

describe('V03-S4: E — cancel executes nothing', () => {
  it('rejects the command and launches nothing', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))

    const response = cancelPendingCommand(token, h.deps)

    expect(response.kind).toBe('cancelled')
    if (response.kind !== 'cancelled') throw new Error('unreachable')
    expect(response.reason).toBe('user')
    expect(response.message).toContain('Cancelled')
    expect(h.launched).toHaveLength(0)
    expect(h.recorded).toEqual([])
    expect(h.gate.pending()).toBeNull()
    expect(h.settled).toEqual([{ outcome: 'cancelled', token }])
  })

  it('invalidates the token so a later approval is refused', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))
    cancelPendingCommand(token, h.deps)

    const late = await confirmPendingCommand(token, h.deps)
    expect(late.kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })
})

// ===========================================================================
// F. Timeout
// ===========================================================================

describe('V03-S4: F — pending confirmations expire', () => {
  it('uses a short, fixed 30 second window', () => {
    expect(CONFIRMATION_TIMEOUT_MS).toBe(30_000)
  })

  it('discards the pending command and executes nothing after expiry', async () => {
    vi.useFakeTimers()
    try {
      const h = makeHarness({ timeoutMs: 1000 })
      const token = tokenOf(await executeCommand('open chrome', h.deps))
      expect(h.gate.pending()?.token).toBe(token)

      await vi.advanceTimersByTimeAsync(1000)

      expect(h.gate.pending()).toBeNull()
      expect(h.launched).toHaveLength(0)
      expect(h.settled).toEqual([{ outcome: 'expired', token }])

      const late = await confirmPendingCommand(token, h.deps)
      expect(late.kind).toBe('cancelled')
      expect(h.launched).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses a single timer tied to the prompt (no background polling)', async () => {
    vi.useFakeTimers()
    try {
      const h = makeHarness()
      await executeCommand('open chrome', h.deps)
      expect(vi.getTimerCount()).toBe(1)
      await confirmPendingCommand(h.gate.pending()!.token, h.deps)
      // Answered: the timer is cleared, so nothing is left running.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the window only for the newest prompt', async () => {
    vi.useFakeTimers()
    try {
      const h = makeHarness({ timeoutMs: 1000 })
      const first = tokenOf(await executeCommand('open chrome', h.deps))
      await vi.advanceTimersByTimeAsync(600)
      const second = tokenOf(await executeCommand('open vscode', h.deps))
      expect(second).not.toBe(first)
      // Replacing the prompt kills the old one immediately and starts a fresh,
      // full-length window — the new prompt does not inherit the elapsed time.
      expect(h.settled).toEqual([{ outcome: 'superseded', token: first }])

      await vi.advanceTimersByTimeAsync(999)
      expect(h.gate.pending()?.token).toBe(second)

      await vi.advanceTimersByTimeAsync(1)
      expect(h.settled.map((s) => s.outcome)).toEqual(['superseded', 'expired'])
      expect(h.gate.pending()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ===========================================================================
// G. Replay protection
// ===========================================================================

describe('V03-S4: G — a confirmation can be used at most once', () => {
  it('refuses a second confirm of the same token', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))

    const first = await confirmPendingCommand(token, h.deps)
    const second = await confirmPendingCommand(token, h.deps)

    expect(first.kind).toBe('launched')
    expect(second.kind).toBe('cancelled')
    expect(h.launched).toHaveLength(1)
  })

  it('refuses a confirm after a cancel', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))
    cancelPendingCommand(token, h.deps)

    expect((await confirmPendingCommand(token, h.deps)).kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })

  it('refuses a cancel after a confirm and does not undo the execution', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))
    await confirmPendingCommand(token, h.deps)

    const response = cancelPendingCommand(token, h.deps)
    expect(response.kind).toBe('cancelled')
    expect(h.launched).toHaveLength(1)
  })

  it('rejects a forged / malformed token outright', async () => {
    const h = makeHarness()
    await executeCommand('open chrome', h.deps)

    const forgeries = [
      '',
      '   ',
      'yes',
      'open chrome',
      '../../etc/passwd',
      "'; DROP TABLE intents; --",
      '123e4567-e89b-12d3-a456-426614174000x',
      null,
      undefined,
      42,
      { intent: 'OPEN_APPLICATION', target: 'C:\\evil.exe' },
      ['123e4567-e89b-12d3-a456-426614174000'],
    ]
    for (const token of forgeries) {
      const response = await confirmPendingCommand(token, h.deps)
      expect(response.kind).toBe('cancelled')
    }
    // The genuine prompt survived every forged attempt.
    expect(h.gate.pending()).not.toBeNull()
    expect(h.launched).toHaveLength(0)
  })

  it('refuses a token that is well-formed but not the pending one', async () => {
    const h = makeHarness()
    await executeCommand('open chrome', h.deps)
    const resolution = h.gate.confirm('123e4567-e89b-12d3-a456-426614174000')
    expect(resolution).toEqual({ status: 'rejected', reason: 'mismatch' })
    expect(h.launched).toHaveLength(0)
  })

  it('accepts only canonical UUID tokens', () => {
    expect(isConfirmationToken('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(isConfirmationToken('123e4567e89b12d3a456426614174000')).toBe(false)
    expect(isConfirmationToken('')).toBe(false)
    expect(isConfirmationToken(123)).toBe(false)
  })

  it('hands out a different token for every prompt', async () => {
    const h = makeHarness()
    const tokens = new Set<string>()
    for (let i = 0; i < 25; i += 1) {
      tokens.add(tokenOf(await executeCommand('open chrome', h.deps)))
      h.gate.invalidate('superseded')
    }
    expect(tokens.size).toBe(25)
  })
})

// ===========================================================================
// H. Stale confirmations cannot act on a newer command
// ===========================================================================

describe('V03-S4: H — stale confirmations', () => {
  it('cannot execute the command that replaced them', async () => {
    const h = makeHarness()
    const first = tokenOf(await executeCommand('open chrome', h.deps))
    const second = tokenOf(await executeCommand('open vscode', h.deps))
    expect(second).not.toBe(first)

    const stale = await confirmPendingCommand(first, h.deps)
    expect(stale.kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)

    // The newer prompt is still answerable, and answers for itself only.
    const fresh = await confirmPendingCommand(second, h.deps)
    expect(fresh.kind).toBe('launched')
    expect(h.launched).toHaveLength(1)
    expect(h.launched[0].target).toBe(APPS[1].path)
  })

  it('is invalidated by any later command, including a LOW one', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))

    await executeCommand('show favorites', h.deps)
    expect(h.launched).toHaveLength(0)

    const stale = await confirmPendingCommand(token, h.deps)
    expect(stale.kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })

  it('is not invalidated by invalid or empty input', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))

    await executeCommand('', h.deps)
    await executeCommand('x'.repeat(500), h.deps)
    expect(h.gate.pending()?.token).toBe(token)

    // The still-valid prompt works.
    expect((await confirmPendingCommand(token, h.deps)).kind).toBe('launched')
  })

  it('is dropped when the surface showing it goes away', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))

    // Mirrors the overlay-hidden hook: a prompt must not stay armed off-screen.
    expect(h.gate.invalidate('cancelled')).toBe(true)
    expect(h.gate.invalidate('cancelled')).toBe(false)

    expect((await confirmPendingCommand(token, h.deps)).kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })

  it('never leaks a live request object the renderer could mutate', async () => {
    const h = makeHarness()
    await executeCommand('open chrome', h.deps)
    const pending = h.gate.pending()!
    pending.prompt = 'Open Notepad?'
    pending.token = '123e4567-e89b-12d3-a456-426614174000'
    expect(h.gate.pending()!.prompt).toBe('Open Google Chrome?')
  })
})

// ===========================================================================
// I. Voice confirmation phrases
// ===========================================================================

describe('V03-S4: I — spoken confirmation', () => {
  it('recognises exactly the fixed confirm vocabulary', () => {
    expect(CONFIRM_PHRASES).toEqual(['yes', 'yeah', 'confirm', 'do it'])
    for (const phrase of CONFIRM_PHRASES) {
      expect(resolveConfirmationPhrase(phrase)).toBe('confirm')
      expect(resolveConfirmationPhrase(phrase.toUpperCase())).toBe('confirm')
      expect(resolveConfirmationPhrase(`  ${phrase}. `)).toBe('confirm')
    }
  })

  it('does not recognise anything else as a confirmation', () => {
    for (const text of ['y', 'yep', 'yes please open chrome', 'do it now', 'confirm open chrome', '']) {
      expect(resolveConfirmationPhrase(text)).toBeNull()
    }
  })

  it.each(CONFIRM_PHRASES)('"%s" approves a pending command', async (phrase) => {
    const h = makeHarness()
    speak('open chrome', h.deps)
    await vi.waitFor(() => expect(h.gate.pending()).not.toBeNull())
    expect(h.launched).toHaveLength(0)

    speak(phrase, h.deps)
    await vi.waitFor(() => expect(h.launched).toHaveLength(1))
    expect(h.launched[0].intent).toBe('OPEN_APPLICATION')
    expect(h.launched[0].target).toBe(APPS[0].path)
  })

  it.each(CONFIRM_PHRASES)('"%s" with nothing pending does NOTHING', async (phrase) => {
    const h = makeHarness()
    speak(phrase, h.deps)
    await settle()
    // No command ran, no prompt was opened, and nothing was recorded.
    expect(h.launched).toHaveLength(0)
    expect(h.recorded).toEqual([])
    expect(h.gate.pending()).toBeNull()
  })

  it('never lets a stray "yes" execute a previously launched command', async () => {
    const h = makeHarness()
    speak('search for cats', h.deps)
    await vi.waitFor(() => expect(h.launched).toHaveLength(1))

    speak('yes', h.deps)
    await settle()
    // The earlier command is not re-run, and no new action is invented.
    expect(h.launched).toHaveLength(1)
  })

  it('answers an inert, non-executing acknowledgement when nothing is pending', async () => {
    const h = makeHarness()
    const response = await executeCommand('yes', h.deps, { source: 'voice' })
    expect(response.kind).toBe('result')
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.success).toBe(false)
    expect(response.result.message).toBe('There is nothing to confirm.')
    expect(h.launched).toHaveLength(0)
  })

  it('does not treat typed text as a confirmation', async () => {
    const h = makeHarness()
    await executeCommand('open chrome', h.deps)

    // Typed "yes" is an ordinary command, so it must never approve the prompt.
    const typed = await executeCommand('yes', h.deps)
    expect(typed.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })
})

// ===========================================================================
// J. Spoken cancellation
// ===========================================================================

describe('V03-S4: J — spoken cancellation', () => {
  it('recognises exactly the fixed cancel vocabulary', () => {
    expect(CANCEL_PHRASES).toEqual(['no', 'cancel', 'stop'])
    for (const phrase of CANCEL_PHRASES) {
      expect(resolveConfirmationPhrase(phrase)).toBe('cancel')
    }
  })

  it.each(CANCEL_PHRASES)('"%s" cancels a pending command without executing it', async (phrase) => {
    const h = makeHarness()
    speak('open chrome', h.deps)
    await vi.waitFor(() => expect(h.gate.pending()).not.toBeNull())

    speak(phrase, h.deps)
    await vi.waitFor(() => expect(h.gate.pending()).toBeNull())

    expect(h.launched).toHaveLength(0)
    expect(h.recorded).toEqual([])
    expect(h.settled.map((s) => s.outcome)).toEqual(['cancelled'])
  })

  it('a cancelled prompt can never be approved afterwards', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))
    await executeCommand('no', h.deps, { source: 'voice' })
    expect((await confirmPendingCommand(token, h.deps)).kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })

  it('reports a stale spoken answer instead of acting', async () => {
    const h = makeHarness()
    const response = await executeCommand('stop', h.deps, { source: 'voice' })
    expect(response.kind).toBe('result')
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.message).toBe('There is nothing to cancel.')
  })

  it('does not swallow a voice command that merely starts like a cancel word', async () => {
    const h = makeHarness()
    speak('open chrome', h.deps)
    await vi.waitFor(() => expect(h.gate.pending()).not.toBeNull())

    // "stopwatch" is not one of the fixed phrases, so it is parsed as a command.
    // It must neither approve nor cancel: the prompt is simply superseded.
    speak('stopwatch', h.deps)
    await vi.waitFor(() => expect(h.gate.pending()).toBeNull())

    expect(h.launched).toHaveLength(0)
    expect(h.settled.map((s) => s.outcome)).toEqual(['superseded'])
  })
})

// ===========================================================================
// K. Typed / voice parity
// ===========================================================================

describe('V03-S4: K — typed and voice share one confirmation mechanism', () => {
  it('produces byte-identical responses for the same command text', async () => {
    const typed = makeHarness()
    const voice = makeHarness()

    const typedResponse = await executeCommand('open chrome', typed.deps)
    const voiceResponse = await executeCommand('open chrome', voice.deps, { source: 'voice' })

    // Only the opaque token differs.
    const strip = (r: CommandResponse): unknown =>
      r.kind === 'confirmation' ? { ...r.request, token: '<token>' } : r
    expect(strip(voiceResponse)).toEqual(strip(typedResponse))
  })

  it('resolves a prompt raised by voice through the typed confirm path', async () => {
    const h = makeHarness()
    speak('open chrome', h.deps)
    await vi.waitFor(() => expect(h.gate.pending()).not.toBeNull())

    const response = await confirmPendingCommand(h.gate.pending()!.token, h.deps)
    expect(response.kind).toBe('launched')
    expect(h.launched).toHaveLength(1)
  })

  it('resolves a prompt raised by typing through the spoken confirm path', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))

    speak('confirm', h.deps)
    await vi.waitFor(() => expect(h.launched).toHaveLength(1))
    expect(h.launched[0].target).toBe(APPS[0].path)
    expect(h.settled).toEqual([{ outcome: 'confirmed', token }])
  })

  it('shares ONE pending slot across both input paths', async () => {
    const h = makeHarness()
    const typedToken = tokenOf(await executeCommand('open chrome', h.deps))
    speak('open vscode', h.deps)
    await vi.waitFor(() => expect(h.gate.pending()).not.toBeNull())
    expect(h.gate.pending()!.token).not.toBe(typedToken)

    // The typed token is dead; the spoken prompt is the only live one.
    expect((await confirmPendingCommand(typedToken, h.deps)).kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })

  it('holds a voice-raised confirmation in the "confirming" voice phase', async () => {
    const h = makeHarness()
    const states: string[] = []
    const controller = createVoiceController({
      recognizer: makeRecognizer('open chrome'),
      isEnabled: () => true,
      executeCommand: (input) => executeCommand(input, h.deps, { source: 'voice' }),
      emit: (state) => states.push(state.phase),
    })

    controller.togglePtt()
    controller.togglePtt()
    await vi.waitFor(() => expect(controller.getState().phase).toBe('confirming'))

    expect(controller.getState().message).toContain('Open Google Chrome?')
    expect(h.launched).toHaveLength(0)

    // Settling the prompt anywhere returns the indicator to idle.
    controller.clearConfirmation()
    expect(controller.getState().phase).toBe('idle')
  })

  it('accepts a new spoken answer while a confirmation is pending', async () => {
    const h = makeHarness()
    const states: string[] = []
    const recognizer = makeRecognizer('open chrome')
    const controller = createVoiceController({
      recognizer,
      isEnabled: () => true,
      executeCommand: (input) => executeCommand(input, h.deps, { source: 'voice' }),
      emit: (state) => states.push(state.phase),
    })

    controller.togglePtt()
    controller.togglePtt()
    await vi.waitFor(() => expect(controller.getState().phase).toBe('confirming'))

    // "confirming" must still accept a listening session, or the prompt could
    // never be answered by voice.
    ;(recognizer as { finishAndGetTranscript: () => string }).finishAndGetTranscript = () => 'yes'
    controller.togglePtt()
    controller.togglePtt()
    await vi.waitFor(() => expect(h.launched).toHaveLength(1))
    expect(h.launched[0].target).toBe(APPS[0].path)
  })
})

// ===========================================================================
// L. Prompt state transitions observable by the UI
// ===========================================================================

describe('V03-S4: L — confirmation state transitions', () => {
  it('reports each settle exactly once, with the prompt that settled', async () => {
    const h = makeHarness()
    const confirmed = tokenOf(await executeCommand('open chrome', h.deps))
    await confirmPendingCommand(confirmed, h.deps)

    const cancelled = tokenOf(await executeCommand('open vscode', h.deps))
    cancelPendingCommand(cancelled, h.deps)

    const superseded = tokenOf(await executeCommand('open chrome', h.deps))
    await executeCommand('show favorites', h.deps)

    expect(h.settled).toEqual([
      { outcome: 'confirmed', token: confirmed },
      { outcome: 'cancelled', token: cancelled },
      { outcome: 'superseded', token: superseded },
    ])
  })

  it('never notifies a settle listener twice for one prompt', async () => {
    const h = makeHarness()
    const token = tokenOf(await executeCommand('open chrome', h.deps))
    await confirmPendingCommand(token, h.deps)
    await confirmPendingCommand(token, h.deps)
    cancelPendingCommand(token, h.deps)
    expect(h.settled).toHaveLength(1)
  })

  it('survives a throwing settle listener (a UI fault cannot break the gate)', async () => {
    const gate = createConfirmationGate({
      onSettled: () => {
        throw new Error('renderer gone')
      },
    })
    openGates.push(gate)
    const request = gate.open({ intent: 'OPEN_APPLICATION', target: 'a.exe', label: 'A', risk: 'MEDIUM' })
    expect(() => gate.confirm(request.token)).not.toThrow()
    expect(gate.pending()).toBeNull()
  })

  it('drops a prompt on dispose without notifying', async () => {
    const settled: ConfirmationOutcome[] = []
    const gate = createConfirmationGate({ onSettled: (o) => settled.push(o) })
    gate.open({ intent: 'OPEN_APPLICATION', target: 'a.exe', label: 'A', risk: 'MEDIUM' })
    gate.dispose()
    expect(gate.pending()).toBeNull()
    expect(settled).toEqual([])
  })

  it('treats an unclassified action as the most conservative level', () => {
    const gate = createConfirmationGate()
    openGates.push(gate)
    const request = gate.open({ intent: 'OPEN_APPLICATION', target: 'a.exe', label: 'A' })
    expect(request.risk).toBe('HIGH')
    expect(request.prompt).toBe('Allow NOVA to perform this action?')
  })

  it('uses the wider wording only for a HIGH-risk action', async () => {
    const h = makeHarness()
    const medium = tokenOf(await executeCommand('open chrome', h.deps))
    const mediumRequest = h.gate.pending()!
    expect(mediumRequest.prompt).toBe('Open Google Chrome?')
    expect(mediumRequest.token).toBe(medium)

    const high = h.gate.open({ intent: 'OPEN_APPLICATION', target: 'a.exe', label: 'Thing', risk: 'HIGH' })
    expect(high.prompt).toBe('Allow NOVA to perform this action?')
    expect(high.detail).toBeUndefined()
  })

  it('returns null once nothing is pending, so the prompt can close itself', async () => {
    const h = makeHarness()
    expect(h.gate.pending()).toBeNull()
    await executeCommand('search for cats', h.deps)
    expect(h.gate.pending()).toBeNull()
    await executeCommand('open chrome', h.deps)
    expect(h.gate.pending()).not.toBeNull()
    cancelPendingCommand(h.gate.pending()!.token, h.deps)
    expect(h.gate.pending()).toBeNull()
  })
})

// ===========================================================================
// M. Security boundary + regression
// ===========================================================================

/** Strip comments so documentation prose about forbidden APIs is not flagged. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const ROOT = join(__dirname, '..')

describe('V03-S4: M — security boundary', () => {
  const gateSource = code(join(ROOT, 'electron/core/confirmation.ts'))
  const policySource = code(join(ROOT, 'electron/core/risk-policy.ts'))
  const pipelineSource = code(join(ROOT, 'electron/core/command-pipeline.ts'))
  const preloadSource = code(join(ROOT, 'electron/preload.ts'))
  const ipcSource = code(join(ROOT, 'electron/ipc.ts'))
  const sources = [gateSource, policySource, pipelineSource]

  it('introduces no shell, eval, or dynamic code execution', () => {
    for (const source of sources) {
      expect(source).not.toMatch(/powershell/i)
      expect(source).not.toMatch(/cmd\.exe/i)
      expect(source).not.toMatch(/cmd\s*\/c/i)
      expect(source).not.toMatch(/shell:\s*true/)
      expect(source).not.toMatch(/\bexecSync\b/)
      expect(source).not.toMatch(/\bexecFile\b/)
      expect(source).not.toMatch(/\bexec\s*\(/)
      expect(source).not.toMatch(/\bspawn\s*\(/)
      expect(source).not.toMatch(/\beval\s*\(/)
      expect(source).not.toMatch(/new\s+Function\s*\(/)
    }
  })

  it('the confirmation layer cannot execute anything itself', () => {
    // The gate only stores an already-validated action and hands it back.
    expect(gateSource).not.toMatch(/import\s+.*\b(child_process|electron)\b/)
    expect(gateSource).toContain('createConfirmationGate')
  })

  it('never lets the renderer submit command data as "confirmed"', () => {
    // The only renderer-facing confirmation arguments are opaque tokens.
    expect(preloadSource).toContain("confirmCommand: (token: string) => ipcRenderer.invoke('nova:confirm-command', token)")
    expect(preloadSource).toContain("cancelCommand: (token: string) => ipcRenderer.invoke('nova:cancel-command', token)")
    // No channel accepts an action/command payload for execution.
    expect(ipcSource).toContain('confirmPendingCommand(raw, pipeline)')
    expect(ipcSource).not.toMatch(/nova:(execute|run|launch)-raw/)
  })

  it('executes only the action bound to the confirmed token', () => {
    // confirmPendingCommand has no path that resolves new user input.
    const start = pipelineSource.indexOf('export async function confirmPendingCommand')
    const body = pipelineSource.slice(start, pipelineSource.indexOf('/** Reject the pending command'))
    expect(body).toContain('gate.confirm(rawToken)')
    expect(body).not.toContain('resolveCommand')
    expect(body).not.toContain('deps.launcher.launch(')
    expect(body).toContain('runAction(resolution.action, deps, snapshot)')
  })

  it('keeps the gate as the only route from a parsed command to the executor', () => {
    // The launcher is reachable from exactly one place in the pipeline, and that
    // place is downstream of the risk gate.
    expect(pipelineSource.match(/deps\.launcher\.launch\(/g)).toHaveLength(1)
    expect(pipelineSource).toContain('gateAndRun(action, deps, snapshot)')
  })

  it('treats a missing gate as a refusal, never as permission', () => {
    expect(pipelineSource).toContain("reason: 'unavailable'")
    const gateIndex = pipelineSource.indexOf('if (!gate) {')
    expect(gateIndex).toBeGreaterThan(-1)
    const around = pipelineSource.slice(gateIndex, gateIndex + 320)
    expect(around).not.toContain('runAction')
  })

  it('keeps a hostile confirmation phrase inert', async () => {
    const h = makeHarness()
    await executeCommand('open chrome', h.deps)
    for (const text of ['yes', 'confirm', 'do it']) {
      expect(resolveConfirmationPhrase(text)).toBe('confirm')
    }
    // The words only resolve the token the gate issued; they carry no target.
    await confirmPendingCommand(h.gate.pending()!.token, h.deps)
    expect(h.launched).toHaveLength(1)
    expect(h.launched[0].target).toBe(APPS[0].path)
  })

  it('never re-opens a protocol or executable path from confirmation input', async () => {
    const h = makeHarness()
    await executeCommand('open chrome', h.deps)
    // A token-shaped string that was never issued is rejected outright.
    const response = await confirmPendingCommand('123e4567-e89b-12d3-a456-426614174000', h.deps)
    expect(response.kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })

  it('leaves the existing launcher untouched', () => {
    const launcherSource = code(join(ROOT, 'electron/platform/windows-launcher.ts'))
    expect(launcherSource).toContain('export function createWindowsLauncher')
    expect(launcherSource).not.toContain('confirmation')
    expect(launcherSource).not.toContain('risk')
  })
})