import { contextBridge, ipcRenderer } from 'electron'

// Minimal, typed bridge. Only NOVA-specific channels are exposed.
const nova = {
  getConfig: () => ipcRenderer.invoke('nova:config-get'),
  updateConfig: (patch: unknown) => ipcRenderer.invoke('nova:config-set', patch),
  runCommand: (input: string) => ipcRenderer.invoke('nova:run-command', input),
  // V03-S4: the renderer may only echo a token it was handed. It has no way to
  // submit command data as "confirmed".
  getConfirmationState: () => ipcRenderer.invoke('nova:confirmation-state'),
  confirmCommand: (token: string) => ipcRenderer.invoke('nova:confirm-command', token),
  cancelCommand: (token: string) => ipcRenderer.invoke('nova:cancel-command', token),
  getRegistry: () => ipcRenderer.invoke('nova:registry'),
  getStartup: () => ipcRenderer.invoke('nova:startup-get'),
  setStartup: (enable: boolean) => ipcRenderer.send('nova:startup-set', enable),
  getDisplays: () => ipcRenderer.invoke('nova:displays'),
  placeDotOnDisplay: (displayId: number) => ipcRenderer.invoke('nova:dot-place-display', displayId),
  pickExe: () => ipcRenderer.invoke('nova:pick-exe'),
  pickFolder: () => ipcRenderer.invoke('nova:pick-folder'),
  pickFile: () => ipcRenderer.invoke('nova:pick-file'),
  hideOverlay: () => ipcRenderer.send('nova:overlay-hide'),
  toggleOverlay: () => ipcRenderer.send('nova:overlay-toggle'),
  toggleSettings: () => ipcRenderer.send('nova:settings-toggle'),
  moveDotBy: (dx: number, dy: number) => ipcRenderer.send('nova:dot-move', { dx, dy }),
  moveDotEnd: () => ipcRenderer.send('nova:dot-move-end'),
  quit: () => ipcRenderer.send('nova:quit'),
  voiceStatus: () => ipcRenderer.invoke('nova:voice-status'),
  voiceSendAudio: (samples: Float32Array) => ipcRenderer.send('nova:voice-audio', samples),
  voiceMicError: (message: string) => ipcRenderer.send('nova:voice-mic-error', message),
  wakeSendAudio: (samples: Float32Array) => ipcRenderer.send('nova:wake-audio', samples),
  wakeStatus: () => ipcRenderer.invoke('nova:wake-status'),
  onOverlayShown: (cb: () => void) => {
    ipcRenderer.on('nova:overlay-shown', cb)
    return () => ipcRenderer.removeListener('nova:overlay-shown', cb)
  },
  onConfigChanged: (cb: (config: unknown) => void) => {
    ipcRenderer.on('nova:config-changed', (_event, config) => cb(config))
    return () => ipcRenderer.removeListener('nova:config-changed', cb)
  },
  onVoiceState: (cb: (state: unknown) => void) => {
    ipcRenderer.on('nova:voice-state', (_event, state) => cb(state))
    return () => ipcRenderer.removeListener('nova:voice-state', cb)
  },
  onConfirmationState: (cb: (request: unknown) => void) => {
    const listener = (_event: unknown, request: unknown): void => cb(request ?? null)
    ipcRenderer.on('nova:confirmation-state', listener)
    return () => ipcRenderer.removeListener('nova:confirmation-state', listener)
  },
  // v0.3 Bugs 3/4: voice responses are broadcast to every window, so a result
  // produced by a spoken command renders in the overlay like a typed one.
  onCommandResult: (cb: (response: unknown) => void) => {
    const listener = (_event: unknown, response: unknown): void => cb(response)
    ipcRenderer.on('nova:command-result', listener)
    return () => ipcRenderer.removeListener('nova:command-result', listener)
  },
  getLastVoiceListResult: () => ipcRenderer.invoke('nova:last-voice-list-result'),
  onWakeStatus: (cb: (status: unknown) => void) => {
    ipcRenderer.on('nova:wake-status-changed', (_event, status) => cb(status))
    return () => ipcRenderer.removeListener('nova:wake-status-changed', cb)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('nova', nova)
  } catch (error) {
    console.error(error)
  }
} else {
  // Unsafe fallback, dev only.
  ;(window as unknown as { nova: typeof nova }).nova = nova
}
