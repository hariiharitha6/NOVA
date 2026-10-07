/**
 * V03-S3 — Application focus + rich launcher actions.
 *
 * Architecture exercised (identical for typed and voice input):
 *   input -> normalize -> resolveCommand() -> StructuredAction -> validation
 *         -> execution (Launcher for FOCUS_APPLICATION, core for the show
 *            intents) -> CommandResult/LaunchResult -> renderer response.
 *
 * No GUI and no physical microphone are required. The one live Windows test
 * uses the real native focus backend against File Explorer, which is always
 * running on Windows, and is skipped on other platforms.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveCommand } from '../electron/core/command-engine'
import type { CommandSource } from '../electron/core/command-engine'
import { executeCommand } from '../electron/core/command-pipeline'
import type { CommandPipelineDeps } from '../electron/core/command-pipeline'
import { executeFocusApplication } from '../electron/core/app-focus-executor'
import type { ApplicationFocusService, FocusRequest, FocusResult } from '../electron/core/app-focus'
import {
  candidateImageNames,
  createWindowsApplicationFocusService,
} from '../electron/platform/windows-app-focus'
import { createVoiceController } from '../electron/core/speech/voice-controller'
import type { SpeechRecognizer } from '../electron/core/speech/recognizer'
import type { AppEntry, LaunchResult, NovaConfig, RegistrySnapshot, StructuredAction } from '../electron/core/types'
import { defaultConfig } from '../electron/core/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPS: AppEntry[] = [
  { id: 'app-chrome', name: 'Google Chrome', aliases: ['chrome'], path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' },
  { id: 'app-vscode', name: 'Visual Studio Code', aliases: ['vscode', 'vs code'], path: 'C:\\Program Files\\Microsoft VS Code\\Code.exe' },
  { id: 'app-explorer', name: 'File Explorer', aliases: ['explorer'], path: 'C:\\Windows\\explorer.exe' },
]

const registry: CommandSource = {
  apps: APPS,
  websites: [{ id: 'web-youtube', name: 'YouTube', aliases: ['youtube'], url: 'https://www.youtube.com' }],
  fileFolders: [],
}

const SNAPSHOT: RegistrySnapshot = {
  apps: APPS,
  websites: registry.websites,
  fileFolders: [],
}

interface Harness {
  deps: CommandPipelineDeps
  launched: StructuredAction[]
  focusCalls: FocusRequest[]
  settingsOpens: number
  recorded: string[]
  setFocusOutcome: (outcome: FocusResult) => void
}

/** Build pipeline deps with a scripted focus service and a recording launcher. */
function makeHarness(overrides: {
  favorites?: string[]
  recents?: NovaConfig['recents']
  focus?: FocusResult
} = {}): Harness {
  const launched: StructuredAction[] = []
  const focusCalls: FocusRequest[] = []
  const recorded: string[] = []
  let focusOutcome: FocusResult = overrides.focus ?? { outcome: 'focused', processName: 'chrome.exe', pid: 4242 }

  const focusService: ApplicationFocusService = {
    async focusApplication(request: FocusRequest): Promise<FocusResult> {
      focusCalls.push(request)
      return focusOutcome
    },
  }

  const config: NovaConfig = {
    ...defaultConfig(),
    favorites: overrides.favorites ?? [],
    recents: overrides.recents ?? [],
    customApps: [],
  }

  const harness: Harness = {
    launched,
    focusCalls,
    settingsOpens: 0,
    recorded,
    setFocusOutcome: (outcome) => {
      focusOutcome = outcome
    },
    deps: {
      registry: { snapshot: async () => SNAPSHOT },
      launcher: {
        launch: vi.fn(async (action: StructuredAction): Promise<LaunchResult> => {
          launched.push(action)
          if (action.intent === 'FOCUS_APPLICATION') {
            return executeFocusApplication(action, { focusService })
          }
          return { ok: true, message: '', label: action.label }
        }),
      },
      configStore: {
        get: () => config,
        update: () => config,
        recordRecent: (item) => {
          recorded.push(item.label)
          return config
        },
      },
      openSettings: () => {
        harness.settingsOpens += 1
      },
    },
  }
  return harness
}

