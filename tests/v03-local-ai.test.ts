/**
 * V03-S5 — Optional LOCAL AI command interpretation.
 *
 * Architecture exercised:
 *   input -> deterministic engine --recognised--> existing path (unchanged)
 *         --unrecognised--> local AI -> proposal -> strict validation
 *                        -> deterministic resolution -> risk policy
 *                        -> confirmation gate -> existing executor
 *
 * The AI is an interpreter, never an executor. Most assertions here are therefore
 * about what did NOT happen: no model is consulted for a known command, no
 * launcher call is made without the risk policy and the gate having seen it, and
 * nothing at all leaves the machine.
 *
 * NO network, NO Ollama and NO model weights are required. Every provider here is
 * either an injected stub or an injected `fetch`, and the default configuration
 * has interpretation OFF.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPendingCommand,
  confirmPendingCommand,
  executeCommand,
} from '../electron/core/command-pipeline'
import type { CommandPipelineDeps } from '../electron/core/command-pipeline'
import { createConfirmationGate } from '../electron/core/confirmation'
import type { ConfirmationGate } from '../electron/core/confirmation'
import { classifyRisk, trustedTargets } from '../electron/core/risk-policy'
import { sanitizeConfigPatch } from '../electron/core/config'
import { defaultConfig } from '../electron/core/types'
import type { CommandResponse, StructuredAction } from '../electron/core/types'
import { AI_ALLOWED_INTENTS, interpretationContext } from '../electron/core/ai/types'
import type {
  CommandInterpreter,
  CommandProposal,
  InterpretOutcome,
  InterpretationContext,
} from '../electron/core/ai/types'
import {
  createDisabledInterpreter,
  createLocalCommandInterpreter,
  explainFailure,
} from '../electron/core/ai/interpreter'
import { checkConfidence, validateProposal } from '../electron/core/ai/proposal-schema'
import {
  assertLoopbackUrl,
  assertModelName,
  createOllamaClient,
  extractMessageContent,
  isLoopbackHttpUrl,
} from '../electron/core/ai/ollama-client'
import type { FetchLike, LocalModelClient } from '../electron/core/ai/ollama-client'
import { buildInterpretationMessages, extractJsonObject } from '../electron/core/ai/prompt'
import { resolveProposal } from '../electron/core/ai/resolve-proposal'
import {
  AI_MIN_CONFIDENCE,
  AI_REJECTED_MESSAGE,
  DEFAULT_LOCAL_AI_BASE_URL,
} from '../electron/core/ai/constants'

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
]

const WEBSITES = [
  { id: 'web-github', name: 'GitHub', aliases: ['github'], url: 'https://github.com' },
]

const FILE_FOLDERS = [
  { id: 'folder-downloads', name: 'Downloads', path: 'C:\\Users\\me\\Downloads', kind: 'folder' as const },
  { id: 'file-report', name: 'Report', path: 'C:\\Users\\me\\report.pdf', kind: 'file' as const },
]

const SNAPSHOT = { apps: APPS, websites: WEBSITES, fileFolders: FILE_FOLDERS }

const openGates: ConfirmationGate[] = []

afterEach(() => {
  while (openGates.length > 0) openGates.pop()?.dispose()
})

function proposal(overrides: Partial<CommandProposal> = {}): CommandProposal {
  return { intent: 'OPEN_APPLICATION', target: 'Chrome', confidence: 0.9, ...overrides }
}

/** An interpreter stub that records what it was asked, so "was it consulted?" is assertable. */
function stubInterpreter(
  handler: (raw: string, context: InterpretationContext) => InterpretOutcome,
): CommandInterpreter & { calls: Array<{ raw: string; context: InterpretationContext }> } {
  const calls: Array<{ raw: string; context: InterpretationContext }> = []
  return {
    name: 'stub-interpreter',
    calls,
    async interpret(raw, context) {
      calls.push({ raw, context })
      return handler(raw, context)
    },
  }
}

/** A model stub that answers with a fixed raw string, exercising the REAL parse path. */
function modelAnswering(answer: string): LocalModelClient {
  return { name: 'stub-model', async complete() { return answer } }
}

function proposed(p: CommandProposal): InterpretOutcome {
  return { status: 'proposed', proposal: p }
}

interface Harness {
  deps: CommandPipelineDeps
  gate: ConfirmationGate
  launched: StructuredAction[]
  /** Swap in a different interpreter, or remove interpretation entirely. */
  useInterpreter: (interpreter: CommandInterpreter | null) => void
}

function makeHarness(interpreter: CommandInterpreter | null = null): Harness {
  const launched: StructuredAction[] = []
  let current = interpreter
  const config = { ...defaultConfig(), favorites: ['app-chrome'], recents: [] }

  const gate = createConfirmationGate({ onSettled: () => {} })
  openGates.push(gate)

  return {
    launched,
    gate,
    useInterpreter: (next) => {
      current = next
    },
    deps: {
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
      // The resolver form: the pipeline asks for an interpreter only when it
      // actually needs one, which is what makes interpretation opt-in and lazy.
      interpreter: () => current,
    },
  }
}

function tokenOf(response: CommandResponse): string {
  if (response.kind !== 'confirmation') throw new Error(`expected confirmation, got ${response.kind}`)
  return response.request.token
}

/**
 * What the user is actually shown. `ConfirmationRequest` deliberately carries no
 * executable action — only a token, a risk, an intent and display text — so a
 * pending command is inspected through exactly that.
 */
function pendingOf(response: CommandResponse): {
  intent: string
  prompt: string
  detail?: string
} {
  if (response.kind !== 'confirmation') throw new Error(`expected confirmation, got ${response.kind}`)
  return {
    intent: response.request.intent,
    prompt: response.request.prompt,
    detail: response.request.detail,
  }
}

