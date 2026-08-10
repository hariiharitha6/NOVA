// Configurable global hotkey registration. Default: Control+Space.

import { globalShortcut } from 'electron'
import type { WindowManager } from './windows'

let currentAccelerator: string | null = null

/**
 * Register a global hotkey that toggles the command overlay.
 * Unregisters any previously registered NOVA hotkey first.
 */
export function registerHotkey(accelerator: string, manager: WindowManager): boolean {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch {
      // ignore
    }
    currentAccelerator = null
  }
  const ok = globalShortcut.register(accelerator, () => manager.toggleOverlay())
  if (ok) currentAccelerator = accelerator
  return ok
}

export function unregisterHotkey(): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch {
      // ignore
    }
    currentAccelerator = null
  }
}
