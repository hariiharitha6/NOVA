// Shared command pipeline. Voice transcripts and typed commands BOTH go
// through executeCommand so they produce identical behavior for the same text.
// Platform-neutral; Electron wiring is injected by the caller.

import type {
  CommandResponse,
  ConfigStore,
  NovaConfig,
  RegistrySnapshot,
  StructuredAction,
} from './types'
import type { Launcher } from './launcher'
import { resolveCommand } from './command-engine'
import {
  executeOpenSettings,
  executeShowFavorites,
  executeShowRecents,
  isLocalAction,
} from './show-actions'

export interface CommandPipelineDeps {
  registry: { snapshot(): Promise<RegistrySnapshot> }
  launcher: Launcher
  configStore: ConfigStore
  /** Optional side effect after a successful launch (e.g. broadcast config). */
  onRecent?: (config: NovaConfig) => void
  /**
   * Optional main-process hook used by OPEN_SETTINGS to show the EXISTING
   * settings window. Injected so `electron/core` stays platform-neutral and no
   * second settings window is ever created.
   */
  openSettings?: () => void
}

export const MAX_INPUT_LENGTH = 200

/**
 * Single factory for pipeline dependencies. Typed IPC and the voice controller
 * MUST both build their deps here so the two input paths can never drift apart.
 */
export function createCommandPipelineDeps(deps: CommandPipelineDeps): CommandPipelineDeps {
  return deps
}

/**
 * Execute the "show"-style intents that need no OS side effect beyond the
 * existing settings window. Returns null for every other intent so the caller
 * falls through to the platform Launcher.
 */
async function executeLocalAction(
  action: StructuredAction,
  deps: CommandPipelineDeps,
  snapshot: RegistrySnapshot,
): Promise<CommandResponse | null> {
  if (!isLocalAction(action.intent)) return null

  const config = deps.configStore.get()
  switch (action.intent) {
    case 'SHOW_FAVORITES':
      return { kind: 'result', result: executeShowFavorites(action, config.favorites, snapshot) }
    case 'SHOW_RECENTS':
      return { kind: 'result', result: executeShowRecents(action, config.recents) }
    case 'OPEN_SETTINGS':
      deps.openSettings?.()
      return { kind: 'result', result: executeOpenSettings(action) }
    default:
      return null
  }
}

export async function executeCommand(
  input: string,
  deps: CommandPipelineDeps,
): Promise<CommandResponse> {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (raw.length === 0 || raw.length > MAX_INPUT_LENGTH) {
    return {
      kind: 'clarification',
      action: { intent: 'CLARIFICATION', target: '', label: 'Invalid command.' },
    }
  }
  const snapshot = await deps.registry.snapshot()
  const action = resolveCommand(raw, snapshot)
  if (action.intent === 'CLARIFICATION') {
    return { kind: 'clarification', action }
  }

  // FOCUS_APPLICATION and every OS side effect go through the platform
  // Launcher. SHOW_FAVORITES / SHOW_RECENTS / OPEN_SETTINGS are answered from
  // the existing config store (and the existing settings window) here, so typed
  // and voice input share this exact same path.
  const local = await executeLocalAction(action, deps, snapshot)
  if (local) return local

  const result = await deps.launcher.launch(action)
  if (result.ok) {
    deps.configStore.recordRecent({
      id: `${action.intent.toLowerCase()}:${action.target}`,
      label: action.label,
    })
    deps.onRecent?.(deps.configStore.get())
  }
  return { kind: 'launched', action, result }
}