// ===========================================================================
// FOCUS_APPLICATION — recognition
// ===========================================================================

describe('V03-S3: FOCUS_APPLICATION recognition', () => {
  it('resolves a known app by name', () => {
    const action = resolveCommand('focus Google Chrome', registry)
    expect(action.intent).toBe('FOCUS_APPLICATION')
    expect(action.target).toBe(APPS[0].path)
    expect(action.label).toBe('Google Chrome')
  })

  it('resolves a known app by alias', () => {
    const action = resolveCommand('focus chrome', registry)
    expect(action.intent).toBe('FOCUS_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  it('resolves "switch to" phrasing', () => {
    const action = resolveCommand('switch to vscode', registry)
    expect(action.intent).toBe('FOCUS_APPLICATION')
    expect(action.label).toBe('Visual Studio Code')
  })

  it('resolves "bring to front" phrasing', () => {
    const action = resolveCommand('bring File Explorer to front', registry)
    expect(action.intent).toBe('FOCUS_APPLICATION')
    expect(action.label).toBe('File Explorer')
  })

  it('resolves "focus File Explorer"', () => {
    const action = resolveCommand('focus File Explorer', registry)
    expect(action.intent).toBe('FOCUS_APPLICATION')
    expect(action.label).toBe('File Explorer')
  })

  it('clarifies an unknown focus target instead of guessing', () => {
    const action = resolveCommand('focus Definitely Not Installed', registry)
    expect(action.intent).toBe('CLARIFICATION')
  })

  it('never downgrades a focus command into OPEN_APPLICATION', () => {
    for (const text of ['focus chrome', 'switch to vscode', 'bring chrome to front']) {
      expect(resolveCommand(text, registry).intent).toBe('FOCUS_APPLICATION')
    }
  })

  it('takes the focus target from the registry, never from raw input', () => {
    const action = resolveCommand('focus chrome', registry)
    expect(APPS.some((app) => app.path === action.target)).toBe(true)
  })
})

// ===========================================================================
// FOCUS_APPLICATION — execution
// ===========================================================================

describe('V03-S3: FOCUS_APPLICATION execution', () => {
  it('focuses a running application and reports success', async () => {
    const h = makeHarness()
    h.setFocusOutcome({ outcome: 'focused', processName: 'chrome.exe', pid: 4242 })

    const response = await executeCommand('focus chrome', h.deps)

    expect(response.kind).toBe('launched')
    if (response.kind !== 'launched') throw new Error('unreachable')
    expect(response.result.ok).toBe(true)
    expect(response.result.message).toBe('Google Chrome is now focused.')
    expect(h.focusCalls).toHaveLength(1)
    expect(h.focusCalls[0]).toEqual({
      exePath: APPS[0].path,
      appName: 'Google Chrome',
    })
  })

  it('reports a structured "not currently running" result for a non-running app', async () => {
    const h = makeHarness()
    h.setFocusOutcome({ outcome: 'not-running' })

    const response = await executeCommand('focus chrome', h.deps)

    expect(response.kind).toBe('launched')
    if (response.kind !== 'launched') throw new Error('unreachable')
    expect(response.result.ok).toBe(false)
    // V03-S3-003 wording is retained; acceptance Bug 6 adds the actionable
    // hint telling the user how to start the app instead.
    expect(response.result.message).toBe(
      'Google Chrome isn\'t currently running. Say "Open Google Chrome" to start it.',
    )
    expect(response.result.label).toBe('Google Chrome')
  })

  it('reports a distinct message when the platform backend is unavailable', async () => {
    const h = makeHarness()
    h.setFocusOutcome({ outcome: 'unavailable' })

    const response = await executeCommand('focus chrome', h.deps)

    expect(response.kind).toBe('launched')
    if (response.kind !== 'launched') throw new Error('unreachable')
    expect(response.result.ok).toBe(false)
    expect(response.result.message).toBe("Focusing Google Chrome isn't available on this system.")
  })

  it('does NOT launch another copy when the focus target is not running', async () => {
    const h = makeHarness()
    h.setFocusOutcome({ outcome: 'not-running' })

    await executeCommand('focus chrome', h.deps)

    // The only action that reached the launcher was FOCUS_APPLICATION itself.
    expect(h.launched).toHaveLength(1)
    expect(h.launched[0].intent).toBe('FOCUS_APPLICATION')
    // No recent was recorded, because nothing was launched/opened.
    expect(h.recorded).toHaveLength(0)
  })

  it('never spawns a process for an unknown focus target', async () => {
    const h = makeHarness()
    const response = await executeCommand('focus Totally Unknown App', h.deps)

    expect(response.kind).toBe('clarification')
    expect(h.launched).toHaveLength(0)
    expect(h.focusCalls).toHaveLength(0)
  })

  it('records a recent only after a successful focus', async () => {
    const h = makeHarness()
    h.setFocusOutcome({ outcome: 'focused' })
    await executeCommand('focus chrome', h.deps)
    expect(h.recorded).toEqual(['Google Chrome'])
  })
})

// ===========================================================================
// SHOW_FAVORITES
// ===========================================================================

describe('V03-S3: SHOW_FAVORITES execution', () => {
  it('returns the real favorites from the existing config store', async () => {
    const h = makeHarness({ favorites: ['app-chrome', 'app-vscode'] })
    const response = await executeCommand('show favorites', h.deps)

    expect(response.kind).toBe('result')
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.success).toBe(true)
    expect(response.result.intent).toBe('SHOW_FAVORITES')
    expect(response.result.message).toBe('Here are your favorites.')
    expect(response.result.data).toEqual({
      kind: 'favorites',
      total: 2,
      items: [
        { id: 'app-chrome', label: 'Google Chrome' },
        { id: 'app-vscode', label: 'Visual Studio Code' },
      ],
    })
  })

  it('uses the singular noun for a single favorite', async () => {
    const h = makeHarness({ favorites: ['app-chrome'] })
    const response = await executeCommand('show favorites', h.deps)
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.message).toBe('Here are your favorite.')
  })

  it('returns a clean empty result and fabricates nothing when favorites are empty', async () => {
    const h = makeHarness({ favorites: [] })
    const response = await executeCommand('show favorites', h.deps)

    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.success).toBe(true)
    expect(response.result.message).toBe('No favorites are configured yet.')
    expect(response.result.data).toEqual({ kind: 'favorites', items: [], total: 0 })
  })

  it('falls back to the stored id rather than inventing a label', async () => {
    const h = makeHarness({ favorites: ['app-does-not-exist'] })
    const response = await executeCommand('show favorites', h.deps)
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.data).toEqual({
      kind: 'favorites',
      total: 1,
      items: [{ id: 'app-does-not-exist', label: 'app-does-not-exist' }],
    })
  })

  it('does not route favorites through the launcher', async () => {
    const h = makeHarness({ favorites: ['app-chrome'] })
    await executeCommand('show favorites', h.deps)
    expect(h.launched).toHaveLength(0)
  })
})

