// Platform-neutral application registry.
// Aggregates AppSource providers (e.g. WindowsAppSource) with user-defined entries.
// Minimal for Slice 1; the WindowsAppSource replacement slots in cleanly.

import type { AppSource, NovaConfig, RegistrySnapshot } from './types'

export interface RegistryOptions {
  sources: AppSource[]
  config: NovaConfig
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
    const apps = [...discovered.flat(), ...this.config.customApps]
    const snapshot: RegistrySnapshot = {
      apps,
      websites: this.config.websites,
      fileFolders: this.config.fileFolders,
    }
    this.cache = snapshot
    return snapshot
  }
}
