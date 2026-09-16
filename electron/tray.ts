import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { WindowManager } from './windows'

export function createTray(manager: WindowManager): Tray {
  let iconPath: string
  if (is.dev) {
    iconPath = join(process.cwd(), 'resources', 'tray.png')
  } else {
    iconPath = join(process.resourcesPath, 'tray.png')
  }

  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) icon = nativeImage.createEmpty()
  } catch {
    icon = nativeImage.createEmpty()
  }

  const tray = new Tray(icon)
  tray.setToolTip('NOVA')

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open NOVA',
        click: () => manager.showOverlay(),
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        click: () => manager.showSettings(),
      },
      { type: 'separator' },
      {
        label: 'Quit NOVA',
        click: () => app.quit(),
      },
    ]),
  )

  tray.on('click', () => manager.toggleOverlay())

  return tray
}
