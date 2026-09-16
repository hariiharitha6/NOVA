// Windows adapter for seeding default folder shortcuts.
// Resolves Downloads/Documents/Desktop through Electron's OS-aware path APIs.

import { app } from 'electron'
import type { ConfigStore } from '../core/types'
import {
  defaultFileFolderEntries,
  needsDefaultShortcutSeeding,
} from '../core/default-shortcuts'

function resolveKnownPath(name: 'downloads' | 'documents' | 'desktop'): string | null {
  try {
    const value = app.getPath(name)
    return value ? value : null
  } catch {
    // Path kind unavailable on this platform/config. Skip it.
    return null
  }
}

/**
 * Seed the default Windows folder shortcuts once. Idempotent: guarded by the
 * defaultsSeeded flag, so user-removed defaults are never re-added.
 */
export function seedDefaultFileFolders(configStore: ConfigStore): void {
  const config = configStore.get()
  if (!needsDefaultShortcutSeeding(config)) return

  const defaults = defaultFileFolderEntries({
    downloads: resolveKnownPath('downloads'),
    documents: resolveKnownPath('documents'),
    desktop: resolveKnownPath('desktop'),
  })

  configStore.update({
    fileFolders: [...config.fileFolders, ...defaults],
    defaultsSeeded: true,
  })
}
