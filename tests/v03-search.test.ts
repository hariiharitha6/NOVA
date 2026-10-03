import { describe, expect, it, vi } from 'vitest'
import { resolveCommand } from '../electron/core/command-engine'
import type { CommandSource } from '../electron/core/command-engine'
import { executeCommand } from '../electron/core/command-pipeline'
import type { CommandPipelineDeps } from '../electron/core/command-pipeline'
import type { LaunchResult, NovaConfig, RegistrySnapshot, StructuredAction } from '../electron/core/types'

const registry: CommandSource = {
  apps: [],
  websites: [],
  fileFolders: [],
}

function makePipeline(): { deps: CommandPipelineDeps; launched: StructuredAction[] } {
  const launched: StructuredAction[] = []
  const config: NovaConfig = {
    version: 1,
    hotkey: 'Control+J',
    alwaysOnTop: true,
    startup: false,
    position: null,
    favorites: [],
    recents: [],
    customApps: [],
    websites: [],
    fileFolders: [],
    defaultsSeeded: false,
    voiceEnabled: false,
    pttHotkey: 'Control+Shift+J',
    speechLanguage: 'en-US',
    wakeWordEnabled: false,
    wakeWord: 'Hey NOVA',
    shortcutsMigratedV2: false,
  }
  const deps: CommandPipelineDeps = {
    registry: {
      snapshot: async (): Promise<RegistrySnapshot> => ({ apps: [], websites: [], fileFolders: [] }),
    },
    launcher: {
      launch: async (action: StructuredAction): Promise<LaunchResult> => {
        launched.push(action)
        return { ok: true, message: '', label: action.label }
      },
    },
    configStore: {
      get: () => config,
      update: () => config,
      recordRecent: vi.fn(() => config),
    },
  }
  return { deps, launched }
}

const SAFE_INTENTS = new Set(['OPEN_APPLICATION', 'OPEN_WEBSITE', 'OPEN_FILE', 'OPEN_FOLDER', 'SEARCH_WEB', 'SEARCH_YOUTUBE', 'OPEN_SETTINGS', 'FOCUS_APPLICATION', 'SHOW_FAVORITES', 'SHOW_RECENTS', 'CLARIFICATION', 'UNKNOWN'])

describe('V03-S2: SEARCH_WEB recognition', () => {
  it('resolves "search for cats"', () => {
    const action = resolveCommand('search for cats', registry)
    expect(action.intent).toBe('SEARCH_WEB')
    expect(action.target).toContain('google.com/search')
    expect(action.target).toContain('q=')
  })

  it('resolves "search google for cats"', () => {
    const action = resolveCommand('search google for cats', registry)
    expect(action.intent).toBe('SEARCH_WEB')
    expect(action.target).toContain('google.com/search')
  })

  it('resolves "search the web for cats"', () => {
    const action = resolveCommand('search the web for cats', registry)
    expect(action.intent).toBe('SEARCH_WEB')
    expect(action.target).toContain('google.com/search')
  })

  it('does not treat a query containing "yt" as YouTube', () => {
    const action = resolveCommand('search for byte', registry)
    expect(action.intent).toBe('SEARCH_WEB')
  })
})

describe('V03-S2: SEARCH_YOUTUBE recognition', () => {
  it('resolves "search youtube for python"', () => {
    const action = resolveCommand('search youtube for python', registry)
    expect(action.intent).toBe('SEARCH_YOUTUBE')
    expect(action.target).toContain('youtube.com/results')
  })

  it('resolves "search YouTube for python"', () => {
    const action = resolveCommand('search YouTube for python', registry)
    expect(action.intent).toBe('SEARCH_YOUTUBE')
    expect(action.target).toContain('youtube.com/results')
  })

  it('resolves "youtube python tutorials"', () => {
    const action = resolveCommand('youtube python tutorials', registry)
    expect(action.intent).toBe('SEARCH_YOUTUBE')
  })
})

describe('V03-S2: query extraction and encoding', () => {
  it('encodes spaces and multiple words', () => {
    const action = resolveCommand('search for hello world', registry)
    expect(action.intent).toBe('SEARCH_WEB')
    expect(action.target).toContain('hello%20world')
  })

  it('handles ampersands', () => {
    const action = resolveCommand('search for cats & dogs', registry)
    expect(action.intent).toBe('SEARCH_WEB')
    expect(action.target).toContain('cats%20%26%20dogs')
  })
})

describe('V03-S2: empty/invalid queries', () => {
  it('does not launch blank search', () => {
    const action = resolveCommand('search for', registry)
    expect(action.intent).toBe('CLARIFICATION')
  })

  it('handles empty youtube search', () => {
    const action = resolveCommand('search youtube for', registry)
    expect(action.intent).toBe('CLARIFICATION')
  })
})

describe('V03-S2: security', () => {
  it('keeps query as data for search', () => {
    const action = resolveCommand('search for https://evil.example', registry)
    expect(action.intent).toBe('SEARCH_WEB')
    expect(action.target).toContain('google.com/search')
  })

  it('never emits raw shell intent', () => {
    const inputs = ['search for rm -rf /', 'search for & dir']
    for (const input of inputs) {
      const action = resolveCommand(input, registry)
      expect(SAFE_INTENTS.has(action.intent)).toBe(true)
    }
  })
})

describe('V03-S2: shared command pipeline execution', () => {
  it('typed search reaches the launcher with a Google URL', async () => {
    const { deps, launched } = makePipeline()
    const response = await executeCommand('search for cats', deps)
    expect(response.kind).toBe('launched')
    expect(launched).toHaveLength(1)
    expect(launched[0].intent).toBe('SEARCH_WEB')
    expect(launched[0].target).toContain('google.com/search')
  })

  it('typed youtube search reaches the launcher with a YouTube URL', async () => {
    const { deps, launched } = makePipeline()
    const response = await executeCommand('search youtube for python', deps)
    expect(response.kind).toBe('launched')
    expect(launched).toHaveLength(1)
    expect(launched[0].intent).toBe('SEARCH_YOUTUBE')
    expect(launched[0].target).toContain('youtube.com/results')
  })

  it('does not launch when the query is empty', async () => {
    const { deps, launched } = makePipeline()
    const response = await executeCommand('search for', deps)
    expect(response.kind).toBe('clarification')
    expect(launched).toHaveLength(0)
  })
})
