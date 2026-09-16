import { describe, expect, it } from 'vitest'
import { AppRegistry } from '../electron/core/app-registry'
import { defaultConfig } from '../electron/core/types'
import type { AppEntry, AppSource, NovaConfig } from '../electron/core/types'

function fakeApp(id: string, name: string): AppEntry {
  return { id, name, aliases: [name.toLowerCase()], path: `C:\\Apps\\${name}.exe` }
}

function makeSource(entries: AppEntry[]): AppSource & { calls: number } {
  let called = 0
  const source: AppSource & { calls: number } = {
    id: 'fake-source',
    discover: async () => {
      called += 1
      return entries
    },
    get calls() {
      return called
    },
  }
  return source
}

function makeConfig(overrides: Partial<NovaConfig> = {}): NovaConfig {
  return { ...defaultConfig(), ...overrides }
}

describe('AppRegistry', () => {
  it('merges discovered apps with custom apps', async () => {
    const source = makeSource([fakeApp('app-chrome', 'Chrome')])
    const registry = new AppRegistry({
      sources: [source],
      config: makeConfig({ customApps: [fakeApp('app-hello', 'Hello')] }),
    })
    const snapshot = await registry.snapshot()
    expect(snapshot.apps.map((a) => a.id)).toEqual(['app-chrome', 'app-hello'])
  })

  it('exposes websites and file/folder shortcuts from config', async () => {
    const config = makeConfig({
      websites: [{ id: 'web-youtube', name: 'YouTube', aliases: ['youtube'], url: 'https://youtube.com' }],
      fileFolders: [{ id: 'folder-downloads', name: 'Downloads', path: 'C:\\Downloads', kind: 'folder' }],
    })
    const registry = new AppRegistry({ sources: [], config })
    const snapshot = await registry.snapshot()
    expect(snapshot.websites).toHaveLength(1)
    expect(snapshot.fileFolders).toHaveLength(1)
  })

  it('caches the snapshot until invalidated', async () => {
    const source = makeSource([fakeApp('app-a', 'A')])
    const registry = new AppRegistry({ sources: [source], config: makeConfig() })
    const first = await registry.snapshot()
    const second = await registry.snapshot()
    expect(first).toBe(second)
    expect(source.calls).toBe(1)
  })

  it('setConfig invalidates the cache and applies live config updates', async () => {
    const config = makeConfig({ websites: [] })
    const registry = new AppRegistry({ sources: [], config })
    expect((await registry.snapshot()).websites).toHaveLength(0)

    const updated = makeConfig({
      websites: [{ id: 'web-github', name: 'GitHub', aliases: ['github'], url: 'https://github.com' }],
    })
    registry.setConfig(updated)
    expect((await registry.snapshot()).websites).toHaveLength(1)
  })

  it('invalidates and re-discovers on explicit invalidate()', async () => {
    const source = makeSource([fakeApp('app-a', 'A')])
    const registry = new AppRegistry({ sources: [source], config: makeConfig() })
    await registry.snapshot()
    registry.invalidate()
    const after = await registry.snapshot()
    expect(after).not.toBeUndefined()
    expect(source.calls).toBe(2)
  })
})
