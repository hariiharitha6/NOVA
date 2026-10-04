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
import { registerIpcHandlers, broadcastConfig, broadcastConfirmationState } from './ipc'
import { executeCommand, createCommandPipelineDeps } from './core/command-pipeline'
import { createConfirmationGate } from './core/confirmation'
import type { ConfirmationGate } from './core/confirmation'
import { migrateShortcutDefaults } from './core/shortcut-policy'
import { createTray } from './tray'
import { createSherpaSpeechRecognizer } from './core/speech/sherpa-recognizer'
import { createVoiceController } from './core/speech/voice-controller'
import { createSherpaKeywordSpotter } from './core/speech/sherpa-kws'
import { createWakeWordController } from './core/speech/wake-controller'
import { DEFAULT_KWS_MODEL_NAME, MODEL_NAME } from './core/speech/constants'
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
  let wake: ReturnType<typeof createWakeWordController> | null = null
  /** V03-S4 — the single confirmation gate, kept for shutdown teardown. */
  let confirmationGate: ConfirmationGate | null = null

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

    // V03-S4: ONE confirmation gate for the whole process. Typed IPC and voice
    // both resolve through this instance, so there is a single pending slot and
    // no voice-only way to reach the executor.
    confirmationGate = createConfirmationGate({
      onSettled: () => {
        // The prompt can be answered from any surface, so every surface is told.
        voice?.clearConfirmation()
        if (confirmationGate) broadcastConfirmationState(confirmationGate)
      },
    })

    windowManager = createWindowManager(configStore, {
      // Hiding the overlay removes the prompt from the screen, so it must not
      // stay armed in the background.
      onOverlayHidden: () => {
        confirmationGate?.invalidate('cancelled')
      },
    })

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
        // SAME pipeline factory as the typed IPC path, so voice and typed input
        // can never diverge (focus / favorites / recents / settings included).
        // `source: 'voice'` adds ONLY the fixed confirmation phrases, and only
        // while a confirmation is actually pending.
        executeCommand(
          input,
          createCommandPipelineDeps({
            configStore,
            registry,
            launcher,
            confirmation: confirmationGate ?? undefined,
            onRecent: () => broadcastConfig(configStore),
            openSettings: () => windowManager?.showSettings(),
          }),
          { source: 'voice' },
        ),
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
        // Any phase change can arm/disarm the wake detector (which only runs
        // while IDLE). Reconcile lazily on every state transition.
        wake?.reconcile()
      },
    })
    voice = voiceInstance

    // Wake-word layer. Lazy: the keyword spotter only initializes when
    // voiceEnabled && wakeWordEnabled && phase === idle. On wake, it starts a
    // fresh STT listening session through the exact same voice controller, so
    // the wake phrase itself never enters the command pipeline.
    wake = createWakeWordController({
      spotter: createSherpaKeywordSpotter({
        modelDir: resolveModelDir(DEFAULT_KWS_MODEL_NAME),
        sampleRate: 16000,
      }),
      isVoiceEnabled: () => configStore.get().voiceEnabled,
      isWakeEnabled: () => configStore.get().wakeWordEnabled,
      getPhase: () => voiceInstance.getState().phase,
      onWake: () => voiceInstance.beginListening(),
      emit: (_armed, status) => {
        if (status) console.warn(`[NOVA] Wake word: ${status}`)
        const payload = {
          armed: wake?.isArmed() ?? false,
          available: wake?.isAvailable() ?? false,
          status,
        }
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('nova:wake-status-changed', payload)
        }
      },
    })
    wake.reconcile()

    if (configStore.get().voiceEnabled) {
      registerPttHotkey(configStore.get().pttHotkey, () => voiceInstance.togglePtt())
    }

    registerIpcHandlers({
      configStore,
      registry,
      launcher,
      manager: windowManager,
      voice: voiceInstance,
      wake,
      confirmation: confirmationGate,
    })
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
      // Never leave an armed confirmation behind on shutdown.
      confirmationGate?.dispose()
    } catch {
      // ignore
    }
    try {
      wake?.dispose()
    } catch {
      // ignore
    }
    try {
      voice?.dispose()
    } catch {
      // ignore
    }
  })
}
