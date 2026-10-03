import { describe, expect, it } from 'vitest'
import { resolveCommand } from '../electron/core/command-engine'
import type { CommandSource } from '../electron/core/command-engine'

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
      aliases: ['vscode', 'code'],
      path: 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    },
  ],
  websites: [
    { id: 'web-youtube', name: 'YouTube', aliases: ['youtube'], url: 'https://www.youtube.com' },
    { id: 'web-github', name: 'GitHub', aliases: ['github'], url: 'https://github.com' },
  ],
  fileFolders: [
    { id: 'folder-downloads', name: 'Downloads', path: 'C:\\Users\\me\\Downloads', kind: 'folder' },
    { id: 'folder-documents', name: 'Documents', path: 'C:\\Users\\me\\Documents', kind: 'folder' },
    { id: 'folder-desktop', name: 'Desktop', path: 'C:\\Users\\me\\Desktop', kind: 'folder' },
    { id: 'file-report', name: 'Report', path: 'C:\\Users\\me\\report.pdf', kind: 'file' },
  ],
}

const SAFE_INTENTS = new Set(['OPEN_APPLICATION', 'OPEN_WEBSITE', 'OPEN_FILE', 'OPEN_FOLDER', 'SEARCH_WEB', 'SEARCH_YOUTUBE', 'OPEN_SETTINGS', 'FOCUS_APPLICATION', 'SHOW_FAVORITES', 'SHOW_RECENTS', 'CLARIFICATION', 'UNKNOWN'])

describe('resolveCommand', () => {
  it('resolves an exact app name', () => {
    const action = resolveCommand('Open Google Chrome', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.target).toBe(registry.apps[0].path)
    expect(action.label).toBe('Google Chrome')
  })

  it('resolves an app alias (case-insensitive)', () => {
    const action = resolveCommand('open CHROME', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.target).toBe(registry.apps[0].path)
  })

  it('resolves an app by name prefix', () => {
    const action = resolveCommand('Open Visual', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.target).toBe(registry.apps[1].path)
  })

  it('resolves a bare app name without the "open" verb', () => {
    const action = resolveCommand('vscode', registry)
    expect(action.intent).toBe('OPEN_APPLICATION')
    expect(action.target).toBe(registry.apps[1].path)
  })

  it('resolves a website by name', () => {
    const action = resolveCommand('Open YouTube', registry)
    expect(action.intent).toBe('OPEN_WEBSITE')
    expect(action.target).toBe('https://www.youtube.com')
  })

  it('resolves a raw http(s) URL', () => {
    const action = resolveCommand('https://example.com/foo', registry)
    expect(action.intent).toBe('OPEN_WEBSITE')
    expect(action.target).toBe('https://example.com/foo')
  })

  it('resolves a folder', () => {
    const action = resolveCommand('Open Downloads', registry)
    expect(action.intent).toBe('OPEN_FOLDER')
    expect(action.target).toBe('C:\\Users\\me\\Downloads')
  })

  it('resolves the default Documents folder', () => {
    const action = resolveCommand('Open Documents', registry)
    expect(action.intent).toBe('OPEN_FOLDER')
    expect(action.target).toBe('C:\\Users\\me\\Documents')
  })

  it('resolves the default Desktop folder', () => {
    const action = resolveCommand('Open Desktop', registry)
    expect(action.intent).toBe('OPEN_FOLDER')
    expect(action.target).toBe('C:\\Users\\me\\Desktop')
  })

  it('resolves a file by name', () => {
    const action = resolveCommand('Open Report', registry)
    expect(action.intent).toBe('OPEN_FILE')
    expect(action.target).toBe('C:\\Users\\me\\report.pdf')
  })

  it('returns a clarification with suggestions for an unknown app', () => {
    const action = resolveCommand('Open Studio', registry)
    expect(action.intent).toBe('CLARIFICATION')
    expect(action.suggestions?.length).toBeGreaterThan(0)
    expect(action.suggestions).toContain('Visual Studio Code')
  })

  it('returns a clarification for empty input', () => {
    const action = resolveCommand('   ', registry)
    expect(action.intent).toBe('CLARIFICATION')
  })

  it('never emits a raw shell intent for any input', () => {
    const nasty = ['Open ; rm -rf /', 'dir', 'calc.exe', 'Open $(whoami)', 'cmd /c pause']
    for (const input of nasty) {
      const action = resolveCommand(input, registry)
      expect(SAFE_INTENTS.has(action.intent)).toBe(true)
      expect(action.target).not.toMatch(/;/)
    }
  })
})
