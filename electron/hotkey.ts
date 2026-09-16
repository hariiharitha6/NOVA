// Global hotkey registration. The overlay hotkey (default Control+Space) and
// the PTT hotkey (default Control+Shift+Space) are fully independent; each has
// its own current registration and unregistering one never touches the other.

import { globalShortcut } from 'electron'
import type { WindowManager } from './windows'

let currentAccelerator: string | null = null

/**
 * Register a global hotkey that toggles the command overlay.
 * Unregisters any previously registered NOVA overlay hotkey first.
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

let pttAccelerator: string | null = null
let escapeRegistered = false

/** Register the push-to-talk toggle hotkey. Independent of the overlay hotkey. */
export function registerPttHotkey(accelerator: string, onToggle: () => void): boolean {
  unregisterPttHotkey()
  const ok = globalShortcut.register(accelerator, onToggle)
  if (ok) pttAccelerator = accelerator
  return ok
}

export function unregisterPttHotkey(): void {
  if (pttAccelerator) {
    try {
      globalShortcut.unregister(pttAccelerator)
    } catch {
      // ignore
    }
    pttAccelerator = null
  }
}

/**
 * Best-effort global Escape capture used ONLY while a listening session is
 * active. Returns false when the OS refuses (some environments block single
 * keys); PTT toggle and timeouts still recover the session.
 */
export function registerEscapeCancel(onEscape: () => void): boolean {
  if (escapeRegistered) return true
  const ok = globalShortcut.register('Escape', onEscape)
  escapeRegistered = ok
  return ok
}

export function unregisterEscapeCancel(): void {
  if (escapeRegistered) {
    try {
      globalShortcut.unregister('Escape')
    } catch {
      // ignore
    }
    escapeRegistered = false
  }
}

export function unregisterAllHotkeys(): void {
  unregisterHotkey()
  unregisterPttHotkey()
  unregisterEscapeCancel()
}