function labelOf(response: CommandResponse): string {
  if (response.kind === 'clarification') return response.action.label
  if (response.kind === 'cancelled' && response.action) return response.action.label
  throw new Error(`no clarification label on ${response.kind}`)
}

/** Strip comments so a capability scan judges code, not the prose describing it. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Also strip string literals. The validator legitimately holds these dangerous
 * words as DATA (a denylist), and data is not a capability.
 */
function codeWithoutLiterals(source: string): string {
  return code(source).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")
}

// ===========================================================================
// A. Provider abstraction
// ===========================================================================

describe('V03-S5: A — provider abstraction', () => {
  it('binds a local model client to the interpreter seam', async () => {
    const client: LocalModelClient = {
      name: 'stub-model',
      async complete() {
        return '{"intent":"OPEN_APPLICATION","target":"Chrome","confidence":0.9}'
      },
    }
    const interpreter = createLocalCommandInterpreter({ client, timeoutMs: 1000 })
    expect(interpreter.name).toBe('stub-model')
    const outcome = await interpreter.interpret('kick off the browser', interpretationContext(SNAPSHOT))
    expect(outcome.status).toBe('proposed')
  })

  it('keeps provider knowledge out of the pipeline and the core', () => {
    const pipeline = code(readFileSync(join(__dirname, '..', 'electron', 'core', 'command-pipeline.ts'), 'utf8'))
    expect(pipeline).not.toMatch(/ollama|localhost|127\.0\.0\.1|11434/i)
  })

  it('gives the interpreter a name-only context: no paths, no URLs', () => {
    const context = interpretationContext(SNAPSHOT)
    const serialised = JSON.stringify(context)
    expect(serialised).not.toContain('chrome.exe')
    expect(serialised).not.toContain('https://')
    expect(serialised).not.toContain('\\')
    expect(context.apps).toEqual(['Google Chrome', 'chrome'])
    expect(context.websites).toEqual(['GitHub', 'github'])
    expect(context.filesAndFolders).toEqual(['Downloads', 'Report'])
  })

  it('provides a disabled interpreter that never proposes anything', async () => {
    const outcome = await createDisabledInterpreter().interpret(
      'anything at all',
      interpretationContext(SNAPSHOT),
    )
    expect(outcome.status).toBe('unsupported')
    if (outcome.status === 'unsupported') expect(outcome.reason).toBe('disabled')
  })
})

// ===========================================================================
// B. Deterministic first
// ===========================================================================

