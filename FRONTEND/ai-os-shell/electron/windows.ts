// NOVA window manager. Owns the tiny dot window and the command overlay window.

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ConfigStore, WindowPosition } from './core/types'

const DOT_SIZE = 28
const OVERLAY_WIDTH = 560
const OVERLAY_HEIGHT = 360
const SETTINGS_WIDTH = 720
const SETTINGS_HEIGHT = 600
const MARGIN = 16

export interface WindowManager {
  readonly dotWindow: BrowserWindow | null
  readonly overlayWindow: BrowserWindow | null
  readonly settingsWindow: BrowserWindow | null
  init(): void
  showOverlay(): void
  hideOverlay(): void
  toggleOverlay(): void
  showSettings(): void
  toggleSettings(): void
  placeDotOnDisplay(displayId: number): boolean
  moveDotBy(dx: number, dy: number): void
  persistDotPosition(): void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function baseWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
  }
}

function loadView(win: BrowserWindow, view: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?view=${view}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
  }
}

export function createWindowManager(configStore: ConfigStore): WindowManager {
  let dot: BrowserWindow | null = null
  let overlay: BrowserWindow | null = null
  let settings: BrowserWindow | null = null

  function initialDotPosition(): { x: number; y: number } {
    const saved: WindowPosition | null = configStore.get().position
    if (saved) {
      const display = screen.getAllDisplays().find((d) => d.id === saved.displayId)
      if (display) {
        const wa = display.workArea
        return {
          x: clamp(saved.x, wa.x, wa.x + wa.width - DOT_SIZE),
          y: clamp(saved.y, wa.y, wa.y + wa.height - DOT_SIZE),
        }
      }
    }
    const display = screen.getPrimaryDisplay()
    const wa = display.workArea
    return {
      x: wa.x + wa.width - DOT_SIZE - MARGIN,
      y: wa.y + wa.height - DOT_SIZE - MARGIN,
    }
  }

  function createDotWindow(): BrowserWindow {
    const { x, y } = initialDotPosition()
    const win = new BrowserWindow({
      width: DOT_SIZE,
      height: DOT_SIZE,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: baseWebPreferences(),
    })
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
    win.on('ready-to-show', () => win.showInactive())
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.on('closed', () => {
      if (dot === win) dot = null
    })
    loadView(win, 'dot')
    return win
  }

  function dotBounds(): Electron.Rectangle {
    if (dot && !dot.isDestroyed()) return dot.getBounds()
    const { x, y } = initialDotPosition()
    return { x, y, width: DOT_SIZE, height: DOT_SIZE }
  }

  function overlayPosition(): { x: number; y: number } {
    const rect = dotBounds()
    const display = screen.getDisplayMatching(rect)
    const wa = display.workArea
    const x = clamp(
      Math.round(rect.x + rect.width / 2 - OVERLAY_WIDTH / 2),
      wa.x,
      wa.x + wa.width - OVERLAY_WIDTH,
    )
    let y = rect.y - OVERLAY_HEIGHT - 12
    if (y < wa.y) y = rect.y + rect.height + 12
    y = clamp(y, wa.y, wa.y + wa.height - OVERLAY_HEIGHT)
    return { x, y }
  }

  function createOverlayWindow(): BrowserWindow {
    const { x, y } = overlayPosition()
    const win = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: baseWebPreferences(),
    })
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.on('closed', () => {
      if (overlay === win) overlay = null
    })
    loadView(win, 'overlay')
    return win
  }

  function settingsPosition(): { x: number; y: number } {
    const rect = dotBounds()
    const display = screen.getDisplayMatching(rect)
    const wa = display.workArea
    return {
      x: wa.x + Math.round((wa.width - SETTINGS_WIDTH) / 2),
      y: wa.y + Math.round((wa.height - SETTINGS_HEIGHT) / 2),
    }
  }

  function createSettingsWindow(): BrowserWindow {
    const { x, y } = settingsPosition()
    const win = new BrowserWindow({
      width: SETTINGS_WIDTH,
      height: SETTINGS_HEIGHT,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: baseWebPreferences(),
    })
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.on('closed', () => {
      if (settings === win) settings = null
    })
    loadView(win, 'settings')
    return win
  }

  function clampDotToDisplay(): void {
    if (!dot || dot.isDestroyed()) return
    const rect = dot.getBounds()
    const display = screen.getDisplayMatching(rect)
    const wa = display.workArea
    const x = clamp(rect.x, wa.x, wa.x + wa.width - DOT_SIZE)
    const y = clamp(rect.y, wa.y, wa.y + wa.height - DOT_SIZE)
    if (x !== rect.x || y !== rect.y) dot.setPosition(x, y, true)
  }

  return {
    get dotWindow() {
      return dot
    },
    get overlayWindow() {
      return overlay
    },
    get settingsWindow() {
      return settings
    },
    init() {
      if (dot && !dot.isDestroyed()) return
      dot = createDotWindow()
      screen.on('display-metrics-changed', clampDotToDisplay)
      screen.on('display-added', clampDotToDisplay)
      screen.on('display-removed', clampDotToDisplay)
    },
    showOverlay() {
      if (!overlay || overlay.isDestroyed()) overlay = createOverlayWindow()
      const { x, y } = overlayPosition()
      overlay.setPosition(x, y, true)
      overlay.show()
      overlay.setAlwaysOnTop(true, 'pop-up-menu')
      overlay.focus()
      overlay.webContents.send('nova:overlay-shown')
    },
    hideOverlay() {
      if (overlay && !overlay.isDestroyed()) overlay.hide()
    },
    toggleOverlay() {
      if (overlay && overlay.isVisible()) this.hideOverlay()
      else this.showOverlay()
    },
    showSettings() {
      if (!settings || settings.isDestroyed()) settings = createSettingsWindow()
      const { x, y } = settingsPosition()
      settings.setPosition(x, y, true)
      settings.show()
      settings.setAlwaysOnTop(true, 'pop-up-menu')
      settings.focus()
    },
    toggleSettings() {
      if (settings && settings.isVisible()) settings.hide()
      else this.showSettings()
    },
    placeDotOnDisplay(displayId) {
      if (!dot || dot.isDestroyed()) return false
      const display = screen.getAllDisplays().find((d) => d.id === displayId)
      if (!display) return false
      const wa = display.workArea
      const x = wa.x + wa.width - DOT_SIZE - MARGIN
      const y = wa.y + wa.height - DOT_SIZE - MARGIN
      dot.setPosition(x, y, true)
      const position: WindowPosition = { displayId: display.id, x, y }
      configStore.update({ position })
      return true
    },
    moveDotBy(dx, dy) {
      if (!dot || dot.isDestroyed()) return
      const [x, y] = dot.getPosition()
      dot.setPosition(Math.round(x + dx), Math.round(y + dy), true)
    },
    persistDotPosition() {
      if (!dot || dot.isDestroyed()) return
      const rect = dot.getBounds()
      const display = screen.getDisplayMatching(rect)
      const wa = display.workArea
      const x = clamp(rect.x, wa.x, wa.x + wa.width - DOT_SIZE)
      const y = clamp(rect.y, wa.y, wa.y + wa.height - DOT_SIZE)
      dot.setPosition(x, y, true)
      const position: WindowPosition = { displayId: display.id, x, y }
      configStore.update({ position })
    },
  }
}
