// Pure helpers for capturing a global hotkey in the Settings panel.

export interface KeyState {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  key: string
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

const BLOCKED_KEYS = new Set([
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'PrintScreen', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'NumLock',
  'Tab',
])

const KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
}

/**
 * Why a key combination cannot be used as a hotkey, or null when it is valid.
 */
export function blockedAcceleratorReason(s: KeyState): string | null {
  if (MODIFIER_KEYS.has(s.key)) return 'Press a regular key with a modifier.'
  if (BLOCKED_KEYS.has(s.key)) return 'That key cannot be used as a hotkey.'
  if (!s.ctrlKey && !s.altKey && !s.metaKey) return 'Hold Ctrl, Alt, or Win with a key.'
  return null
}

/**
 * Build an Electron accelerator from a keydown state, or null when the
 * combination is invalid (no modifier, or only modifier keys pressed).
 */
export function acceleratorFromKeys(s: KeyState): string | null {
  if (blockedAcceleratorReason(s) !== null) return null
  const parts: string[] = []
  if (s.ctrlKey) parts.push('Control')
  if (s.altKey) parts.push('Alt')
  if (s.shiftKey) parts.push('Shift')
  if (s.metaKey) parts.push('Super')
  const key = KEY_MAP[s.key] ?? s.key.toUpperCase()
  if (!key || key.length > 16) return null
  parts.push(key)
  return parts.join('+')
}

export function formatAccelerator(accelerator: string): string {
  return accelerator.split('+').join(' + ')
}