describe('V03-S5: B — deterministic first, interpretation only as fallback', () => {
  it('never consults the model for a command NOVA already understands', async () => {
    const interpreter = stubInterpreter(() => proposed(proposal()))
    const h = makeHarness(interpreter)

    // "open chrome" is recognised deterministically, so the model is never asked
    // and the V03-S4 behaviour (confirm, then launch) is unchanged.
    const response = await executeCommand('open chrome', h.deps)

    expect(interpreter.calls).toHaveLength(0)
    expect(response.kind).toBe('confirmation')
    expect(pendingOf(response).intent).toBe('OPEN_APPLICATION')
    expect(h.launched).toHaveLength(0)
  })

  it('never lets the model reinterpret a known command', async () => {
    // Even a model that confidently says "open a website" cannot change what
    // "open settings" does.
    const interpreter = stubInterpreter(() =>
      proposed(proposal({ intent: 'OPEN_WEBSITE', target: 'GitHub' })),
    )
    const h = makeHarness(interpreter)

    const response = await executeCommand('open settings', h.deps)

    expect(interpreter.calls).toHaveLength(0)
    expect(response.kind).toBe('result')
    if (response.kind === 'result') expect(response.result.intent).toBe('OPEN_SETTINGS')
    expect(h.launched).toHaveLength(0)
  })

  it('consults the model only for an unrecognised command', async () => {
    const interpreter = stubInterpreter(() => proposed(proposal()))
    const h = makeHarness(interpreter)

    const response = await executeCommand('hey nova could you pop open chrome for me', h.deps)

    expect(interpreter.calls).toHaveLength(1)
    expect(interpreter.calls[0].raw).toBe('hey nova could you pop open chrome for me')
    expect(response.kind).toBe('confirmation')
    expect(pendingOf(response).prompt).toMatch(/chrome/i)

    await confirmPendingCommand(tokenOf(response), h.deps)
    expect(h.launched[0].target).toBe('C:\\Program Files\\Google\\Chrome\\chrome.exe')
  })

  it('behaves exactly as before V03-S5 when interpretation is off', async () => {
    const h = makeHarness(null)

    const response = await executeCommand('do the moonwalk to the shop', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('returns the deterministic clarification when the interpreter cannot help', async () => {
    // A model that declines leaves the user with NOVA's own wording for the same
    // unrecognised input, so the feature never degrades the product.
    const declining = makeHarness(
      stubInterpreter(() => ({ status: 'unsupported', reason: 'disabled' })),
    )
    const withoutAi = makeHarness(null)

    const declined = await executeCommand('do the moonwalk to the shop', declining.deps)
    const plain = await executeCommand('do the moonwalk to the shop', withoutAi.deps)

    expect(declined.kind).toBe('clarification')
    expect(plain.kind).toBe('clarification')
    expect(labelOf(declined)).toMatch(/local ai/i)
    expect(labelOf(plain)).not.toMatch(/local ai/i)
    expect(declining.launched).toHaveLength(0)
  })
})

// ===========================================================================
// C. Proposal validation
// ===========================================================================

describe('V03-S5: C — strict proposal validation', () => {
  it('accepts every allowed intent in the shape the model was told to emit', () => {
    const cases: Array<[CommandProposal['intent'], string]> = [
      ['OPEN_APPLICATION', 'Chrome'],
      ['FOCUS_APPLICATION', 'Chrome'],
      ['OPEN_WEBSITE', 'GitHub'],
      ['OPEN_FILE', 'Report'],
      ['OPEN_FOLDER', 'Downloads'],
      ['SEARCH_WEB', 'nova launcher'],
      ['SEARCH_YOUTUBE', 'lo-fi beats'],
    ]
    for (const [intent, target] of cases) {
      expect(validateProposal({ intent, target }).ok, intent).toBe(true)
    }
  })

  it('declares exactly the allowlist it enforces', () => {
    expect([...AI_ALLOWED_INTENTS].sort()).toEqual(
      [
        'FOCUS_APPLICATION',
        'OPEN_APPLICATION',
        'OPEN_FILE',
        'OPEN_FOLDER',
        'OPEN_WEBSITE',
        'SEARCH_WEB',
        'SEARCH_YOUTUBE',
      ].sort(),
    )
  })

  it('never allows an intent the model must not reach', () => {
    for (const intent of ['OPEN_SETTINGS', 'SHOW_FAVORITES', 'SHOW_RECENTS', 'CLARIFICATION', 'UNKNOWN', 'EXECUTE']) {
      expect(validateProposal({ intent, target: 'anything' }).ok, intent).toBe(false)
    }
  })

  it('rejects anything that is not a plain JSON object', () => {
    for (const raw of [null, undefined, 42, 'Chrome', [], true, 1.5]) {
      expect(validateProposal(raw).ok, JSON.stringify(raw)).toBe(false)
    }
  })

  it('rejects an unsupported field instead of ignoring it', () => {
    const injected = [
      { intent: 'OPEN_APPLICATION', target: 'Chrome', risk: 'LOW' },
      { intent: 'OPEN_APPLICATION', target: 'Chrome', path: 'C:\\Windows\\System32\\cmd.exe' },
      { intent: 'OPEN_APPLICATION', target: 'Chrome', executable: 'cmd.exe' },
      { intent: 'OPEN_APPLICATION', target: 'Chrome', url: 'https://evil.example' },
      { intent: 'OPEN_APPLICATION', target: 'Chrome', requiresConfirmation: false },
      { intent: 'OPEN_APPLICATION', target: 'Chrome', args: ['-exec'] },
      { intent: 'OPEN_APPLICATION', target: 'Chrome', shellCommand: 'calc' },
    ]
    for (const raw of injected) {
      expect(validateProposal(raw).ok, JSON.stringify(raw)).toBe(false)
    }
  })

  it('refuses a model-supplied risk level, which only NOVA assigns', () => {
    const result = validateProposal({ intent: 'OPEN_APPLICATION', target: 'Chrome', risk: 'LOW' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('risk')
  })

  it('rejects an argument other than query', () => {
    const result = validateProposal({
      intent: 'SEARCH_WEB',
      target: 'nova',
      arguments: { command: 'rm -rf /' },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects shell syntax in a machine-name target', () => {
    for (const target of [
      'Chrome && calc',
      'Chrome; rm -rf /',
      'Chrome | tee out.txt',
      'Chrome `whoami`',
      'Chrome $(id)',
      'Chrome\ncalc',
      '> out.txt',
      'Chrome && powershell',
      'system("calc")',
    ]) {
      expect(validateProposal({ intent: 'OPEN_APPLICATION', target }).ok, target).toBe(false)
    }
  })

  it('rejects a path or executable in place of a name', () => {
    for (const target of [
      'C:\\Windows\\System32\\cmd.exe',
      'cmd.exe',
      '/usr/bin/bash',
      '..\\..\\secret',
      'C:/Windows/System32/calc.exe',
      '../../etc/passwd',
    ]) {
      expect(validateProposal({ intent: 'OPEN_APPLICATION', target }).ok, target).toBe(false)
    }
  })

  it('rejects non-http protocols for a website target', () => {
    for (const target of [
      'javascript:alert(1)',
      'file:///C:/Windows/System32/calc.exe',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'ftp://example.com',
      'chrome.exe',
    ]) {
      expect(validateProposal({ intent: 'OPEN_WEBSITE', target }).ok, target).toBe(false)
    }
  })

  it('rejects a blank, whitespace-only or oversized target', () => {
    expect(validateProposal({ intent: 'OPEN_APPLICATION', target: '' }).ok).toBe(false)
    expect(validateProposal({ intent: 'OPEN_APPLICATION', target: '   ' }).ok).toBe(false)
    expect(validateProposal({ intent: 'OPEN_APPLICATION', target: 'C'.repeat(500) }).ok).toBe(false)
  })

  it('allows the query and fragment a real URL needs', () => {
    const result = validateProposal({
      intent: 'OPEN_WEBSITE',
      target: 'https://github.com/anthropics/claude-code?tab=readme#install',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a missing or non-string intent, and a non-string target', () => {
    expect(validateProposal({ target: 'Chrome' }).ok).toBe(false)
    expect(validateProposal({ intent: 5, target: 'Chrome' }).ok).toBe(false)
    expect(validateProposal({ intent: 'OPEN_APPLICATION', target: 5 }).ok).toBe(false)
    expect(validateProposal({ intent: 'OPEN_APPLICATION' }).ok).toBe(false)
  })

  it('never accepts a risk level in any casing', () => {
    for (const risk of ['LOW', 'low', 'Low']) {
      expect(validateProposal({ intent: 'OPEN_APPLICATION', target: 'Chrome', risk }).ok).toBe(false)
    }
  })
})

// ===========================================================================
// D. Confidence
// ===========================================================================

describe('V03-S5: D — confidence is metadata, never authority', () => {
  it('accepts a confidence at or above the threshold', () => {
    for (const confidence of [AI_MIN_CONFIDENCE, 0.7, 0.9, 1]) {
      expect(checkConfidence(proposal({ confidence })).ok, String(confidence)).toBe(true)
    }
  })

  it('treats confidence as optional', () => {
    const { confidence: _dropped, ...withoutConfidence } = proposal()
    expect(checkConfidence(withoutConfidence as CommandProposal).ok).toBe(true)
  })

  it('refuses a confidence outside [0,1] or of the wrong type', () => {
    for (const confidence of [1.5, -0.1, Number.NaN, Number.POSITIVE_INFINITY, 'high']) {
      expect(
        checkConfidence(proposal({ confidence: confidence as number })).ok,
        String(confidence),
      ).toBe(false)
    }
  })

  it('refuses to act on a confidence below the stated threshold', async () => {
    const interpreter = createLocalCommandInterpreter({
      client: modelAnswering(
        JSON.stringify({ intent: 'OPEN_APPLICATION', target: 'Chrome', confidence: AI_MIN_CONFIDENCE - 0.01 }),
      ),
      timeoutMs: 1000,
    })
    const h = makeHarness(interpreter)

    const response = await executeCommand('do a barrel roll to the browser', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('acts when confidence is exactly at the threshold', async () => {
    const interpreter = createLocalCommandInterpreter({
      client: modelAnswering(
        JSON.stringify({ intent: 'OPEN_APPLICATION', target: 'Chrome', confidence: AI_MIN_CONFIDENCE }),
      ),
      timeoutMs: 1000,
    })
    const h = makeHarness(interpreter)

    const response = await executeCommand('do a barrel roll to the browser', h.deps)

    expect(response.kind).toBe('confirmation')
    expect(pendingOf(response).intent).toBe('OPEN_APPLICATION')
  })

  it('a maximum-confidence proposal cannot lower the risk of an untrusted target', async () => {
    const h = makeHarness(
      stubInterpreter(() =>
        proposed({
          intent: 'OPEN_WEBSITE',
          target: 'https://totally-unknown-site.example',
          confidence: 1,
        }),
      ),
    )

    const response = await executeCommand('take me to a totally unknown site', h.deps)

    // Still held for confirmation: confidence is not an authority.
    expect(response.kind).toBe('confirmation')
    expect(h.launched).toHaveLength(0)
    expect(
      classifyRisk(
        { intent: 'OPEN_WEBSITE', target: 'https://totally-unknown-site.example', label: 'x' },
        trustedTargets(SNAPSHOT),
      ),
    ).toBe('MEDIUM')
  })
})

// ===========================================================================
// E. Deterministic resolution
// ===========================================================================

describe('V03-S5: E — the proposal is resolved, never executed as written', () => {
  it('resolves an app NAME to the registry path verbatim', () => {
    const result = resolveProposal(proposal({ target: 'Chrome' }), SNAPSHOT)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.action.target).toBe('C:\\Program Files\\Google\\Chrome\\chrome.exe')
      expect(result.action.intent).toBe('OPEN_APPLICATION')
    }
  })

  it('assigns NO risk level while resolving', () => {
    const result = resolveProposal(proposal(), SNAPSHOT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.action.risk).toBeUndefined()
  })

  it('refuses a name the registry does not contain', () => {
    const result = resolveProposal(proposal({ target: 'Microsoft Bob' }), SNAPSHOT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid')
  })

  it('refuses a proposal whose intent contradicts the registry', () => {
    // "Downloads" is a folder; asking to open it as a FILE is wrong, not coerced.
    const result = resolveProposal(proposal({ intent: 'OPEN_FILE', target: 'Downloads' }), SNAPSHOT)
    expect(result.ok).toBe(false)
  })

  it('refuses a website intent for something the registry knows as an app', () => {
    const result = resolveProposal(proposal({ intent: 'OPEN_WEBSITE', target: 'Chrome' }), SNAPSHOT)
    expect(result.ok).toBe(false)
  })

  it('resolves a known site name to the registry URL, not model text', () => {
    const result = resolveProposal(proposal({ intent: 'OPEN_WEBSITE', target: 'GitHub' }), SNAPSHOT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.action.target).toBe('https://github.com')
  })

  it('builds a search URL from a fixed origin with the query escaped', () => {
    const result = resolveProposal(proposal({ intent: 'SEARCH_WEB', target: 'nova launcher' }), SNAPSHOT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.action.target).toBe('https://www.google.com/search?q=nova%20launcher')
  })

  it('keeps shell-like words in a search query as inert data', () => {
    const result = resolveProposal(
      proposal({ intent: 'SEARCH_YOUTUBE', target: 'how to rm -rf safely && echo hi' }),
      SNAPSHOT,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.action.target).toBe(
        'https://www.youtube.com/results?search_query=how%20to%20rm%20-rf%20safely%20%26%26%20echo%20hi',
      )
      expect(result.action.target.startsWith('https://www.youtube.com/results?search_query=')).toBe(true)
    }
  })

  it('never builds a search URL from a model-supplied origin', () => {
    const result = resolveProposal(
      proposal({ intent: 'SEARCH_WEB', target: 'nova', arguments: { query: 'x' } }),
      SNAPSHOT,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(new URL(result.action.target).origin).toBe('https://www.google.com')
  })

  it('refuses an empty search query', () => {
    expect(resolveProposal(proposal({ intent: 'SEARCH_WEB', target: '   ' }), SNAPSHOT).ok).toBe(false)
  })

  it('resolves a folder to the registry path', () => {
    const result = resolveProposal(proposal({ intent: 'OPEN_FOLDER', target: 'Downloads' }), SNAPSHOT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.action.target).toBe('C:\\Users\\me\\Downloads')
  })
})

// ===========================================================================
// F. End-to-end through the real pipeline, risk policy and gate
// ===========================================================================

describe('V03-S5: F — interpreted commands use the same safety path', () => {
  it('holds an interpreted app launch for confirmation, then runs it', async () => {
    // OPEN_APPLICATION starts a process, so V03-S4 requires confirmation whether a
    // human pattern or a local model chose the intent. The interpreter adds no
    // privilege.
    const h = makeHarness(stubInterpreter(() => proposed(proposal())))

    const response = await executeCommand('could you kindly open chrome', h.deps)

    expect(response.kind).toBe('confirmation')
    expect(h.launched).toHaveLength(0)

    const confirmed = await confirmPendingCommand(tokenOf(response), h.deps)
    expect(confirmed.kind).toBe('launched')
    expect(h.launched).toHaveLength(1)
    expect(h.launched[0].target).toBe('C:\\Program Files\\Google\\Chrome\\chrome.exe')
  })

  it('holds an untrusted interpreted URL for confirmation', async () => {
    const h = makeHarness(
      stubInterpreter(() => proposed({ intent: 'OPEN_WEBSITE', target: 'https://unknown-site.example' })),
    )

    const response = await executeCommand('show me some unknown site', h.deps)

    expect(response.kind).toBe('confirmation')
    // The origin is shown to the user before anything can open.
    expect(pendingOf(response).detail).toBe('https://unknown-site.example')
    expect(h.launched).toHaveLength(0)
  })

  it('launches the exact prompted action once the token is confirmed', async () => {
    const h = makeHarness(
      stubInterpreter(() => proposed({ intent: 'OPEN_WEBSITE', target: 'https://unknown-site.example' })),
    )

    const response = await executeCommand('show me some unknown site', h.deps)
    const confirmed = await confirmPendingCommand(tokenOf(response), h.deps)

    expect(confirmed.kind).toBe('launched')
    expect(h.launched).toHaveLength(1)
    expect(h.launched[0].target).toBe('https://unknown-site.example')
  })

  it('opens nothing when the interpreted action is cancelled', async () => {
    const h = makeHarness(
      stubInterpreter(() => proposed({ intent: 'OPEN_WEBSITE', target: 'https://unknown-site.example' })),
    )

    const response = await executeCommand('show me some unknown site', h.deps)
    const cancelled = cancelPendingCommand(tokenOf(response), h.deps)

    expect(cancelled.kind).toBe('cancelled')
    expect(h.launched).toHaveLength(0)
  })

  it('never lets a proposal run a shell command', async () => {
    const h = makeHarness(stubInterpreter(() => proposed(proposal({ target: 'Chrome && calc.exe' }))))

    const response = await executeCommand('rm -rf everything', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('never lets a proposal name an executable', async () => {
    const h = makeHarness(
      stubInterpreter(() => proposed(proposal({ target: 'C:\\Windows\\System32\\cmd.exe' }))),
    )

    const response = await executeCommand('run something dangerous', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('treats an unresolvable proposal as clarification', async () => {
    const h = makeHarness(stubInterpreter(() => proposed(proposal({ target: 'Nothing Like This' }))))

    const response = await executeCommand('open nothing like this', h.deps)

    expect(response.kind).toBe('clarification')
    expect(labelOf(response)).toBe(AI_REJECTED_MESSAGE)
    expect(h.launched).toHaveLength(0)
  })

  it('rejects a disallowed intent end to end', async () => {
    const h = makeHarness(
      stubInterpreter(() => proposed(proposal({ intent: 'OPEN_SETTINGS', target: 'Settings' }))),
    )

    const response = await executeCommand('do something unusual', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('gives typed and voice input the identical interpreted result', async () => {
    const typed = makeHarness(stubInterpreter(() => proposed(proposal())))
    const spoken = makeHarness(stubInterpreter(() => proposed(proposal())))

    const typedResponse = await executeCommand('open chrome somehow', typed.deps)
    const voiceResponse = await executeCommand('open chrome somehow', spoken.deps, { source: 'voice' })

    expect(voiceResponse.kind).toBe(typedResponse.kind)
    expect(pendingOf(voiceResponse).intent).toBe(pendingOf(typedResponse).intent)
    expect(pendingOf(voiceResponse).prompt).toBe(pendingOf(typedResponse).prompt)

    // And the same confirmation runs the same action on both paths.
    await confirmPendingCommand(tokenOf(voiceResponse), spoken.deps)
    expect(spoken.launched).toHaveLength(1)
    expect(spoken.launched[0].target).toBe('C:\\Program Files\\Google\\Chrome\\chrome.exe')
  })

  it('does not re-run the model for the confirmation that follows it', async () => {
    const interpreter = stubInterpreter(() =>
      proposed({ intent: 'OPEN_WEBSITE', target: 'https://unknown-site.example' }),
    )
    const h = makeHarness(interpreter)

    const response = await executeCommand('show me some unknown site', h.deps)
    expect(interpreter.calls).toHaveLength(1)
    await confirmPendingCommand(tokenOf(response), h.deps)
    expect(interpreter.calls).toHaveLength(1)
  })

  it('sends only the user text and a name-only registry to the model', async () => {
    const interpreter = stubInterpreter(() => proposed(proposal()))
    const h = makeHarness(interpreter)

    await executeCommand('open chrome somehow', h.deps)

    expect(JSON.stringify(interpreter.calls[0].context)).not.toContain('chrome.exe')
    expect(JSON.stringify(interpreter.calls[0].context)).not.toContain('https://github.com')
  })

  it('still refuses an empty or oversized command before any interpretation', async () => {
    const interpreter = stubInterpreter(() => proposed(proposal()))
    const h = makeHarness(interpreter)

    await executeCommand('   ', h.deps)
    await executeCommand('x'.repeat(500), h.deps)

    expect(interpreter.calls).toHaveLength(0)
  })
})

// ===========================================================================
// G. Failure handling: unavailable, timeout, malformed
// ===========================================================================

describe('V03-S5: G — every failure degrades to clarification', () => {
  it('asks for clarification when the local service is unavailable', async () => {
    const h = makeHarness(
      createLocalCommandInterpreter({ client: modelAnswering(null as unknown as string), timeoutMs: 1000 }),
    )
    // A client that reports "no model installed" returns null.
    const offline: LocalModelClient = { name: 'down', async complete() { return null } }
    h.useInterpreter(createLocalCommandInterpreter({ client: offline, timeoutMs: 1000 }))

    const response = await executeCommand('do something odd', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('asks for clarification when the interpreter throws', async () => {
    const h = makeHarness(
      stubInterpreter(() => {
        throw new Error('provider exploded')
      }),
    )

    const response = await executeCommand('do something odd', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('asks for clarification when the model answers with prose instead of JSON', async () => {
    const h = makeHarness(
      createLocalCommandInterpreter({
        client: modelAnswering('Sure! I think you want to open Chrome, hope that helps :)'),
        timeoutMs: 1000,
      }),
    )

    const response = await executeCommand('do something odd', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('accepts a JSON answer wrapped in a code fence', async () => {
    const h = makeHarness(
      createLocalCommandInterpreter({
        client: modelAnswering('```json\n{"intent":"OPEN_APPLICATION","target":"Chrome"}\n```'),
        timeoutMs: 1000,
      }),
    )

    const response = await executeCommand('do something odd', h.deps)

    expect(response.kind).toBe('confirmation')
    expect(pendingOf(response).intent).toBe('OPEN_APPLICATION')
  })

  it('asks for clarification when the model proposes a disallowed intent', async () => {
    const h = makeHarness(
      createLocalCommandInterpreter({
        client: modelAnswering('{"intent":"OPEN_SETTINGS","target":"Settings"}'),
        timeoutMs: 1000,
      }),
    )

    const response = await executeCommand('do something odd', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('asks for clarification when the model says UNKNOWN', async () => {
    const h = makeHarness(
      createLocalCommandInterpreter({
        client: modelAnswering('{"intent":"UNKNOWN","target":"","confidence":0}'),
        timeoutMs: 1000,
      }),
    )

    const response = await executeCommand('do something odd', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
  })

  it('asks for clarification when the answer is not valid JSON at all', async () => {
    const h = makeHarness(
      createLocalCommandInterpreter({ client: modelAnswering('}{ nope'), timeoutMs: 1000 }),
    )

    const response = await executeCommand('do something odd', h.deps)

    expect(response.kind).toBe('clarification')
  })

  it('gives up on a hung local service and asks for clarification', async () => {
    // A provider that never answers: the timeout, not the user, ends the wait.
    const hanging: LocalModelClient = {
      name: 'hangs',
      complete(
        _messages: Parameters<LocalModelClient['complete']>[0],
        signal: AbortSignal,
      ): Promise<string | null> {
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve(null))
        })
      },
    }
    const h = makeHarness(createLocalCommandInterpreter({ client: hanging, timeoutMs: 1000 }))

    vi.useFakeTimers()
    try {
      const pending = executeCommand('do something odd', h.deps)
      await vi.advanceTimersByTimeAsync(1200)
      const response = await pending
      expect(response.kind).toBe('clarification')
      expect(h.launched).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clamps a nonsensical timeout into a sane range and still answers', async () => {
    const offline: LocalModelClient = { name: 'down', async complete() { return null } }
    const interpreter = createLocalCommandInterpreter({ client: offline, timeoutMs: 5 })
    const outcome = await interpreter.interpret('hello', interpretationContext(SNAPSHOT))
    expect(outcome.status).toBe('unsupported')
    if (outcome.status === 'unsupported') expect(outcome.reason).toBe('unavailable')
  })

  it('refuses an empty prompt without asking the model', async () => {
    let asked = 0
    const counting: LocalModelClient = {
      name: 'counting',
      async complete() {
        asked += 1
        return null
      },
    }
    const outcome = await createLocalCommandInterpreter({ client: counting }).interpret(
      '   ',
      interpretationContext(SNAPSHOT),
    )
    expect(outcome.status).toBe('unsupported')
    expect(asked).toBe(0)
  })

  it('gives every failure reason a readable message', () => {
    for (const reason of ['unavailable', 'timeout', 'malformed', 'invalid', 'disabled'] as const) {
      expect(explainFailure(reason).length, reason).toBeGreaterThan(10)
    }
  })
})

// ===========================================================================
// H. The provider adapter can only talk to this machine
// ===========================================================================

describe('V03-S5: H — the provider adapter is local-only', () => {
  it('accepts loopback addresses', () => {
    for (const url of [
      'http://127.0.0.1:11434',
      'http://localhost:11434',
      'http://[::1]:11434',
      'https://127.0.0.1:8080',
      'http://127.0.0.1',
    ]) {
      expect(isLoopbackHttpUrl(url), url).toBe(true)
    }
  })

  it('refuses every remote or non-http address', () => {
    for (const url of [
      'https://api.openai.com',
      'http://192.168.1.50:11434',
      'http://ollama.example.com',
      'http://10.0.0.5:11434',
      'http://127.0.0.1.evil.com',
      'http://0.0.0.0:11434',
      'file:///etc/passwd',
      'not a url',
      '',
    ]) {
      expect(isLoopbackHttpUrl(url), url).toBe(false)
      expect(() => assertLoopbackUrl(url), url).toThrow()
    }
  })

  it('normalises a loopback base URL to its origin', () => {
    expect(assertLoopbackUrl('http://127.0.0.1:11434/api/').origin).toBe('http://127.0.0.1:11434')
  })

  it('validates the model name narrowly', () => {
    expect(assertModelName(' llama3.2 ')).toBe('llama3.2')
    expect(assertModelName('library/qwen:latest'.replace('/', '.'))).toBe('library.qwen:latest')
    for (const bad of ['', '   ', 'a b', 'model;rm', 'a'.repeat(65), 'a/b']) {
      expect(() => assertModelName(bad), bad).toThrow()
    }
  })

  it('posts to the loopback chat endpoint with no auth and no telemetry', async () => {
    const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ message: { content: '{"intent":"OPEN_APPLICATION","target":"Chrome"}' } })
        },
      }
    }

    const client = createOllamaClient({ fetchImpl })
    const answer = await client.complete(
      buildInterpretationMessages('do a thing', interpretationContext(SNAPSHOT)),
      new AbortController().signal,
    )

    expect(answer).toContain('OPEN_APPLICATION')
    expect(calls).toHaveLength(1)
    expect(calls[0].url.startsWith(DEFAULT_LOCAL_AI_BASE_URL)).toBe(true)
    expect(calls[0].url.endsWith('/api/chat')).toBe(true)

    const headers = calls[0].init.headers
    expect(Object.keys(headers)).toEqual(['content-type'])
    const serialisedHeaders = JSON.stringify(headers).toLowerCase()
    expect(serialisedHeaders).not.toContain('auth')
    expect(serialisedHeaders).not.toContain('bearer')
    expect(serialisedHeaders).not.toContain('token')

    const body = JSON.parse(calls[0].init.body) as Record<string, unknown>
    expect(body.stream).toBe(false)
    expect(typeof body.model).toBe('string')
  })

  it('defaults to the documented local model rather than failing', async () => {
    let seen = ''
    const fetchImpl: FetchLike = async (_url, init) => {
      seen = (JSON.parse(init.body) as { model: string }).model
      return { ok: true, status: 200, async text() { return '{}' } }
    }
    const client = createOllamaClient({ fetchImpl })
    await client.complete(buildInterpretationMessages('hi', interpretationContext(SNAPSHOT)), new AbortController().signal)
    expect(seen.length).toBeGreaterThan(0)
  })

  it('refuses to construct a client for a remote address', () => {
    expect(() => createOllamaClient({ baseUrl: 'https://api.openai.com' })).toThrow()
  })

  it('reports a non-2xx local response as unavailable, not as an answer', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 404, async text() { return 'model not found' } })
    const client = createOllamaClient({ fetchImpl, model: 'nope' })
    const answer = await client.complete(
      buildInterpretationMessages('hi', interpretationContext(SNAPSHOT)),
      new AbortController().signal,
    )
    expect(answer).toBeNull()
  })

  it('reports a transport error as unavailable', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED')
    }
    const client = createOllamaClient({ fetchImpl })
    const answer = await client.complete(
      buildInterpretationMessages('hi', interpretationContext(SNAPSHOT)),
      new AbortController().signal,
    )
    expect(answer).toBeNull()
  })

  it('never issues a request once the call is already aborted', async () => {
    let called = 0
    const fetchImpl: FetchLike = async () => {
      called += 1
      return { ok: true, status: 200, async text() { return '{}' } }
    }
    const client = createOllamaClient({ fetchImpl })
    const controller = new AbortController()
    controller.abort()
    const answer = await client.complete(
      buildInterpretationMessages('hi', interpretationContext(SNAPSHOT)),
      controller.signal,
    )
    expect(answer).toBeNull()
    expect(called).toBe(0)
  })

  it('reads only an Ollama-shaped response', () => {
    expect(extractMessageContent(JSON.stringify({ message: { content: 'hi' } }))).toBe('hi')
    expect(extractMessageContent(JSON.stringify({ response: 'hi' }))).toBeNull()
    expect(extractMessageContent('not json')).toBeNull()
    expect(extractMessageContent(JSON.stringify({ message: {} }))).toBeNull()
    expect(extractMessageContent(JSON.stringify([{ message: { content: 'hi' } }]))).toBeNull()
  })
})

// ===========================================================================
// I. Prompt shape and parsing robustness
// ===========================================================================

describe('V03-S5: I — constrained prompt, robust parsing', () => {
  it('builds a two-message exchange carrying the text and a name-only registry', () => {
    const messages = buildInterpretationMessages('open chrome somehow', interpretationContext(SNAPSHOT))
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('open chrome somehow')
    expect(messages[1].content).toContain('Chrome')
    expect(messages[1].content).not.toContain('chrome.exe')
    expect(messages[1].content).not.toContain('https://')
  })

  it('states plainly that the model has no capability', () => {
    const [system] = buildInterpretationMessages('x', interpretationContext(SNAPSHOT))
    expect(system.content).toMatch(/no capabilities/i)
    // It never offers to act, and never hands out a risk level.
    expect(system.content).not.toMatch(/act as an? /i)
    expect(system.content).toContain('"risk"')
  })

  it('tells the model to answer UNKNOWN when unsure', () => {
    const [system] = buildInterpretationMessages('x', interpretationContext(SNAPSHOT))
    expect(system.content).toContain('UNKNOWN')
  })

  it('extracts a JSON object from a fenced block or surrounding prose', () => {
    expect(extractJsonObject('{"intent":"OPEN_APPLICATION","target":"Chrome"}')).toContain('Chrome')
    expect(extractJsonObject('```json\n{"intent":"OPEN_APPLICATION"}\n```')).toContain('OPEN_APPLICATION')
    expect(extractJsonObject('Sure! {"intent":"OPEN_APPLICATION","target":"Chrome"} done')).toContain('Chrome')
    expect(extractJsonObject('{"target":"a } brace"}')).toContain('a } brace')
    expect(extractJsonObject('{"target":"quote \\" inside"}')).toContain('inside')
    expect(extractJsonObject('no json at all')).toBeNull()
    expect(extractJsonObject('[1,2,3]')).toBeNull()
    expect(extractJsonObject(undefined)).toBeNull()
  })
})

// ===========================================================================
// J. Configuration
// ===========================================================================

describe('V03-S5: J — configuration is opt-in and local-only', () => {
  it('ships with interpretation OFF and a loopback default', () => {
    const config = defaultConfig()
    expect(config.aiInterpretationEnabled).toBe(false)
    expect(config.aiBaseUrl).toBe(DEFAULT_LOCAL_AI_BASE_URL)
    expect(config.aiTimeoutMs).toBeGreaterThanOrEqual(1000)
    expect(config.aiTimeoutMs).toBeLessThanOrEqual(30000)
  })

  it('accepts a loopback URL from settings', () => {
    expect(sanitizeConfigPatch({ aiBaseUrl: 'http://localhost:11434' }).aiBaseUrl).toBe(
      'http://localhost:11434',
    )
  })

  it('drops a remote URL instead of storing it', () => {
    expect(sanitizeConfigPatch({ aiBaseUrl: 'https://api.openai.com/v1' }).aiBaseUrl).toBeUndefined()
    expect(sanitizeConfigPatch({ aiBaseUrl: 'http://10.0.0.5:11434' }).aiBaseUrl).toBeUndefined()
  })

  it('accepts the enable flag but never infers it from a URL', () => {
    expect(sanitizeConfigPatch({ aiBaseUrl: 'http://127.0.0.1:11434' }).aiInterpretationEnabled).toBeUndefined()
    expect(sanitizeConfigPatch({ aiInterpretationEnabled: true }).aiInterpretationEnabled).toBe(true)
  })

  it('drops an out-of-range timeout and keeps a valid one', () => {
    expect(sanitizeConfigPatch({ aiTimeoutMs: 10 }).aiTimeoutMs).toBeUndefined()
    expect(sanitizeConfigPatch({ aiTimeoutMs: 10_000_000 }).aiTimeoutMs).toBeUndefined()
    expect(sanitizeConfigPatch({ aiTimeoutMs: 5000 }).aiTimeoutMs).toBe(5000)
  })

  it('drops an unusable model name', () => {
    expect(sanitizeConfigPatch({ aiModel: 'a b; rm -rf' }).aiModel).toBeUndefined()
    expect(sanitizeConfigPatch({ aiModel: 'llama3.2' }).aiModel).toBe('llama3.2')
  })
})

// ===========================================================================
// K. Architectural boundaries
// ===========================================================================

describe('V03-S5: K — the interpretation layer has no capability it should not have', () => {
  const aiDir = join(__dirname, '..', 'electron', 'core', 'ai')
  const files = [
    'constants.ts',
    'types.ts',
    'prompt.ts',
    'proposal-schema.ts',
    'ollama-client.ts',
    'interpreter.ts',
    'resolve-proposal.ts',
  ]

  it('contains no execution, process, filesystem or Electron capability', () => {
    for (const file of files) {
      const imports = code(readFileSync(join(aiDir, file), 'utf8'))
      const source = codeWithoutLiterals(readFileSync(join(aiDir, file), 'utf8'))
      expect(source, file).not.toMatch(/child_process|execSync|\bspawn\b|BrowserWindow|ipcRenderer|ipcMain/)
      expect(imports, file).not.toMatch(/from '(node:)?(fs|child_process|os|net|http|https)['"]/)
      expect(source, file).not.toMatch(/writeFile|readFile|unlink|rmdir|shell\./)
      expect(source, file).not.toMatch(/require\(/)
      expect(source, file).not.toMatch(/electron/i)
    }
  })

  it('never imports the launcher, the confirmation gate or the risk policy', () => {
    for (const file of files) {
      const source = code(readFileSync(join(aiDir, file), 'utf8'))
      expect(source, file).not.toMatch(/from '\.\.\/launcher'/)
      expect(source, file).not.toMatch(/from '\.\.\/confirmation'/)
      expect(source, file).not.toMatch(/from '\.\.\/risk-policy'/)
    }
  })

  it('imports only the deterministic engine, core types and its own modules', () => {
    const allowed = /^(\.\.\/(command-engine|types)|\.\/(constants|types|prompt|proposal-schema|ollama-client))$/
    for (const file of files) {
      const source = code(readFileSync(join(aiDir, file), 'utf8'))
      for (const match of source.matchAll(/from '([^']+)'/g)) {
        expect(match[1], `${file} imports ${match[1]}`).toMatch(allowed)
      }
    }
  })
})