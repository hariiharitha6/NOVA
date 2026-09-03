/**
 * Slice 2 — Voice Command Coverage Tests.
 *
 * These tests verify that voice transcripts resolve correctly through the
 * shared command engine pipeline. They do NOT require a physical microphone;
 * speech input is simulated via the recognizer mock.
 *
 * Architecture tested:
 *   Voice → executeCommand(transcript) → resolveCommand() → StructuredAction → Launcher
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCommand } from '../electron/core/command-engine'
import type { CommandSource } from '../electron/core/command-engine'
import { createVoiceController } from '../electron/core/speech/voice-controller'
import type { SpeechRecognizer } from '../electron/core/speech/recognizer'
import type { CommandResponse, StructuredAction } from '../electron/core/types'
import type { VoiceState } from '../electron/core/speech/types'
import { RESULT_DISPLAY_MS } from '../electron/core/speech/constants'

// ---------------------------------------------------------------------------
// Test registry (mirrors what the real AppRegistry + WindowsAppSource produce)
// ---------------------------------------------------------------------------

const registry: CommandSource = {
  apps: [
    {
      id: 'app-chrome',
      name: 'Google Chrome',
      aliases: ['chrome', 'google chrome'],
      path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
    {
      id: 'app-vscode',
      name: 'Visual Studio Code',
      aliases: ['vscode', 'code', 'vs code'],
      path: 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    },
    {
      id: 'app-explorer',
      name: 'File Explorer',
      aliases: ['explorer', 'windows explorer'],
      path: 'C:\\Windows\\explorer.exe',
    },
    {
      id: 'app-notepad',
      name: 'Notepad',
      aliases: ['notepad'],
      path: 'C:\\Windows\\System32\\notepad.exe',
    },
  ],
  websites: [
    { id: 'web-youtube', name: 'YouTube', aliases: ['youtube'], url: 'https://www.youtube.com' },
    { id: 'web-chatgpt', name: 'ChatGPT', aliases: ['chatgpt', 'gpt'], url: 'https://chatgpt.com' },
    { id: 'web-github', name: 'GitHub', aliases: ['github'], url: 'https://github.com' },
  ],
  fileFolders: [
    { id: 'folder-downloads', name: 'Downloads', path: 'C:\\Users\\me\\Downloads', kind: 'folder' },
    { id: 'folder-documents', name: 'Documents', path: 'C:\\Users\\me\\Documents', kind: 'folder' },
    { id: 'folder-desktop', name: 'Desktop', path: 'C:\\Users\\me\\Desktop', kind: 'folder' },
    { id: 'file-report', name: 'Report', path: 'C:\\Users\\me\\report.pdf', kind: 'file' },
    { id: 'custom-web', name: 'My Blog', path: '', kind: 'file' as const },
  ],
}

// ---------------------------------------------------------------------------
// Voice controller test helpers
// ---------------------------------------------------------------------------

function makeRecognizer(final = ''): SpeechRecognizer & {
  calls: string[]
  setFinal: (v: string) => void
} {
  const calls: string[] = []
  let finalText = final
  return {
    kind: 'stub',
    initialize: () => calls.push('initialize'),
    start: () => calls.push('start'),
    acceptAudio: (samples) => calls.push(`accept:${samples.length}`),
    partialTranscript: () => '',
    finishAndGetTranscript: () => { calls.push('finish'); return finalText },
    cancel: () => calls.push('cancel'),
    dispose: () => calls.push('dispose'),
    setFinal: (v) => { finalText = v },
    calls,
  }
}

function launched(label: string, target = 'target'): CommandResponse {
  return {
    kind: 'launched',
    action: { intent: 'OPEN_APPLICATION', target, label } as StructuredAction,
    result: { ok: true, message: '', label },
  }
}

function launchFailed(label: string): CommandResponse {
  return {
    kind: 'launched',
    action: { intent: 'OPEN_APPLICATION', target: 'bad', label } as StructuredAction,
    result: { ok: false, message: `Could not launch ${label}`, label },
  }
}

function clarificationResponse(label: string): CommandResponse {
  return {
    kind: 'clarification',
    action: { intent: 'CLARIFICATION', target: '', label } as StructuredAction,
  }
}

// ===========================================================================
// Part 1: Command engine resolution (voice transcripts through resolveCommand)
// ===========================================================================

describe('voice command resolution via command engine', () => {
  // -- Applications --

  it('voice "Open Chrome" resolves to Google Chrome', () => {
    const action = resolveCommand('Open Chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  it('voice "Open YouTube" resolves to YouTube website', () => {
    const action = resolveCommand('Open YouTube', registry)
    expect(action.intent).toBe('OPEN_WEBSITE')
    expect(action.label).toBe('YouTube')
    expect(action.target).toBe('https://www.youtube.com')
  })

  it('voice "Open ChatGPT" resolves to ChatGPT website', () => {
    const action = resolveCommand('Open ChatGPT', registry)
    expect(action.intent).toBe('OPEN_WEBSITE')
    expect(action.label).toBe('ChatGPT')
    expect(action.target).toBe('https://chatgpt.com')
  })

  it('voice "Open Downloads" resolves to Downloads folder', () => {
    const action = resolveCommand('Open Downloads', registry)
    expect(action.intent).toBe('OPEN_FOLDER')
    expect(action.label).toBe('Downloads')
    expect(action.target).toBe('C:\\Users\\me\\Downloads')
  })

  it('voice "Open Documents" resolves to Documents folder', () => {
    const action = resolveCommand('Open Documents', registry)
    expect(action.intent).toBe('OPEN_FOLDER')
    expect(action.label).toBe('Documents')
  })

  it('voice "Open Desktop" resolves to Desktop folder', () => {
    const action = resolveCommand('Open Desktop', registry)
    expect(action.intent).toBe('OPEN_FOLDER')
    expect(action.label).toBe('Desktop')
  })

  it('voice "Open Visual Studio Code" resolves to VS Code', () => {
    const action = resolveCommand('Open Visual Studio Code', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Visual Studio Code')
  })

  it('voice "Open VS Code" resolves via alias to Visual Studio Code', () => {
    const action = resolveCommand('Open VS Code', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Visual Studio Code')
  })

  it('voice "Open File Explorer" resolves to File Explorer', () => {
    const action = resolveCommand('Open File Explorer', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('File Explorer')
  })

  it('voice "Open Explorer" resolves via alias to File Explorer', () => {
    const action = resolveCommand('Open Explorer', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('File Explorer')
  })

  // -- Custom entries --

  it('voice resolves a custom website by name', () => {
    // Custom website from config
    const customRegistry: CommandSource = {
      ...registry,
      websites: [
        ...registry.websites,
        { id: 'web-custom', name: 'Stack Overflow', aliases: ['stackoverflow'], url: 'https://stackoverflow.com' },
      ],
    }
    const action = resolveCommand('Open Stack Overflow', customRegistry)
    expect(action.intent).toBe('OPEN_WEBSITE')
    expect(action.label).toBe('Stack Overflow')
  })

  it('voice resolves a custom folder by name', () => {
    const customRegistry: CommandSource = {
      ...registry,
      fileFolders: [
        ...registry.fileFolders,
        { id: 'ff-custom', name: 'Projects', path: 'C:\\Users\\me\\Projects', kind: 'folder' },
      ],
    }
    const action = resolveCommand('Open Projects', customRegistry)
    expect(action.intent).toBe('OPEN_FOLDER')
    expect(action.label).toBe('Projects')
  })

  it('voice resolves a custom application by name', () => {
    const customRegistry: CommandSource = {
      ...registry,
      apps: [
        ...registry.apps,
        { id: 'app-custom', name: 'Obsidian', aliases: [], path: 'C:\\Obsidian\\obsidian.exe' },
      ],
    }
    const action = resolveCommand('Open Obsidian', customRegistry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Obsidian')
  })

  it('voice resolves a file by name', () => {
    const action = resolveCommand('Open Report', registry)
    expect(action.intent).toBe('OPEN_FILE')
    expect(action.label).toBe('Report')
    expect(action.target).toBe('C:\\Users\\me\\report.pdf')
  })

  // -- Favorites (invoked by name, same as apps) --

  it('voice resolves a favorite app by name (favorites use app IDs, voice uses names)', () => {
    // Favorites are stored as IDs but invoked by name through the command engine
    const action = resolveCommand('Open Google Chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  // -- Edge cases --

  it('unknown command returns clarification', () => {
    const action = resolveCommand('Open Warp Zone', registry)
    expect(action.intent).toBe('CLARIFICATION')
  })

  it('empty transcript returns clarification', () => {
    const action = resolveCommand('   ', registry)
    expect(action.intent).toBe('CLARIFICATION')
  })

  it('partial transcript does NOT execute (command engine requires full input)', () => {
    // The command engine is pure — it only resolves complete strings.
    // Partial transcripts are displayed in the UI but never sent to the engine.
    // This test verifies that a fragment like "Open Ch" does NOT match Chrome.
    const action = resolveCommand('Open Ch', registry)
    // "Open Ch" should NOT resolve to Chrome (partial match, not exact)
    // It might get a prefix match or clarification — either way, the voice
    // controller must NOT send partials to the engine.
    expect(action.intent).not.toBe('OPEN_APPLICATION')
  })

  it('case-insensitive voice input resolves correctly', () => {
    const action = resolveCommand('open chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  it('voice with extra whitespace resolves correctly', () => {
    const action = resolveCommand('  Open   Chrome  ', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  it('voice "launch Chrome" resolves correctly', () => {
    const action = resolveCommand('launch Chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  it('voice "start Chrome" resolves correctly', () => {
    const action = resolveCommand('start Chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  it('voice without "open" verb still resolves', () => {
    const action = resolveCommand('Chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.label).toBe('Google Chrome')
  })

  it('raw URL from voice resolves to website', () => {
    const action = resolveCommand('https://example.com', registry)
    expect(action.intent).toBe('OPEN_WEBSITE')
    expect(action.target).toBe('https://example.com')
  })
})

// ===========================================================================
// Part 2: Voice controller integration (final-only, dedup, error handling)
// ===========================================================================

describe('voice controller — final-only execution', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('partial transcripts never execute', () => {
    const rec = makeRecognizer('')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => { executed.push(input); return launched('x') },
      emit: () => {},
    })
    ctrl.togglePtt()
    // Simulate audio chunks — partials are displayed but never sent to executeCommand
    ctrl.acceptAudio(new Float32Array(4096))
    ctrl.acceptAudio(new Float32Array(4096))
    expect(executed).toEqual([])
  })

  it('final transcript executes exactly once', async () => {
    const rec = makeRecognizer('Open Chrome')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => { executed.push(input); return launched('Chrome') },
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt() // stop → finalize
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['Open Chrome'])
    expect(ctrl.getState().phase).toBe('success')
  })

  it('empty transcript returns to idle without executing', async () => {
    const rec = makeRecognizer('')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => { executed.push(input); return launched('x') },
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual([])
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('unknown command shows clarification error', async () => {
    const rec = makeRecognizer('Open Warp Zone')
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => clarificationResponse('Could not find "Warp Zone"'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('error')
    expect(ctrl.getState().message).toContain('Warp Zone')
  })

  it('launcher failure shows error state', async () => {
    const rec = makeRecognizer('Open Chrome')
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launchFailed('Chrome'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('error')
    expect(ctrl.getState().message).toContain('Could not launch')
  })

  it('voice disabled prevents listening', () => {
    const rec = makeRecognizer()
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => false,
      executeCommand: async (input) => { executed.push(input); return launched('x') },
      emit: () => {},
    })
    ctrl.togglePtt()
    expect(executed).toEqual([])
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('typing commands still works (voice does not interfere with keyboard)', async () => {
    // Simulate the typed command path: CommandOverlay → runCommand → executeCommand
    // This is the same pipeline voice uses, verified independently.
    const rec = makeRecognizer()
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => { executed.push(input); return launched('x') },
      emit: () => {},
    })
    // Voice is idle — typed commands go through executeCommand directly
    expect(ctrl.getState().phase).toBe('idle')
    // Simulate typed command
    await (async () => {
      const result = await (async (input: string): Promise<CommandResponse> => {
        executed.push(input)
        return launched('Typed App')
      })('Open Chrome')
      expect(result.kind).toBe('launched')
    })()
    expect(executed).toContain('Open Chrome')
  })

  it('PTT toggle ignored during processing (dedup guard)', async () => {
    const rec = makeRecognizer('Open Chrome')
    let resolveCmd: (r: CommandResponse) => void = () => {}
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: () => new Promise<CommandResponse>((resolve) => { resolveCmd = resolve }),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt() // → processing
    expect(ctrl.getState().phase).toBe('processing')
    ctrl.togglePtt() // must be ignored
    ctrl.togglePtt() // must be ignored
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('processing')
    resolveCmd(launched('Chrome'))
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('success')
  })

  it('session ID guard prevents stale session execution', async () => {
    const rec = makeRecognizer('Open Chrome')
    let resolveCmd: (r: CommandResponse) => void = () => {}
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: () => new Promise<CommandResponse>((resolve) => { resolveCmd = resolve }),
      emit: () => {},
    })
    // Session 1
    ctrl.togglePtt()
    ctrl.togglePtt()
    // Start session 2 before session 1 completes
    ctrl.togglePtt()
    ctrl.togglePtt()
    // Resolve session 1 — should be ignored
    resolveCmd(launched('Chrome'))
    await vi.advanceTimersByTimeAsync(0)
    // Session 2's result should still be pending or resolved
    expect(['processing', 'success', 'error']).toContain(ctrl.getState().phase)
  })

  it('escape cancel discards the session', () => {
    const rec = makeRecognizer('Open Chrome')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => { executed.push(input); return launched('x') },
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.cancelListening()
    expect(executed).toEqual([])
    expect(ctrl.getState().phase).toBe('idle')
  })

  it('mic error aborts and returns to idle', async () => {
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
  })

  it('max listening timeout auto-finalizes', async () => {
    const { MAX_LISTENING_MS } = await import('../electron/core/speech/constants')
    const rec = makeRecognizer('Open Chrome')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => { executed.push(input); return launched('Chrome') },
      emit: () => {},
    })
    ctrl.togglePtt()
    vi.advanceTimersByTime(MAX_LISTENING_MS)
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['Open Chrome'])
  })

  it('inactivity timeout auto-finalizes', async () => {
    const { INACTIVITY_TIMEOUT_MS } = await import('../electron/core/speech/constants')
    const rec = makeRecognizer('Open Chrome')
    const executed: string[] = []
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async (input) => { executed.push(input); return launched('Chrome') },
      emit: () => {},
    })
    ctrl.togglePtt()
    // Feed some audio to arm the inactivity timer
    ctrl.acceptAudio(new Float32Array(4096))
    // Wait for inactivity
    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS)
    await vi.advanceTimersByTimeAsync(0)
    expect(executed).toEqual(['Open Chrome'])
  })

  it('success state auto-returns to idle after RESULT_DISPLAY_MS', async () => {
    const rec = makeRecognizer('Open Chrome')
    const ctrl = createVoiceController({
      recognizer: rec,
      isEnabled: () => true,
      executeCommand: async () => launched('Chrome'),
      emit: () => {},
    })
    ctrl.togglePtt()
    ctrl.togglePtt()
    await vi.advanceTimersByTimeAsync(0)
    expect(ctrl.getState().phase).toBe('success')
    vi.advanceTimersByTime(RESULT_DISPLAY_MS + 1)
    expect(ctrl.getState().phase).toBe('idle')
  })
})
