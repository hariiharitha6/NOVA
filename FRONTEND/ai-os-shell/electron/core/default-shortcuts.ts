// Platform-neutral default folder shortcut definitions.
// Paths are injected by the platform adapter (electron/platform/windows-shortcuts.ts)
// so this module never hardcodes user paths and stays unit-testable without Electron.

import type { FileFolderEntry, NovaConfig } from './types'

export interface ResolvedDefaultPaths {
  downloads: string | null
  documents: string | null
  desktop: string | null
}

/**
 * Build the default folder shortcut entries from resolved OS paths.
 * Missing/empty paths are skipped so we never seed a broken shortcut.
 */
export function defaultFileFolderEntries(paths: ResolvedDefaultPaths): FileFolderEntry[] {
  const entries: FileFolderEntry[] = []
  if (paths.downloads) {
    entries.push({
      id: 'folder-downloads',
      name: 'Downloads',
      path: paths.downloads,
      kind: 'folder',
    })
  }
  if (paths.documents) {
    entries.push({
      id: 'folder-documents',
      name: 'Documents',
      path: paths.documents,
      kind: 'folder',
    })
  }
  if (paths.desktop) {
    entries.push({
      id: 'folder-desktop',
      name: 'Desktop',
      path: paths.desktop,
      kind: 'folder',
    })
  }
  return entries
}

/**
 * Whether the default shortcuts still need to be seeded.
 * Seeds exactly once per config; a true flag means seeding already happened.
 */
export function needsDefaultShortcutSeeding(config: NovaConfig): boolean {
  return config.defaultsSeeded !== true
}
