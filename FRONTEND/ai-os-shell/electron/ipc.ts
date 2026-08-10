// NOVA IPC handlers. All payloads from the renderer are validated before use.

import { app, ipcMain, BrowserWindow, dialog, screen } from 'electron'
import { basename, extname } from 'node:path'
import type { AppRegistry } from './core/app-registry'
import { resolveCommand } from './core/command-engine'
import { sanitizeConfigPatch } from './core/config'
import type { Launcher } from './core/launcher'
import type { ConfigStore, DisplayInfo } from './core/types'
import type { WindowManager } from './windows'
import { registerHotkey } from './hotkey'
import { registerStartup, unregisterStartup, isStartupEnabled } from './startup'

export interface IpcDeps {
  configStore: ConfigStore
  registry: AppRegistry
  launcher: Launcher
  manager: WindowManager
}

const MAX_INPUT_LENGTH = 200

interface PickedPath {
  path: string
  name: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function broadcastConfig(configStore: ConfigStore): void {
  const config = configStore.get()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('nova:config-changed', config)
  }
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { configStore, registry, launcher, manager } = deps

  ipcMain.handle('nova:config-get', () => configStore.get())

  ipcMain.handle('nova:config-set', (_event, raw: unknown) => {
    if (!isRecord(raw)) return configStore.get()
    const prev = configStore.get()
    const patch = sanitizeConfigPatch(raw)
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
    if (patch.customApps !== undefined) {
      registry.setConfig(next)
      registry.invalidate()
    }
    broadcastConfig(configStore)
    return next
  })

  ipcMain.handle('nova:run-command', async (_event, raw: unknown) => {
    if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > MAX_INPUT_LENGTH) {
      return {
        kind: 'clarification',
        action: { intent: 'CLARIFICATION', target: '', label: 'Invalid command.' },
      }
    }
    const input = raw.trim()
    const snapshot = await registry.snapshot()
    const action = resolveCommand(input, snapshot)
    if (action.intent === 'CLARIFICATION') {
      return { kind: 'clarification', action }
    }
    const result = await launcher.launch(action)
    if (result.ok) {
      configStore.recordRecent({
        id: `${action.intent.toLowerCase()}:${action.target}`,
        label: action.label,
      })
      broadcastConfig(configStore)
    }
    return { kind: 'launched', action, result }
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
