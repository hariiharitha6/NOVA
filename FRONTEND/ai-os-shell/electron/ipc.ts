// NOVA IPC handlers. All payloads from the renderer are validated before use.

import { app, ipcMain, BrowserWindow, dialog, screen } from 'electron'
import { basename, extname } from 'node:path'
import type { AppRegistry } from './core/app-registry'
import { sanitizeConfigPatch } from './core/config'
import { executeCommand } from './core/command-pipeline'
import type { Launcher } from './core/launcher'
import type { ConfigStore, DisplayInfo, NovaConfig } from './core/types'
import type { VoiceController } from './core/speech/voice-controller'
import type { WindowManager } from './windows'
import { registerHotkey, registerPttHotkey, unregisterEscapeCancel, unregisterPttHotkey } from './hotkey'
import { decideShortcutChange } from './core/shortcut-policy'
import { registerStartup, unregisterStartup, isStartupEnabled } from './startup'

export interface IpcDeps {
  configStore: ConfigStore
  registry: AppRegistry
  launcher: Launcher
  manager: WindowManager
  voice: VoiceController
}

interface PickedPath {
  path: string
  name: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFloat32Array(value: unknown): value is Float32Array {
  return (
    value instanceof Float32Array ||
    (ArrayBuffer.isView(value) && (value as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT === 4)
  )
}

export function broadcastConfig(configStore: ConfigStore): void {
  const config = configStore.get()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('nova:config-changed', config)
  }
}

/** (Re)apply the PTT registration from config. Reverts to the previous working
 * shortcut when the requested one cannot be registered. Returns the config. */
function applyVoiceHotkey(
  configStore: ConfigStore,
  voice: VoiceController,
  prev: NovaConfig,
): NovaConfig {
  const cfg = configStore.get()
  if (!cfg.voiceEnabled) {
    unregisterPttHotkey()
    unregisterEscapeCancel()
    voice.setEnabled(false)
    return cfg
  }
  const ok = registerPttHotkey(cfg.pttHotkey, () => voice.togglePtt())
  if (!ok) {
    configStore.update({ pttHotkey: prev.pttHotkey })
    registerPttHotkey(configStore.get().pttHotkey, () => voice.togglePtt())
    return configStore.get()
  }
  voice.setEnabled(true)
  return configStore.get()
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { configStore, registry, launcher, manager, voice } = deps

  const pipeline = {
    registry,
    launcher,
    configStore,
    onRecent: () => broadcastConfig(configStore),
  }

  ipcMain.handle('nova:config-get', () => configStore.get())

  ipcMain.handle('nova:config-set', (_event, raw: unknown) => {
    if (!isRecord(raw)) return configStore.get()
    const prev = configStore.get()
    const patch = sanitizeConfigPatch(raw)

    // Overlay hotkey change — check for conflict with the PTT shortcut.
    if (patch.hotkey && patch.hotkey !== prev.hotkey) {
      const decision = decideShortcutChange(
        patch.hotkey,
        prev.hotkey,
        prev.pttHotkey,
        (acc) => registerHotkey(acc, manager),
      )
      patch.hotkey = decision.effective
      if (!decision.accepted) {
        broadcastConfig(configStore)
        return configStore.get()
      }
    }

    // PTT hotkey change — check for conflict with the overlay shortcut.
    if (patch.pttHotkey && patch.pttHotkey !== prev.pttHotkey) {
      const decision = decideShortcutChange(
        patch.pttHotkey,
        prev.pttHotkey,
        prev.hotkey,
        (acc) => {
          unregisterPttHotkey()
          return registerPttHotkey(acc, () => voice.togglePtt())
        },
      )
      patch.pttHotkey = decision.effective
      if (!decision.accepted) {
        broadcastConfig(configStore)
        return configStore.get()
      }
    }

    const next = configStore.update(patch)
    if (patch.hotkey) {
      const ok = registerHotkey(next.hotkey, manager)
      if (!ok) {
        // Hotkey conflict (already in use by another app): keep the previous one.
        configStore.update({ hotkey: prev.hotkey })
        broadcastConfig(configStore)
        return configStore.get()
      }
    }
    if (patch.alwaysOnTop !== undefined && manager.dotWindow) {
      manager.dotWindow.setAlwaysOnTop(next.alwaysOnTop, 'pop-up-menu')
    }
    if (patch.voiceEnabled !== undefined || patch.pttHotkey) {
      const applied = applyVoiceHotkey(configStore, voice, prev)
      broadcastConfig(configStore)
      return applied
    }
    // The registry snapshot is built from customApps + websites + fileFolders.
    // Invalidate it whenever any of those groups changes so the overlay and
    // command engine see live updates without a restart.
    if (
      patch.customApps !== undefined ||
      patch.websites !== undefined ||
      patch.fileFolders !== undefined
    ) {
      registry.setConfig(next)
      registry.invalidate()
    }
    broadcastConfig(configStore)
    return next
  })

  ipcMain.handle('nova:run-command', (_event, raw: unknown) => {
    if (typeof raw !== 'string') {
      return {
        kind: 'clarification',
        action: { intent: 'CLARIFICATION', target: '', label: 'Invalid command.' },
      }
    }
    return executeCommand(raw, pipeline)
  })

  ipcMain.handle('nova:registry', () => registry.snapshot())

  ipcMain.handle('nova:startup-get', () => isStartupEnabled())
  ipcMain.on('nova:startup-set', (_event, enable: unknown) => {
    const on = enable === true
    if (on) registerStartup()
    else unregisterStartup()
    configStore.update({ startup: on })
    broadcastConfig(configStore)
  })

  ipcMain.on('nova:overlay-hide', () => manager.hideOverlay())
  ipcMain.on('nova:overlay-toggle', () => manager.toggleOverlay())

  ipcMain.on('nova:dot-move', (_event, payload: unknown) => {
    if (!isRecord(payload)) return
    const dx = payload['dx']
    const dy = payload['dy']
    if (typeof dx === 'number' && typeof dy === 'number' && Number.isFinite(dx) && Number.isFinite(dy)) {
      manager.moveDotBy(dx, dy)
    }
  })
  ipcMain.on('nova:dot-move-end', () => manager.persistDotPosition())

  ipcMain.handle('nova:displays', (): DisplayInfo[] => {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label || `Display ${d.id}`,
      bounds: d.bounds,
      workArea: d.workArea,
      isPrimary: d.id === primary.id,
    }))
  })

  ipcMain.handle('nova:dot-place-display', (_event, displayId: unknown): boolean => {
    if (typeof displayId !== 'number') return false
    return manager.placeDotOnDisplay(displayId)
  })

  // ─── Voice IPC ───────────────────────────────────────────────────────────

  ipcMain.handle('nova:voice-status', () => voice.getState())

  ipcMain.on('nova:voice-audio', (_event, samples: unknown) => {
    if (!isFloat32Array(samples)) return
    voice.acceptAudio(samples as Float32Array)
  })

  ipcMain.on('nova:voice-mic-error', (_event, message: unknown) => {
    voice.micError(typeof message === 'string' && message ? message : 'microphone error')
  })

  async function pickPath(
    event: Electron.IpcMainInvokeEvent,
    options: Electron.OpenDialogOptions,
    validate: (path: string) => boolean,
  ): Promise<PickedPath | null> {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return null
    const path = filePaths[0]
    if (!validate(path)) return null
    return { path, name: basename(path, extname(path)) }
  }

  ipcMain.handle('nova:pick-exe', (event) =>
    pickPath(
      event,
      {
        properties: ['openFile'],
        title: 'Select application executable',
        filters: [{ name: 'Applications', extensions: ['exe'] }],
      },
      (p) => /\.exe$/i.test(p),
    ),
  )

  ipcMain.handle('nova:pick-folder', (event) =>
    pickPath(
      event,
      { properties: ['openDirectory'], title: 'Select a folder' },
      () => true,
    ),
  )

  ipcMain.handle('nova:pick-file', (event) =>
    pickPath(
      event,
      { properties: ['openFile'], title: 'Select a file' },
      () => true,
    ),
  )

  ipcMain.on('nova:settings-toggle', () => manager.toggleSettings())

  ipcMain.on('nova:quit', () => app.quit())
}
