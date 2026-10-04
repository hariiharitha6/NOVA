// Platform-neutral application focus abstraction (V03-S3).
//
// Core must never depend on Windows-only APIs. The concrete implementation
// lives behind this interface in electron/platform/.
//
// FOCUS_APPLICATION is strictly "activate an ALREADY RUNNING window". It must
// never launch a second copy of the application, and it must never fall back to
// OPEN_APPLICATION behaviour.

/** Structured outcome so callers can distinguish success from "not running". */
export type FocusOutcome =
  /** A running window was found and activation was requested. */
  | 'focused'
  /** No running instance with a usable window was found. Nothing was launched. */
  | 'not-running'
  /** The platform focus backend is unavailable on this machine. */
  | 'unavailable'

export interface FocusRequest {
  /**
   * Registry-validated executable path for the app (may be a `.lnk` Start Menu
   * shortcut). Never raw user text — it always originates from AppEntry.path.
   */
  exePath: string
  /** Registry-validated display name, e.g. "Google Chrome". */
  appName: string
}

export interface FocusResult {
  outcome: FocusOutcome
  /** Process image name (without extension) that matched, when detected. */
  processName?: string
  /** PID owning the activated window, when known. */
  pid?: number
  /** Title of the activated window, when known. */
  windowTitle?: string
}

export interface ApplicationFocusService {
  /**
   * Bring an already-running application window to the foreground.
   * Implementations MUST NOT start a new process.
   */
  focusApplication(request: FocusRequest): Promise<FocusResult>
}