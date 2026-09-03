import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createConfigStore } from './core/config'
import { AppRegistry } from './core/app-registry'
import { WindowsAppSource } from './platform/windows-app-source'
import { createWindowsLauncher } from './platform/windows-launcher'
import { seedDefaultFileFolders } from './platform/windows-shortcuts'
import { createWindowManager } from './windows'
import { registerHotkey, unregisterAllHotkeys, registerPttHotkey, registerEscapeCancel, unregisterEscapeCancel } from './hotkey'
import { registerIpcHandlers, broadcastConfig } from './ipc'
import { executeCommand } from './core/command-pipeline'
import { migrateShortcutDefaults } from './core/shortcut-policy'
import { createTray } from './tray'
import { createSherpaSpeechRecognizer } from './core/speech/sherpa-recognizer'
import { createVoiceController } from './core/speech/voice-controller'
import { MODEL_NAME } from './core/speech/constants'
import { resolveModelDir } from './model-resolver'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (windowManager) windowManager.showOverlay()
  })

  let windowManager: ReturnType<typeof createWindowManager> | null = null
  let tray: Electron.Tray | null = null
  let voice: ReturnType<typeof createVoiceController> | null = null

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.nova.desktop')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const configStore = createConfigStore(join(app.getPath('userData'), 'nova-config.json'))

    // One-time shortcut migration: v0.1 defaults (Ctrl+Space / Ctrl+Shift+Space)
    // → v0.2 defaults (Ctrl+J / Ctrl+Shift+J). Only touches users who still
    // have the exact legacy defaults; custom shortcuts are never overwritten.
    const migrationPatch = migrateShortcutDefaults(configStore.get())
    if (Object.keys(migrationPatch).length > 0) {
      configStore.update(migrationPatch)
    }

    seedDefaultFileFolders(configStore)
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

    // Voice engine. The recognizer runs ONLY in the main process; the renderer
    // streams Float32 PCM over typed IPC and never sees the model files.
    const recognizer = createSherpaSpeechRecognizer({
      modelDir: resolveModelDir(MODEL_NAME),
      sampleRate: 16000,
    })
    const voiceInstance = createVoiceController({
      recognizer,
      isEnabled: () => configStore.get().voiceEnabled,
      executeCommand: (input) =>
        executeCommand(input, {
          configStore,
          registry,
          launcher,
          onRecent: () => broadcastConfig(configStore),
        }),
      emit: (state) => {
        windowManager?.setVoiceMode(state.phase !== 'idle')
        if (state.phase === 'listening') {
          registerEscapeCancel(() => voice?.cancelListening())
        } else {
          unregisterEscapeCancel()
        }
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('nova:voice-state', state)
        }
      },
    })
    voice = voiceInstance

    if (configStore.get().voiceEnabled) {
      registerPttHotkey(configStore.get().pttHotkey, () => voiceInstance.togglePtt())
    }

    registerIpcHandlers({ configStore, registry, launcher, manager: windowManager, voice: voiceInstance })
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
    unregisterAllHotkeys()
    tray?.destroy()
    try {
      voice?.dispose()
    } catch {
      // ignore
    }
  })
}
