// Shared command pipeline. Voice transcripts and typed commands BOTH go
// through executeCommand so they produce identical behavior for the same text.
// Platform-neutral; Electron wiring (broadcast) is injected via onRecent.

import type { CommandResponse, ConfigStore, NovaConfig, RegistrySnapshot } from './types'
import type { Launcher } from './launcher'
import { resolveCommand } from './command-engine'

export interface CommandPipelineDeps {
  registry: { snapshot(): Promise<RegistrySnapshot> }
  launcher: Launcher
  configStore: ConfigStore
  /** Optional side effect after a successful launch (e.g. broadcast config). */
  onRecent?: (config: NovaConfig) => void
}

export const MAX_INPUT_LENGTH = 200

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
