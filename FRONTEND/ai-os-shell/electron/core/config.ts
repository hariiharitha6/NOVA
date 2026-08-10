// Platform-neutral configuration store. No Electron imports allowed here.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultConfig, type ConfigStore, type NovaConfig, type RecentItem } from './types'

const CONFIG_VERSION = 1

function deepMerge(base: NovaConfig, patch: Partial<NovaConfig>): NovaConfig {
  return { ...base, ...patch }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whitelist-and-validate an arbitrary IPC payload into a safe config patch.
 * Unknown keys and wrong-typed values are dropped.
 */
export function sanitizeConfigPatch(patch: Record<string, unknown>): Partial<NovaConfig> {
  const out: Partial<NovaConfig> = {}
  if (typeof patch['hotkey'] === 'string' && patch['hotkey'].length <= 50) {
    out.hotkey = patch['hotkey']
  }
  if (typeof patch['alwaysOnTop'] === 'boolean') {
    out.alwaysOnTop = patch['alwaysOnTop']
  }
  if (Array.isArray(patch['favorites'])) {
    out.favorites = patch['favorites'].filter((v): v is string => typeof v === 'string')
  }
  if (Array.isArray(patch['recents'])) {
    out.recents = patch['recents'].filter(
      (v): v is NovaConfig['recents'][number] =>
        isRecord(v) && typeof v['id'] === 'string' && typeof v['label'] === 'string',
    )
  }
  if (Array.isArray(patch['customApps'])) {
    out.customApps = patch['customApps'].filter(
      (v): v is NovaConfig['customApps'][number] =>
        isRecord(v) &&
        typeof v['id'] === 'string' &&
        typeof v['name'] === 'string' &&
        typeof v['path'] === 'string' &&
        Array.isArray(v['aliases']) &&
        v['aliases'].every((a) => typeof a === 'string'),
    )
  }
  if (Array.isArray(patch['websites'])) {
    out.websites = patch['websites'].filter(
      (v): v is NovaConfig['websites'][number] =>
        isRecord(v) &&
        typeof v['id'] === 'string' &&
        typeof v['name'] === 'string' &&
        typeof v['url'] === 'string' &&
        Array.isArray(v['aliases']) &&
        v['aliases'].every((a) => typeof a === 'string'),
    )
  }
  if (Array.isArray(patch['fileFolders'])) {
    out.fileFolders = patch['fileFolders'].filter(
      (v): v is NovaConfig['fileFolders'][number] =>
        isRecord(v) &&
        typeof v['id'] === 'string' &&
        typeof v['name'] === 'string' &&
        typeof v['path'] === 'string' &&
        (v['kind'] === 'file' || v['kind'] === 'folder'),
    )
  }
  if (isRecord(patch['position'])) {
    const pos = patch['position']
    if (
      typeof pos['displayId'] === 'number' &&
      typeof pos['x'] === 'number' &&
      typeof pos['y'] === 'number'
    ) {
      out.position = { displayId: pos['displayId'], x: pos['x'], y: pos['y'] }
    }
  }
  return out
}

export function createConfigStore(filePath: string): ConfigStore {
  let cached: NovaConfig | null = null

  function load(): NovaConfig {
    if (cached) return cached
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<NovaConfig>
      const base = defaultConfig()
      const merged = deepMerge(base, parsed)
      if (merged.version !== CONFIG_VERSION) {
        merged.version = CONFIG_VERSION
      }
      cached = merged
    } catch {
      cached = defaultConfig()
    }
    return cached
  }

  function save(next: NovaConfig): void {
    cached = next
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8')
    } catch {
      // Non-fatal: config persistence failure should not crash NOVA.
    }
  }

  return {
    get: load,
    update(patch: Partial<NovaConfig>): NovaConfig {
      const next = deepMerge(load(), patch)
      save(next)
      return next
    },
    recordRecent(item: RecentItem): NovaConfig {
      const next = load()
      const recents = next.recents.filter((r) => r.id !== item.id)
      recents.unshift(item)
      next.recents = recents.slice(0, 10)
      save(next)
      return next
    },
  }
}
