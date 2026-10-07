// Platform-neutral executor for the FOCUS_APPLICATION intent (V03-S3).
//
// Turns a validated StructuredAction into a LaunchResult by delegating to the
// platform ApplicationFocusService. Contains no Windows-specific code.

import type { ApplicationFocusService } from './app-focus'
import type { LaunchResult, StructuredAction } from './types'

export interface FocusExecutorDeps {
  focusService: ApplicationFocusService
}

export async function executeFocusApplication(
  action: StructuredAction,
  deps: FocusExecutorDeps,
): Promise<LaunchResult> {
  if (action.intent !== 'FOCUS_APPLICATION') {
    return {
      ok: false,
      message: `Unsupported intent: ${action.intent}`,
      label: action.label,
    }
  }

  const result = await deps.focusService.focusApplication({
    exePath: action.target,
    appName: action.label,
  })

  switch (result.outcome) {
    case 'focused':
      return {
        ok: true,
        message: `${action.label} is now focused.`,
        label: action.label,
      }
    case 'not-running':
      // Structured "not currently running" result. Deliberately NOT converted
      // into OPEN_APPLICATION — NOVA never starts a second copy here. The
      // message keeps the required V03-S3-003 wording and tells the user how
      // to launch it instead (acceptance Bug 6), without doing it for them.
      return {
        ok: false,
        message: `${action.label} isn't currently running. Say "Open ${action.label}" to start it.`,
        label: action.label,
      }
    default:
      return {
        ok: false,
        message: `Focusing ${action.label} isn't available on this system.`,
        label: action.label,
      }
  }
}