/**
 * Acceptance Bug 5 — the Windows Settings app is opened through its fixed URI
 * scheme, never through a shell, a command string, or user text.
 *
 * `electron` is mocked so the assertion is on exactly what NOVA hands to
 * `shell.openExternal`.
 */

import { describe, expect, it, vi } from 'vitest'
import { shell } from 'electron'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(async () => {}),
  },
}))

import { createWindowsLauncher } from '../electron/platform/windows-launcher'

const openExternal = shell.openExternal as unknown as ReturnType<typeof vi.fn>

describe('acceptance Bug 5: opening Windows Settings', () => {
  it('opens the fixed ms-settings: URI through shell.openExternal', async () => {
    openExternal.mockClear()
    const launcher = createWindowsLauncher()

    const result = await launcher.launch({
      intent: 'OPEN_SYSTEM_SETTINGS',
      target: '',
      label: 'Open Windows Settings',
    })

    expect(result.ok).toBe(true)
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('ms-settings:')
  })

  it('never builds the URI from the action target or label', async () => {
    openExternal.mockClear()
    const launcher = createWindowsLauncher()

    await launcher.launch({
      intent: 'OPEN_SYSTEM_SETTINGS',
      target: 'C:\\Windows\\System32\\cmd.exe /c calc',
      label: 'something hostile',
    })

    expect(openExternal).toHaveBeenCalledWith('ms-settings:')
  })

  it('an intent the launcher does not own still fails closed (no URI, no launch)', async () => {
    openExternal.mockClear()
    const launcher = createWindowsLauncher()

    const result = await launcher.launch({
      intent: 'OPEN_SETTINGS',
      target: '',
      label: 'Open Settings',
    })

    expect(result.ok).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })
})
