// Platform-neutral launcher abstraction. Executes ONLY StructuredActions.
// The concrete, platform-specific implementation lives behind this interface
// (see electron/platform/windows-launcher.ts). The core must never execute
// raw shell commands or depend on Windows-only APIs.

import type { LaunchResult, StructuredAction } from './types'

export interface Launcher {
  launch(action: StructuredAction): Promise<LaunchResult>
}
