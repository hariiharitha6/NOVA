'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Minimal, explicit bridge. The renderer can read the record plan and hand back
// mono Float32 samples to save — nothing else. No filesystem, no network.
contextBridge.exposeInMainWorld('recorder', {
  getPlan: () => ipcRenderer.invoke('get-plan'),
  saveWav: (payload) => ipcRenderer.invoke('save-wav', payload),
  selftestSave: (payload) => ipcRenderer.invoke('selftest-save', payload),
  selftestDone: (summary) => ipcRenderer.send('selftest-done', summary),
})
