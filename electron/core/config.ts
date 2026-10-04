// Platform-neutral configuration store. No Electron imports allowed here.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultConfig, type ConfigStore, type NovaConfig, type RecentItem } from './types'
import { normalizeWakePhrase } from './speech/wake-phrase'
import { DEFAULT_WAKE_PHRASE } from './speech/constants'
import { assertLoopbackUrl, assertModelName } from './ai/ollama-client'
import { AI_MAX_TIMEOUT_MS, AI_MIN_TIMEOUT_MS } from './ai/constants'

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
  if (typeof patch['defaultsSeeded'] === 'boolean') {
    out.defaultsSeeded = patch['defaultsSeeded']
  }
  if (typeof patch['voiceEnabled'] === 'boolean') {
    out.voiceEnabled = patch['voiceEnabled']
  }
  if (typeof patch['pttHotkey'] === 'string' && patch['pttHotkey'].length <= 50) {
    out.pttHotkey = patch['pttHotkey']
  }
  if (typeof patch['speechLanguage'] === 'string' && patch['speechLanguage'].length <= 20) {
    out.speechLanguage = patch['speechLanguage']
  }
  if (typeof patch['wakeWordEnabled'] === 'boolean') {
    out.wakeWordEnabled = patch['wakeWordEnabled']
  }
  // Custom wake phrase: only accept a value that normalizes to a non-empty,
  // valid phrase. Empty/invalid phrases are rejected (dropped from the patch),
  // never persisted, and never silently replaced with an arbitrary default.
  if (typeof patch['wakeWord'] === 'string') {
    const normalized = normalizeWakePhrase(patch['wakeWord'])
    if (normalized !== null) {
      out.wakeWord = normalized
    }
  }
  // The default phrase must never be persisted as an empty string even if a
  // future config file stores an invalid value; the config loader backfills
  // missing fields from defaults and empty values are rejected above.
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
  // ─── v0.3 Slice 5 — optional local AI interpretation ────────────────────────
  // Conservative by construction: the flag defaults to false, and the base URL is
  // accepted ONLY if it is a loopback address. A renderer (or anything else) that
  // tries to point NOVA at a remote host has its patch silently reduced to
  // "flag off", so no command text can ever leave the machine.
  if (typeof patch['aiInterpretationEnabled'] === 'boolean') {
    out.aiInterpretationEnabled = patch['aiInterpretationEnabled']
  }
  if (typeof patch['aiBaseUrl'] === 'string' && patch['aiBaseUrl'].length <= 200) {
    try {
      out.aiBaseUrl = assertLoopbackUrl(patch['aiBaseUrl']).origin
    } catch {
      // Not a loopback URL: dropped from the patch, leaving the default.
    }
  }
  if (typeof patch['aiModel'] === 'string' && patch['aiModel'].length <= 64) {
    try {
      out.aiModel = assertModelName(patch['aiModel'])
    } catch {
      // Invalid model name: dropped from the patch, leaving the default.
    }
  }
  if (
    typeof patch['aiTimeoutMs'] === 'number' &&
    Number.isFinite(patch['aiTimeoutMs']) &&
    patch['aiTimeoutMs'] >= AI_MIN_TIMEOUT_MS &&
    patch['aiTimeoutMs'] <= AI_MAX_TIMEOUT_MS
  ) {
    out.aiTimeoutMs = Math.round(patch['aiTimeoutMs'])
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
      if (typeof merged.wakeWord === 'string') {
        const normalized = normalizeWakePhrase(merged.wakeWord)
        merged.wakeWord = normalized ?? DEFAULT_WAKE_PHRASE
      } else {
        merged.wakeWord = DEFAULT_WAKE_PHRASE
      }
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