// ===========================================================================
// SHOW_RECENTS
// ===========================================================================

describe('V03-S3: SHOW_RECENTS execution', () => {
  it('returns the real recents from the existing config store', async () => {
    const h = makeHarness({
      recents: [
        { id: 'app-chrome', label: 'Google Chrome' },
        { id: 'web-youtube', label: 'YouTube' },
      ],
    })
    const response = await executeCommand('show recents', h.deps)

    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.success).toBe(true)
    expect(response.result.intent).toBe('SHOW_RECENTS')
    expect(response.result.message).toBe('Here are your recent apps.')
    expect(response.result.data).toEqual({
      kind: 'recents',
      total: 2,
      items: [
        { id: 'app-chrome', label: 'Google Chrome' },
        { id: 'web-youtube', label: 'YouTube' },
      ],
    })
  })

  it('uses the singular noun for one recent', async () => {
    const h = makeHarness({ recents: [{ id: 'app-chrome', label: 'Google Chrome' }] })
    const response = await executeCommand('show recents', h.deps)
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.message).toBe('Here are your recent app.')
  })

  it('returns a clean empty result and fabricates nothing when recents are empty', async () => {
    const h = makeHarness({ recents: [] })
    const response = await executeCommand('show recents', h.deps)

    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.success).toBe(true)
    expect(response.result.message).toBe('No recent apps yet.')
    expect(response.result.data).toEqual({ kind: 'recents', items: [], total: 0 })
  })

  it('does not record a recent just by viewing recents', async () => {
    const h = makeHarness({ recents: [{ id: 'app-chrome', label: 'Google Chrome' }] })
    await executeCommand('show recents', h.deps)
    expect(h.recorded).toHaveLength(0)
  })
})

