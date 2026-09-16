import { app } from 'electron'

const APP_NAME = 'NOVA'

export function registerStartup(): void {
  app.setLoginItemSettings({
    openAtLogin: true,
    name: APP_NAME,
    path: process.execPath,
    args: ['--startup'],
  })
}

export function unregisterStartup(): void {
  app.setLoginItemSettings({
    openAtLogin: false,
    name: APP_NAME,
    path: process.execPath,
  })
}

export function isStartupEnabled(): boolean {
  const settings = app.getLoginItemSettings({
    path: process.execPath,
    args: ['--startup'],
  })
  return settings.openAtLogin
}

export function wasLaunchedAtStartup(): boolean {
  return process.argv.includes('--startup')
}
