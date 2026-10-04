// Windows launcher implementation. Runs behind the platform-neutral Launcher
// interface. Uses structured process spawning and Electron's shell module —
// never `cmd /c start` and never arbitrary command strings.

import { shell } from 'electron'
import { spawn } from 'node:child_process'
import type { Launcher } from '../core/launcher'
import type { LaunchResult, StructuredAction } from '../core/types'
import { executeFocusApplication } from '../core/app-focus-executor'
import { createWindowsApplicationFocusService } from './windows-app-focus'

const SAFE_URL = /^https?:\/\//i
const EXECUTABLE = /\.exe$/i

function spawnExecutable(exePath: string): Promise<LaunchResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: LaunchResult): void => {
      if (!settled) {
        settled = true
        resolve(result)
      }
    }
    const child = spawn(exePath, [], { windowsHide: true, detached: true, stdio: 'ignore' })
    child.on('error', (err) => finish({ ok: false, message: err.message, label: exePath }))
    child.once('spawn', () => {
      child.unref()
      finish({ ok: true, message: '', label: exePath })
    })
  })
}

async function openPath(target: string, label: string): Promise<LaunchResult> {
  try {
    const error = await shell.openPath(target)
    return error
      ? { ok: false, message: error, label }
      : { ok: true, message: '', label }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message, label }
  }
}

async function openUrl(url: string, label: string): Promise<LaunchResult> {
  let normalized: string
  if (SAFE_URL.test(url)) {
    normalized = url
  } else if (url.includes('://')) {
    return { ok: false, message: 'Blocked: only http(s) URLs are allowed', label }
  } else {
    normalized = `https://${url}`
  }
  try {
    await shell.openExternal(normalized)
    return { ok: true, message: '', label }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message, label }
  }
}

export function createWindowsLauncher(): Launcher {
  // Platform-specific focus backend. Core never sees the Win32 implementation.
  const focusService = createWindowsApplicationFocusService()
  return {
    async launch(action: StructuredAction): Promise<LaunchResult> {
      switch (action.intent) {
        case 'OPEN_APPLICATION':
          return EXECUTABLE.test(action.target)
            ? spawnExecutable(action.target)
            : openPath(action.target, action.label)
        case 'OPEN_FILE':
        case 'OPEN_FOLDER':
          return openPath(action.target, action.label)
        case 'SEARCH_WEB':
        case 'SEARCH_YOUTUBE':
        case 'OPEN_WEBSITE':
          return openUrl(action.target, action.label)
        // Focus an ALREADY RUNNING window. Never launches a second copy.
        case 'FOCUS_APPLICATION':
          return executeFocusApplication(action, { focusService })
        case 'CLARIFICATION':
          return { ok: false, message: 'Clarification needed', label: action.label }
        default:
          return { ok: false, message: `Unsupported intent: ${action.intent}`, label: action.label }
      }
    },
  }
}