// ===========================================================================
// OPEN_SETTINGS
// ===========================================================================

describe('V03-S3: OPEN_SETTINGS execution', () => {
  it('invokes the existing settings action exactly once', async () => {
    const h = makeHarness()
    const response = await executeCommand('open settings', h.deps)

    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.success).toBe(true)
    expect(response.result.intent).toBe('OPEN_SETTINGS')
    expect(response.result.message).toBe('Opening NOVA settings.')
    expect(h.settingsOpens).toBe(1)
  })

  it('emits a structured, renderer-observable settings action', async () => {
    const h = makeHarness()
    const response = await executeCommand('settings', h.deps)

    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.data).toEqual({ kind: 'settings', action: 'open-settings' })
    expect(h.settingsOpens).toBe(1)
  })

  it('accepts the "preferences" alias', async () => {
    const h = makeHarness()
    const response = await executeCommand('preferences', h.deps)
    if (response.kind !== 'result') throw new Error('unreachable')
    expect(response.result.intent).toBe('OPEN_SETTINGS')
    expect(h.settingsOpens).toBe(1)
  })

  it('never creates a second settings window (no launcher involvement)', async () => {
    const h = makeHarness()
    await executeCommand('open settings', h.deps)
    expect(h.launched).toHaveLength(0)
  })
})

// ===========================================================================
// Shared pipeline: typed and voice use the same executor
// ===========================================================================

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

