import { describe, expect, it } from 'vitest'
import {
  acceleratorFromKeys,
  blockedAcceleratorReason,
  formatAccelerator,
  type KeyState,
} from '../src/lib/accelerator'

function keyState(partial: Partial<KeyState>): KeyState {
  return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, key: '', ...partial }
}

describe('acceleratorFromKeys', () => {
  it('builds Control+Space from ctrl + space', () => {
    expect(acceleratorFromKeys(keyState({ ctrlKey: true, key: ' ' }))).toBe('Control+Space')
  })

  it('builds a modifier + letter combination', () => {
    expect(acceleratorFromKeys(keyState({ ctrlKey: true, altKey: true, key: 'd' }))).toBe('Control+Alt+D')
  })

  it('maps special keys to accelerator names', () => {
    expect(acceleratorFromKeys(keyState({ ctrlKey: true, key: 'Enter' }))).toBe('Control+Return')
    expect(acceleratorFromKeys(keyState({ altKey: true, key: 'ArrowUp' }))).toBe('Alt+Up')
  })

  it('rejects a bare key with no modifier', () => {
    expect(acceleratorFromKeys(keyState({ key: 'a' }))).toBeNull()
  })

  it('rejects pressing only a modifier key', () => {
    expect(acceleratorFromKeys(keyState({ ctrlKey: true, key: 'Control' }))).toBeNull()
  })

  it('rejects blocked keys like F-keys and Tab', () => {
    expect(acceleratorFromKeys(keyState({ ctrlKey: true, key: 'F5' }))).toBeNull()
    expect(acceleratorFromKeys(keyState({ ctrlKey: true, key: 'Tab' }))).toBeNull()
  })

  it('explains why a combination is blocked', () => {
    expect(blockedAcceleratorReason(keyState({ key: 'x' }))).toMatch(/Hold Ctrl/)
    expect(blockedAcceleratorReason(keyState({ ctrlKey: true, key: 'Control' }))).toMatch(/regular key/)
    expect(blockedAcceleratorReason(keyState({ ctrlKey: true, key: 'F12' }))).toMatch(/cannot/)
  })
})

describe('formatAccelerator', () => {
  it('formats with spaces', () => {
    expect(formatAccelerator('Control+Alt+D')).toBe('Control + Alt + D')
  })
})
