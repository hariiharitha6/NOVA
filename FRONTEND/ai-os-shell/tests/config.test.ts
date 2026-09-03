import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createConfigStore, sanitizeConfigPatch } from '../electron/core/config'
import { defaultConfig } from '../electron/core/types'
import { DEFAULT_HOTKEY, DEFAULT_PTT_HOTKEY } from '../electron/core/shortcut-policy'
import { migrateShortcutDefaults, decideShortcutChange } from '../electron/core/shortcut-policy'

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), 'nova-config-'))
  const file = join(dir, 'config.json')
  const store = createConfigStore(file)
  return { store, file, dir }
}

describe('createConfigStore', () => {
  it('returns defaults when no file exists', () => {
    const { store } = makeStore()
    expect(store.get()).toEqual(defaultConfig())
  })

  it('defaults hotkey to Control+J', () => {
    const { store } = makeStore()
    expect(store.get().hotkey).toBe('Control+J')
  })

  it('defaults the voice PTT hotkey to Control+Shift+J', () => {
    const { store } = makeStore()
    expect(store.get().pttHotkey).toBe('Control+Shift+J')
  })

  it('defaults shortcutsMigratedV2 to false', () => {
    const { store } = makeStore()
    expect(store.get().shortcutsMigratedV2).toBe(false)
  })

  it('persists updates and reloads them from disk', () => {
    const { store, file, dir } = makeStore()
    store.update({ alwaysOnTop: false })
    const fromDisk = JSON.parse(readFileSync(file, 'utf-8'))
    expect(fromDisk.alwaysOnTop).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('merges partial updates without losing other keys', () => {
    const { store } = makeStore()
    const next = store.update({ startup: true })
    expect(next.startup).toBe(true)
    expect(next.hotkey).toBe('Control+J')
  })

  it('records recents, dedupes, and caps at 10', () => {
    const { store } = makeStore()
    for (let i = 0; i < 12; i++) {
      store.recordRecent({ id: `app-${i}`, label: `App ${i}` })
    }
    store.recordRecent({ id: 'app-5', label: 'App 5' })
    const recents = store.get().recents
    expect(recents).toHaveLength(10)
    expect(recents[0].id).toBe('app-5')
    expect(new Set(recents.map((r) => r.id)).size).toBe(10)
  })

  it('recovers when the config file is corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-config-'))
    const file = join(dir, 'config.json')
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(file, '{not valid json', 'utf-8')
    const store = createConfigStore(file)
    expect(store.get()).toEqual(defaultConfig())
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists favorites and reloads them from disk', () => {
    const { store, file, dir } = makeStore()
    store.update({ favorites: ['app-chrome', 'app-vscode'] })
    const again = createConfigStore(file)
    expect(again.get().favorites).toEqual(['app-chrome', 'app-vscode'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists custom apps, websites and file/folder shortcuts', () => {
    const { store, dir } = makeStore()
    store.update({
      customApps: [
        { id: 'app-hello', name: 'Hello App', aliases: ['hello'], path: 'C:\\hello.exe' },
      ],
      websites: [
        { id: 'web-example', name: 'Example', aliases: ['example'], url: 'https://example.com' },
      ],
      fileFolders: [
        { id: 'folder-tmp', name: 'Temp', path: 'C:\\Temp', kind: 'folder' },
        { id: 'file-note', name: 'Notes', path: 'C:\\notes.txt', kind: 'file' },
      ],
    })
    const fromDisk = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf-8'))
    expect(fromDisk.customApps).toHaveLength(1)
    expect(fromDisk.websites).toHaveLength(1)
    expect(fromDisk.fileFolders).toHaveLength(2)
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists an empty array to remove items', () => {
    const { store, file } = makeStore()
    store.update({ favorites: ['app-chrome'] })
    store.update({ favorites: [] })
    const fromDisk = JSON.parse(readFileSync(file, 'utf-8'))
    expect(fromDisk.favorites).toEqual([])
  })

  it('migrates a pre-v1 config and backfills new fields from defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-config-'))
    const file = join(dir, 'config.json')
    writeFileSync(file, JSON.stringify({ version: 0, hotkey: 'Alt+D' }), 'utf-8')
    const store = createConfigStore(file)
    const config = store.get()
    expect(config.version).toBe(1)
    expect(config.hotkey).toBe('Alt+D')
    expect(config.favorites).toEqual([])
    expect(config.websites.length).toBeGreaterThan(0)
    expect(config.startup).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('drops unknown keys and wrong-typed values from a config patch', () => {
    const patch = sanitizeConfigPatch({
      hotkey: 42,
      alwaysOnTop: 'yes',
      exec: 'calc.exe',
      position: { displayId: '0', x: 10, y: 20 },
    })
    expect(patch.hotkey).toBeUndefined()
    expect(patch.alwaysOnTop).toBeUndefined()
    expect((patch as Record<string, unknown>)['exec']).toBeUndefined()
    expect(patch.position).toBeUndefined()
  })

  it('filters malformed favorites, custom apps, websites and shortcuts', () => {
    const patch = sanitizeConfigPatch({
      favorites: ['ok', 3, null],
      customApps: [
        { id: 'a', name: 'A', aliases: ['a'], path: 'C:\\a.exe' },
        { id: 'bad' },
        'nope',
      ],
      websites: [
        { id: 'w', name: 'W', aliases: ['w'], url: 'https://w.io' },
        { id: 'bad2', name: 'X', url: 7 },
      ],
      fileFolders: [
        { id: 'f', name: 'F', path: 'C:\\F', kind: 'file' },
        { id: 'f2', name: 'F2', path: 'C:\\F2', kind: 'link' },
      ],
    })
    expect(patch.favorites).toEqual(['ok'])
    expect(patch.customApps).toHaveLength(1)
    expect(patch.websites).toHaveLength(1)
    expect(patch.fileFolders).toHaveLength(1)
  })

  it('accepts a well-formed position patch', () => {
    const patch = sanitizeConfigPatch({ position: { displayId: 1, x: 120, y: 340 } })
    expect(patch.position).toEqual({ displayId: 1, x: 120, y: 340 })
  })

  it('persists the hotkey across reloads', () => {
    const { store, file, dir } = makeStore()
    store.update({ hotkey: 'Alt+D' })
    const fromDisk = JSON.parse(readFileSync(file, 'utf-8'))
    expect(fromDisk.hotkey).toBe('Alt+D')
    const again = createConfigStore(file)
    expect(again.get().hotkey).toBe('Alt+D')
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists the startup flag across reloads', () => {
    const { store, file, dir } = makeStore()
    store.update({ startup: true })
    const fromDisk = JSON.parse(readFileSync(file, 'utf-8'))
    expect(fromDisk.startup).toBe(true)
    const again = createConfigStore(file)
    expect(again.get().startup).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('accepts and persists the defaultsSeeded flag', () => {
    const { store, file, dir } = makeStore()
    store.update({ defaultsSeeded: true })
    const fromDisk = JSON.parse(readFileSync(file, 'utf-8'))
    expect(fromDisk.defaultsSeeded).toBe(true)
    const again = createConfigStore(file)
    expect(again.get().defaultsSeeded).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('drops a malformed defaultsSeeded patch', () => {
    const patch = sanitizeConfigPatch({ defaultsSeeded: 'yes' })
    expect(patch.defaultsSeeded).toBeUndefined()
    const ok = sanitizeConfigPatch({ defaultsSeeded: false })
    expect(ok.defaultsSeeded).toBe(false)
  })

  it('defaults defaultsSeeded to false (pre-seed migration)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-config-'))
    const file = join(dir, 'config.json')
    writeFileSync(file, JSON.stringify({ version: 1, fileFolders: [] }), 'utf-8')
    const store = createConfigStore(file)
    expect(store.get().defaultsSeeded).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('seeded file folders are persisted as part of fileFolders', () => {
    const { store, dir } = makeStore()
    store.update({
      fileFolders: [
        { id: 'folder-downloads', name: 'Downloads', path: 'C:\\Downloads', kind: 'folder' },
      ],
      defaultsSeeded: true,
    })
    const fromDisk = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf-8'))
    expect(fromDisk.fileFolders).toHaveLength(1)
    expect(fromDisk.defaultsSeeded).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('defaultConfig returns a complete NovaConfig with all v0.2 fields', () => {
    const cfg = defaultConfig()
    expect(cfg.hotkey).toBe(DEFAULT_HOTKEY)
    expect(cfg.pttHotkey).toBe(DEFAULT_PTT_HOTKEY)
    expect(cfg.voiceEnabled).toBe(false)
    expect(cfg.speechLanguage).toBe('en-US')
    expect(cfg.shortcutsMigratedV2).toBe(false)
    expect(cfg.version).toBe(1)
    expect(cfg.defaultsSeeded).toBe(false)
  })
})

describe('shortcut migration (Slice 3A)', () => {
  it('migrates legacy Control+Space defaults to Control+J', () => {
    const patch = migrateShortcutDefaults({ version: 1, hotkey: 'Control+Space', pttHotkey: 'Control+Shift+Space' })
    expect(patch.hotkey).toBe('Control+J')
    expect(patch.pttHotkey).toBe('Control+Shift+J')
    expect(patch.shortcutsMigratedV2).toBe(true)
  })

  it('does not overwrite custom shortcuts during migration', () => {
    const patch = migrateShortcutDefaults({ version: 1, hotkey: 'Alt+D', pttHotkey: 'Control+Shift+Space' })
    expect(patch.hotkey).toBeUndefined()
    expect(patch.pttHotkey).toBe('Control+Shift+J')
    expect(patch.shortcutsMigratedV2).toBe(true)
  })

  it('does not migrate when already migrated (idempotent)', () => {
    const patch = migrateShortcutDefaults({ version: 1, hotkey: 'Control+Space', pttHotkey: 'Control+Shift+Space', shortcutsMigratedV2: true })
    expect(patch).toEqual({})
  })

  it('returns a flag-only patch when nothing needs migrating but not yet migrated', () => {
    const patch = migrateShortcutDefaults({ version: 1, hotkey: 'Control+J', pttHotkey: 'Control+Shift+J' })
    expect(patch.hotkey).toBeUndefined()
    expect(patch.pttHotkey).toBeUndefined()
    expect(patch.shortcutsMigratedV2).toBe(true)
  })
})

describe('shortcut conflict protection (Slice 3A)', () => {
  it('rejects a NOVA hotkey that collides with the PTT hotkey', () => {
    const decision = decideShortcutChange('Control+Shift+J', 'Control+J', 'Control+Shift+J', () => true)
    expect(decision.accepted).toBe(false)
    expect(decision.effective).toBe('Control+J')
    expect(decision.reason).toBeTruthy()
  })

  it('rejects a PTT hotkey that collides with the NOVA hotkey', () => {
    const decision = decideShortcutChange('Control+J', 'Control+Shift+J', 'Control+J', () => true)
    expect(decision.accepted).toBe(false)
    expect(decision.effective).toBe('Control+Shift+J')
  })

  it('accepts a valid, free shortcut', () => {
    const decision = decideShortcutChange('Alt+Z', 'Control+J', 'Control+Shift+J', () => true)
    expect(decision.accepted).toBe(true)
    expect(decision.effective).toBe('Alt+Z')
  })

  it('accepts a change equal to the current shortcut (no-op)', () => {
    const decision = decideShortcutChange('Control+J', 'Control+J', 'Control+Shift+J', () => false)
    expect(decision.accepted).toBe(true)
    expect(decision.effective).toBe('Control+J')
  })

  it('rejects a shortcut when the OS refuses registration', () => {
    const decision = decideShortcutChange('Alt+Z', 'Control+J', 'Control+Shift+J', () => false)
    expect(decision.accepted).toBe(false)
    expect(decision.effective).toBe('Control+J')
  })
})