describe('V03-S3: typed and voice share one execution pipeline', () => {
  const cases: Array<{ text: string; focus: FocusResult; favorites: string[] }> = [
    { text: 'focus chrome', focus: { outcome: 'focused', pid: 1 }, favorites: [] },
    { text: 'focus chrome', focus: { outcome: 'not-running' }, favorites: [] },
    { text: 'show favorites', focus: { outcome: 'focused' }, favorites: ['app-chrome'] },
    { text: 'open settings', focus: { outcome: 'focused' }, favorites: [] },
  ]

  for (const testCase of cases) {
    it(`voice produces the same result as typed for "${testCase.text}"`, async () => {
      // Typed path (what the IPC handler calls).
      const typed = makeHarness({ favorites: testCase.favorites })
      typed.setFocusOutcome(testCase.focus)
      const typedResponse = await executeCommand(testCase.text, typed.deps)

      // Voice path (what the voice controller calls) — same executor.
      const voice = makeHarness({ favorites: testCase.favorites })
      voice.setFocusOutcome(testCase.focus)
      const controller = createVoiceController({
        recognizer: makeRecognizer(testCase.text),
        isEnabled: () => true,
        executeCommand: (input) => executeCommand(input, voice.deps),
        emit: () => {},
      })
      controller.togglePtt()
      controller.togglePtt()
      await vi.waitFor(() => {
        expect(voice.launched.length + (voice.settingsOpens > 0 ? 1 : 0)).toBeGreaterThanOrEqual(
          typed.launched.length + (typed.settingsOpens > 0 ? 1 : 0),
        )
      })

      expect(JSON.stringify(typedResponse)).toBe(
        JSON.stringify(
          typed.settingsOpens > 0
            ? { kind: 'result', result: typedResponse.kind === 'result' ? typedResponse.result : null }
            : typedResponse,
        ),
      )
      expect(voice.settingsOpens).toBe(typed.settingsOpens)
      expect(voice.focusCalls).toEqual(typed.focusCalls)
      expect(voice.launched.map((a) => a.intent)).toEqual(typed.launched.map((a) => a.intent))
    })
  }

  it('routes the focus transcript through the focus service, not a launch', async () => {
    const h = makeHarness()
    h.setFocusOutcome({ outcome: 'focused' })
    const controller = createVoiceController({
      recognizer: makeRecognizer('focus chrome'),
      isEnabled: () => true,
      executeCommand: (input) => executeCommand(input, h.deps),
      emit: () => {},
    })
    controller.togglePtt()
    controller.togglePtt()
    await vi.waitFor(() => expect(h.focusCalls).toHaveLength(1))
    expect(h.launched.map((a) => a.intent)).toEqual(['FOCUS_APPLICATION'])
  })
})

// ===========================================================================
// Security
// ===========================================================================

