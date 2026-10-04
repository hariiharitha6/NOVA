// Platform-neutral execution for the "show"-style intents (V03-S3):
// SHOW_FAVORITES, SHOW_RECENTS and OPEN_SETTINGS.
//
// These intents are pure reads of the EXISTING configuration store (or a
// main-process side effect). NOVA deliberately does not introduce a second
// favorites or recents database here — `NovaConfig.favorites` and
// `NovaConfig.recents` remain the single source of truth, the same ones the
// overlay and Settings already read and write.

import type {
  CommandResult,
  Intent,
  RecentItem,
  RegistrySnapshot,
  StructuredAction,
} from './types'

/** Intents executed here instead of by the platform Launcher. */
const LOCAL_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  'SHOW_FAVORITES',
  'SHOW_RECENTS',
  'OPEN_SETTINGS',
])

export function isLocalAction(intent: Intent): boolean {
  return LOCAL_INTENTS.has(intent)
}

function labelForId(snapshot: RegistrySnapshot | undefined, id: string): string {
  if (snapshot) {
    const app = snapshot.apps.find((entry) => entry.id === id)
    if (app) return app.name
    const website = snapshot.websites.find((entry) => entry.id === id)
    if (website) return website.name
    const folder = snapshot.fileFolders.find((entry) => entry.id === id)
    if (folder) return folder.name
  }
  // Never fabricate a label: fall back to the stored id itself.
  return id
}

/**
 * Real favorites from config, resolved to display labels.
 * Empty favorites produce a clean, non-fabricated empty result.
 */
export function executeShowFavorites(
  action: StructuredAction,
  favorites: string[],
  snapshot?: RegistrySnapshot,
): CommandResult {
  const items: RecentItem[] = favorites.map((id) => ({ id, label: labelForId(snapshot, id) }))
  if (items.length === 0) {
    return {
      success: true,
      intent: 'SHOW_FAVORITES',
      message: 'No favorites are configured yet.',
      action,
      data: { kind: 'favorites', items: [], total: 0 },
    }
  }
  const noun = items.length === 1 ? 'favorite' : 'favorites'
  return {
    success: true,
    intent: 'SHOW_FAVORITES',
    message: `Here are your ${noun}.`,
    action,
    data: { kind: 'favorites', items, total: items.length },
  }
}

/** Real recents from config. Empty recents produce a clean empty result. */
export function executeShowRecents(
  action: StructuredAction,
  recents: RecentItem[],
): CommandResult {
  if (recents.length === 0) {
    return {
      success: true,
      intent: 'SHOW_RECENTS',
      message: 'No recent apps yet.',
      action,
      data: { kind: 'recents', items: [], total: 0 },
    }
  }
  const noun = recents.length === 1 ? 'recent app' : 'recent apps'
  return {
    success: true,
    intent: 'SHOW_RECENTS',
    message: `Here are your ${noun}.`,
    action,
    data: { kind: 'recents', items: [...recents], total: recents.length },
  }
}

/**
 * Settings navigation. The main process owns the settings window, so the
 * pipeline invokes the existing `showSettings()` mechanism and reports a
 * structured, renderer-observable action. No duplicate settings window is ever
 * created here.
 */
export function executeOpenSettings(action: StructuredAction): CommandResult {
  return {
    success: true,
    intent: 'OPEN_SETTINGS',
    message: 'Opening NOVA settings.',
    action,
    data: { kind: 'settings', action: 'open-settings' },
  }
}