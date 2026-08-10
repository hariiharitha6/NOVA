import { app } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createConfigStore } from './core/config'
import { AppRegistry } from './core/app-registry'
import { WindowsAppSource } from './platform/windows-app-source'
import { createWindowsLauncher } from './platform/windows-launcher'
import { createWindowManager } from './windows'
import { registerHotkey, unregisterHotkey } from './hotkey'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (windowManager) windowManager.showOverlay()
  })

  let windowManager: ReturnType<typeof createWindowManager> | null = null
  let tray: Electron.Tray | null = null

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.nova.desktop')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const configStore = createConfigStore(join(app.getPath('userData'), 'nova-config.json'))
    const registry = new AppRegistry({
      sources: [new WindowsAppSource()],
      config: configStore.get(),
    })
    const launcher = createWindowsLauncher()

    windowManager = createWindowManager(configStore)

    const hotkey = configStore.get().hotkey
    const hotkeyOk = registerHotkey(hotkey, windowManager)
    if (!hotkeyOk) {
      console.warn(`[NOVA] Global hotkey "${hotkey}" could not be registered (already in use). Use the tray icon instead.`)
    }
    registerIpcHandlers({ configStore, registry, launcher, manager: windowManager })
    windowManager.init()
    tray = createTray(windowManager)

    app.on('activate', () => {
      windowManager?.showOverlay()
    })
  })

  app.on('window-all-closed', () => {
    // Keep running in the tray — the user quits via the tray menu.
  })

  app.on('will-quit', () => {
    unregisterHotkey()
    tray?.destroy()
  })
}