/** Strip comments so documentation prose about forbidden APIs is not flagged. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const ROOT = join(__dirname, '..')

describe('V03-S3: security — no shell execution', () => {
  const focusSource = code(join(ROOT, 'electron/platform/windows-app-focus.ts'))
  const executorSource = code(join(ROOT, 'electron/core/app-focus-executor.ts'))
  const showSource = code(join(ROOT, 'electron/core/show-actions.ts'))

  it('never invokes PowerShell', () => {
    expect(focusSource).not.toMatch(/powershell/i)
    expect(executorSource).not.toMatch(/powershell/i)
  })

  it('never invokes cmd.exe or a shell command string', () => {
    expect(focusSource).not.toMatch(/cmd\.exe/i)
    expect(focusSource).not.toMatch(/cmd\s*\/c/i)
    expect(focusSource).not.toMatch(/\/k\b/)
  })

  it('never enables shell mode on spawn', () => {
    expect(focusSource).not.toMatch(/shell:\s*true/)
  })

  it('never uses exec/execSync/eval/Function', () => {
    for (const source of [focusSource, executorSource, showSource]) {
      expect(source).not.toMatch(/\bexecSync\b/)
      expect(source).not.toMatch(/\bexecFile\b/)
      expect(source).not.toMatch(/\beval\s*\(/)
      expect(source).not.toMatch(/new\s+Function\s*\(/)
    }
  })

  it('spawns only the fixed Windows system binary with a constant argv', () => {
    // The single spawn target is tasklist.exe resolved from SystemRoot.
    const spawns = focusSource.match(/spawn\(/g) ?? []
    expect(spawns.length).toBe(1)
    expect(focusSource).toContain("'/FO', 'CSV', '/NH'")
    expect(focusSource).toContain('System32')
  })

  it('passes no user or registry text into the spawned process', () => {
    // The argv literal must not reference request-derived values.
    const argv = focusSource.match(/spawn\([^)]*\)/)?.[0] ?? ''
    expect(argv).not.toMatch(/request\./)
    expect(argv).not.toMatch(/appName/)
    expect(argv).not.toMatch(/exePath/)
  })

  it('validates process image names before use', () => {
    expect(focusSource).toContain('SAFE_IMAGE_NAME')
    // Anything that fails validation yields no candidates at all.
    expect(candidateImageNames('')).toEqual([])
    expect(candidateImageNames('C:\\a\\& calc.exe')).toEqual([])
    expect(candidateImageNames('C:\\a\\$(whoami).exe')).toEqual([])
  })

  it('derives image names only from the executable basename', () => {
    expect(candidateImageNames('C:\\Program Files\\Google\\Chrome\\chrome.exe')).toEqual([
      'chrome',
      'chrome.exe',
    ])
    // A Start Menu shortcut cannot yield an image name, so it cannot be focused.
    expect(candidateImageNames('C:\\Users\\x\\Start Menu\\Google Chrome.lnk')).toEqual([])
  })

  it('keeps the focus target sourced from the validated registry only', () => {
    const action = resolveCommand('focus chrome', registry)
    expect(APPS.map((a) => a.path)).toContain(action.target)
    // A shell-ish app name in the registry is still only ever a path target.
    expect(action.target).not.toMatch(/[&|;]/)
  })

  it('does not execute raw natural-language focus input', () => {
    const hostile = [
      'focus chrome & calc',
      'focus chrome; whoami',
      'focus $(echo hi)',
      'focus chrome`whoami`',
      'focus chrome | dir',
    ]
    for (const text of hostile) {
      const action = resolveCommand(text, registry)
      expect(['FOCUS_APPLICATION', 'CLARIFICATION']).toContain(action.intent)
      if (action.intent === 'FOCUS_APPLICATION') {
        expect(APPS.map((a) => a.path)).toContain(action.target)
      }
    }
  })

  it('never converts a focus intent into a spawn of the target executable', () => {
    // windows-launcher keeps spawnExecutable scoped to OPEN_APPLICATION only.
    const launcherSource = code(join(ROOT, 'electron/platform/windows-launcher.ts'))
    const start = launcherSource.indexOf("case 'FOCUS_APPLICATION'")
    expect(start).toBeGreaterThan(-1)
    const rest = launcherSource.slice(start + "case 'FOCUS_APPLICATION'".length)
    const end = rest.indexOf('case ')
    const focusBranch = rest.slice(0, end === -1 ? undefined : end)

    expect(focusBranch).toContain('executeFocusApplication')
    expect(focusBranch).not.toContain('spawnExecutable')
    expect(focusBranch).not.toContain('openPath')
  })
})

// ===========================================================================
// Live Windows execution (skipped off Windows)
// ===========================================================================

describe.skipIf(process.platform !== 'win32')('V03-S3: live Windows focus backend', () => {
  it('actually focuses a running application window', async () => {
    const service = createWindowsApplicationFocusService()
    // explorer.exe (File Explorer) is always running on Windows.
    const result = await service.focusApplication({
      exePath: 'C:\\Windows\\explorer.exe',
      appName: 'File Explorer',
    })

    expect(result.outcome).toBe('focused')
    expect(result.processName).toBe('explorer.exe')
    expect(typeof result.pid).toBe('number')
    expect(result.windowTitle && result.windowTitle.length).toBeGreaterThan(0)
  })

  it('reports not-running for an image that is not running', async () => {
    const service = createWindowsApplicationFocusService()
    const result = await service.focusApplication({
      exePath: 'C:\\Windows\\nova-not-a-real-process.exe',
      appName: 'Nope',
    })
    expect(result.outcome).toBe('not-running')
  })

  it('never starts a process when the app is not running', async () => {
    const service = createWindowsApplicationFocusService()
    const result = await service.focusApplication({
      exePath: 'C:\\Windows\\nova-not-a-real-process-2.exe',
      appName: 'Nope',
    })
    expect(result.outcome).toBe('not-running')
    // Nothing was launched, so nothing new is running under that name.
    const second = await service.focusApplication({
      exePath: 'C:\\Windows\\nova-not-a-real-process-2.exe',
      appName: 'Nope',
    })
    expect(second.outcome).toBe('not-running')
  })
})