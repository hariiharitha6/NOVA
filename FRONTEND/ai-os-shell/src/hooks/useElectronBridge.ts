import { useEffect } from 'react'
import { useShellStore } from '../store/useShellStore'

// Type declarations for the exposed shell API
declare global {
  interface Window {
    shell: {
      resize: (w: number, h: number) => void
      hide: () => void
      show: () => void
      quit: () => void
      getTaskbarInfo: () => Promise<{ height: number; position: string }>
      getDisplays: () => Promise<any[]>
      switchDisplay: (id: number) => void
      isStartupEnabled: () => Promise<boolean>
      setStartup: (enable: boolean) => void
      getSystemInfo: () => Promise<any>
      openExternal: (url: string) => void
      onOpenSettings: (cb: () => void) => () => void
    }
  }
}

/**
 * Check if we're running inside Electron.
 */
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && 'shell' in window

/**
 * Hook to initialize electron bridge, load initial state,
 * and wire up main-process events.
 */
export function useElectronBridge() {
  const {
    setTaskbarHeight,
    setDisplays,
    setActiveDisplayId,
    setStartupEnabled,
    setMode,
  } = useShellStore()

  useEffect(() => {
    if (!isElectron()) return

    const api = window.shell

    // Load taskbar info
    api.getTaskbarInfo().then(({ height }) => {
      setTaskbarHeight(height)
    }).catch(() => {})

    // Load displays
    api.getDisplays().then((displays) => {
      setDisplays(displays)
      const primary = displays.find((d) => d.isPrimary)
      if (primary) setActiveDisplayId(primary.id)
    }).catch(() => {})

    // Load startup setting
    api.isStartupEnabled().then((enabled) => {
      setStartupEnabled(enabled)
    }).catch(() => {})

    // Listen for settings open event from tray
    const cleanup = api.onOpenSettings(() => {
      setMode('settings')
    })

    return cleanup
  }, [setTaskbarHeight, setDisplays, setActiveDisplayId, setStartupEnabled, setMode])
}

/**
 * Resize the Electron window.
 */
export function resizeWindow(width: number, height: number) {
  if (isElectron()) window.shell.resize(width, height)
}

/**
 * Toggle Windows startup launch.
 */
export function setWindowsStartup(enable: boolean) {
  if (isElectron()) window.shell.setStartup(enable)
}

/**
 * Switch the shell to a different display.
 */
export function switchToDisplay(displayId: number) {
  if (isElectron()) window.shell.switchDisplay(displayId)
}

/**
 * Open a URL in the default browser.
 */
export function openExternal(url: string) {
  if (isElectron()) window.shell.openExternal(url)
  else window.open(url, '_blank')
}

/**
 * Quit the application.
 */
export function quitApp() {
  if (isElectron()) window.shell.quit()
}
