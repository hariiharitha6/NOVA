// Platform-neutral application registry.
// Aggregates AppSource providers (e.g. WindowsAppSource) with user-defined entries.
// Minimal for Slice 1; the WindowsAppSource replacement slots in cleanly.

import type { AppEntry, AppSource, NovaConfig, RegistrySnapshot } from './types'

export interface RegistryOptions {
  sources: AppSource[]
  config: NovaConfig
}

/**
 * Legitimate product aliases for well-known applications.
 * These are standard names that make sense for both typed and voice input.
 * Applied automatically when building the registry snapshot.
 */
const WELL_KNOWN_ALIASES: Record<string, string[]> = {
  'Visual Studio Code': ['vs code', 'vscode'],
  'File Explorer': ['explorer', 'windows explorer'],
  'Google Chrome': ['chrome'],
  'Mozilla Firefox': ['firefox'],
  'Microsoft Edge': ['edge'],
  'Notepad': ['notepad', 'notepad++'],
  'Microsoft Word': ['word', 'ms word'],
  'Microsoft Excel': ['excel', 'ms excel'],
  'Microsoft PowerPoint': ['powerpoint', 'ms powerpoint'],
  'Windows Terminal': ['terminal', 'wt', 'cmd'],
  'Calculator': ['calc', 'calculator'],
  'Paint': ['paint', 'mspaint'],
  'Snipping Tool': ['snip', 'snipping'],
}

function mergeAliases(app: AppEntry): AppEntry {
  const extra = WELL_KNOWN_ALIASES[app.name]
  if (!extra) return app
  const existing = new Set(app.aliases.map((a) => a.toLowerCase()))
  const merged = [...app.aliases]
  for (const alias of extra) {
    if (!existing.has(alias.toLowerCase())) {
      merged.push(alias)
    }
  }
  return { ...app, aliases: merged }
}

export class AppRegistry {
  private readonly sources: AppSource[]
  private config: NovaConfig
  private cache: RegistrySnapshot | null = null

  constructor(options: RegistryOptions) {
    this.sources = options.sources
    this.config = options.config
  }

  setConfig(config: NovaConfig): void {
    this.config = config
    this.invalidate()
  }

  invalidate(): void {
    this.cache = null
  }

  async snapshot(): Promise<RegistrySnapshot> {
    if (this.cache) return this.cache

    const discovered = await Promise.all(
      this.sources.map((source) => source.discover()),
    )
    const apps = [...discovered.flat(), ...this.config.customApps].map(mergeAliases)
    const snapshot: RegistrySnapshot = {
      apps,
      websites: this.config.websites,
      fileFolders: this.config.fileFolders,
    }
    this.cache = snapshot
    return snapshot
  }
}
