// Platform-neutral shortcut policy. No Electron imports allowed here.
//
// Owns the v0.2 Slice 3A default shortcuts and the safety rules applied when
// the user (or a migration) changes one:
//   • Control+J        → toggle the NOVA overlay
//   • Control+Shift+J  → start/stop voice PTT
//   • Escape           → cancel voice / close overlay (handled at runtime)
//   • The two NOVA shortcuts must never overlap each other.
//   • A shortcut that fails to register must never leave NOVA without a
//     working binding: the previous valid shortcut is retained.
//
// Defaults changed in v0.2 Slice 3A from the v0.1 defaults
// (Control+Space / Control+Shift+Space) because Ctrl+Space collides with input
// method editors on many layouts, and to free Space-based chords entirely.

export const DEFAULT_HOTKEY = 'Control+J'
export const DEFAULT_PTT_HOTKEY = 'Control+Shift+J'

/** v0.1 defaults that are auto-migrated to the v0.2 defaults on load. */
export const LEGACY_DEFAULT_HOTKEY = 'Control+Space'
export const LEGACY_DEFAULT_PTT_HOTKEY = 'Control+Shift+Space'

export type ShortcutSlot = 'hotkey' | 'pttHotkey'

export interface ShortcutChange {
  /** The accelerator requested by the caller. */
  requested: string
  /** The slot being changed ('hotkey' or 'pttHotkey'). */
  slot: ShortcutSlot
}

export interface ShortcutDecision {
  /** Whether `requested` was accepted and persisted. */
  accepted: boolean
  /** The accelerator now in force for the slot after the decision. */
  effective: string
  /** Human-readable explanation when rejected (already shown in the UI). */
  reason?: string
}

/**
 * Decide a shortcut change.
 *
 * @param current   accelerator currently active for the slot
 * @param otherSlot accelerator currently active for the sibling slot
 * @param isFree    returns true when the OS accepted registering the accelerator
 */
export function decideShortcutChange(
  requested: string,
  current: string,
  otherSlot: string,
  isFree: (accelerator: string) => boolean,
): ShortcutDecision {
  if (requested === otherSlot) {
    return {
      accepted: false,
      effective: current,
      reason: 'That shortcut is already used by NOVA for the other action.',
    }
  }
  if (requested === current) return { accepted: true, effective: current }
  if (!isFree(requested)) {
    return {
      accepted: false,
      effective: current,
      reason: `"${requested}" is unavailable — it may be in use by another app. Keep "${current}" or pick another.`,
    }
  }
  return { accepted: true, effective: requested }
}

/**
 * Migrate persisted config values across versions (runs at most once, guarded
 * by the `shortcutsMigratedV2` flag). Only exact legacy defaults move to the
 * new defaults; any user-customised shortcut is preserved untouched.
 *
 * @returns patch to apply, empty when nothing needs migrating
 */
export function migrateShortcutDefaults(config: {
  version: number
  hotkey: string
  pttHotkey: string
  shortcutsMigratedV2?: boolean
}): Partial<{ version: number; hotkey: string; pttHotkey: string; shortcutsMigratedV2: boolean }> {
  const patch: Partial<{ version: number; hotkey: string; pttHotkey: string; shortcutsMigratedV2: boolean }> = {}
  if (config.shortcutsMigratedV2) return patch
  patch.shortcutsMigratedV2 = true
  if (config.hotkey === LEGACY_DEFAULT_HOTKEY) patch.hotkey = DEFAULT_HOTKEY
  if (config.pttHotkey === LEGACY_DEFAULT_PTT_HOTKEY) patch.pttHotkey = DEFAULT_PTT_HOTKEY
  return patch
}
