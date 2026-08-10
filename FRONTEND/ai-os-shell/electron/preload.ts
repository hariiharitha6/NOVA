import { contextBridge, ipcRenderer } from 'electron'

// Minimal, typed bridge. Only NOVA-specific channels are exposed.
const nova = {
  getConfig: () => ipcRenderer.invoke('nova:config-get'),
  updateConfig: (patch: unknown) => ipcRenderer.invoke('nova:config-set', patch),
  runCommand: (input: string) => ipcRenderer.invoke('nova:run-command', input),
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
  onOverlayShown: (cb: () => void) => {
    ipcRenderer.on('nova:overlay-shown', cb)
    return () => ipcRenderer.removeListener('nova:overlay-shown', cb)
  },
  onConfigChanged: (cb: (config: unknown) => void) => {
    ipcRenderer.on('nova:config-changed', (_event, config) => cb(config))
    return () => ipcRenderer.removeListener('nova:config-changed', cb)
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
