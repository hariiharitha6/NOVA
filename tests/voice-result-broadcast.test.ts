/**
 * Acceptance Bugs 3/4 — a VOICE command's response is produced in the main
 * process, so it never travels through the overlay's `runCommand` invoke.
 *
 * These tests lock the delivery mechanism: every voice response is broadcast to
 * all windows on `nova:command-result`, and a list result is additionally kept
 * fetchable for a short window so a window that was still loading when the
 * broadcast went out can pick it up exactly once.
 *
 * `electron` is mocked: no window, no IPC bus, no GUI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sent, handlers } = vi.hoisted(() => ({
  sent: [] as Array<{ channel: string; payload: unknown }>,
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
    quit: () => {},
    setLoginItemSettings: () => {},
    getLoginItemSettings: () => ({ openAtLogin: false }),
  },
  ipcMain: {
    handle: (channel: string, cb: (...args: unknown[]) => unknown) => {
      handlers[channel] = cb
    },
    on: (channel: string, cb: (...args: unknown[]) => unknown) => {
      handlers[channel] = cb
    },
  },
  BrowserWindow: {
    getAllWindows: () => [
      {
        webContents: {
          send: (channel: string, payload: unknown) => {
            sent.push({ channel, payload })
          },
        },
      },
    ],
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
  screen: {
    getPrimaryDisplay: () => ({
      id: 1,
      label: 'Display 1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      isPrimary: true,
    }),
    getAllDisplays: () => [],
  },
}))

import {
  broadcastCommandResult,
  rememberVoiceListResult,
  registerIpcHandlers,
} from '../electron/ipc'
import type { CommandResponse } from '../electron/core/types'
import { defaultConfig } from '../electron/core/types'
import { createConfirmationGate } from '../electron/core/confirmation'
import type { IpcDeps } from '../electron/ipc'

const SNAPSHOT = { apps: [], websites: [], fileFolders: [] }

function listResponse(kind: 'favorites' | 'recents'): CommandResponse {
  return {
    kind: 'result',
    result: {
      success: true,
      intent: kind === 'favorites' ? 'SHOW_FAVORITES' : 'SHOW_RECENTS',
      message: kind === 'favorites' ? 'Here are your favorites.' : 'Here are your recent apps.',
      data: { kind, items: [{ id: 'app-notepad', label: 'Notepad' }], total: 1 },
    },
  }
}

const deps = {
  configStore: {
    get: () => defaultConfig(),
    update: (patch: Record<string, unknown>) => ({ ...defaultConfig(), ...patch }),
    recordRecent: () => defaultConfig(),
  },
  registry: {
    snapshot: async () => SNAPSHOT,
    setConfig: () => {},
    invalidate: () => {},
  },
  launcher: { launch: async () => ({ ok: true, message: '', label: '' }) },
  manager: {
    showSettings: () => {},
    hideOverlay: () => {},
    toggleOverlay: () => {},
    showOverlay: () => {},
    toggleSettings: () => {},
    moveDotBy: () => {},
    persistDotPosition: () => {},
    placeDotOnDisplay: () => true,
    init: () => {},
    dotWindow: null,
  },
  voice: {
    getState: () => ({ phase: 'idle' as const, partial: '', transcript: '', message: '' }),
    togglePtt: () => {},
    acceptAudio: () => {},
    micError: () => {},
    setEnabled: () => {},
    clearConfirmation: () => {},
    cancelListening: () => {},
    beginListening: () => {},
    dispose: () => {},
  },
  wake: {
    acceptAudio: () => {},
    isArmed: () => false,
    isAvailable: () => false,
    getStatus: () => '',
    setEnabled: () => {},
    reconcile: () => {},
    setPhrase: () => true,
    dispose: () => {},
  },
  confirmation: createConfirmationGate({ timeoutMs: 30_000 }),
} as unknown as IpcDeps

function take(channel: string, ...args: unknown[]): unknown {
  const handler = handlers[channel]
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler(...args)
}

beforeEach(() => {
  sent.length = 0
  registerIpcHandlers(deps)
})

afterEach(() => {
  vi.useRealTimers()
  // Drain anything a test left behind so it cannot leak into the next one.
  take('nova:last-voice-list-result')
})

describe('acceptance Bugs 3/4: voice responses reach the renderer', () => {
  it('broadcasts every voice response on nova:command-result', () => {
    const response = listResponse('recents')
    broadcastCommandResult(response)

    expect(sent).toHaveLength(1)
    expect(sent[0].channel).toBe('nova:command-result')
    expect(sent[0].payload).toEqual(response)
  })

  it('broadcasts to every open window', () => {
    broadcastCommandResult(listResponse('favorites'))
    expect(sent.filter((m) => m.channel === 'nova:command-result')).toHaveLength(1)
  })

  it('keeps a voice list result fetchable, exactly once', () => {
    const response = listResponse('favorites')
    rememberVoiceListResult(response)

    expect(take('nova:last-voice-list-result')).toEqual(response)
    // Consumed: a later open must fall back to the normal fresh overlay state.
    expect(take('nova:last-voice-list-result')).toBeNull()
  })

  it('expires a list result so a much later overlay never replays a stale one', () => {
    vi.useFakeTimers()
    rememberVoiceListResult(listResponse('recents'))
    vi.advanceTimersByTime(60_000)
    expect(take('nova:last-voice-list-result')).toBeNull()
  })

  it('returns null when no voice list result was ever produced', () => {
    expect(take('nova:last-voice-list-result')).toBeNull()
  })
})
