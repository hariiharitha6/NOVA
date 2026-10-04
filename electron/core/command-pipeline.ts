// Shared command pipeline. Voice transcripts and typed commands BOTH go
// through executeCommand so they produce identical behavior for the same text.
// Platform-neutral; Electron wiring is injected by the caller.
//
// v0.3 (V03-S4) — every command, from either input path, passes the same
// boundary before anything is executed:
//
//   input -> intent -> StructuredCommand -> risk classification -> validation
//         -> confirmation gate (MEDIUM/HIGH) -> execution
//
// The executor is never reached directly by the renderer, by IPC, or by the
// voice controller: they can only submit TEXT here, and text alone can never
// satisfy a confirmation — only the gate's opaque token can.
//
// v0.3 (V03-S5) — an OPTIONAL local AI interpreter is inserted as a FALLBACK
// only, behind deterministic recognition:
//
//   input -> deterministic engine --recognised--> existing path (unchanged)
//         --unrecognised--> local AI -> proposal -> strict validation
//                        -> deterministic resolution -> risk policy
//                        -> confirmation gate -> existing executor
//
// The AI is an interpreter, never an executor. It proposes a NAME; NOVA resolves,
// classifies, gates and runs it.

import type { CommandResponse, ConfigStore, NovaConfig, RegistrySnapshot, StructuredAction } from './types'
import type { Launcher } from './launcher'
import type { ConfirmationGate, ConfirmationPhrase } from './confirmation'
import type { CommandInterpreter } from './ai/types'
import { buildConfirmationPrompt, resolveConfirmationPhrase } from './confirmation'
import { classifyRisk, requiresConfirmation, trustedTargets } from './risk-policy'
import { resolveCommand } from './command-engine'
import { explainFailure } from './ai/interpreter'
import { interpretationContext } from './ai/types'
import { resolveProposal } from './ai/resolve-proposal'
import { AI_FALLBACK_HINT } from './ai/constants'
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
  /**
   * v0.3 (V03-S4) — the risk/confirmation gate. One instance is shared by the
   * typed and the voice path so a single confirmation slot exists and both input
   * paths resolve through exactly the same mechanism.
   *
   * Fail closed: when it is absent the pipeline still refuses every
   * confirmation-required action, so a missing gate can never widen what NOVA is
   * allowed to run.
   */
  confirmation?: ConfirmationGate
  /**
   * v0.3 (V03-S5) — OPTIONAL local AI interpretation, used ONLY as a fallback for
   * commands the deterministic engine did not recognise.
   *
   * A resolver function, not an instance, so the local provider is constructed
   * lazily on first use and never during startup. Returning null (the default
   * when the feature is off) means NOVA behaves exactly as it did before: the
   * interpreter is never consulted and no AI code runs at all.
   *
   * The interpreter is given no capability beyond proposing a name: it never
   * receives the launcher, the gate, IPC, Electron, or any filesystem handle.
   */
  interpreter?: () => CommandInterpreter | null
}

export const MAX_INPUT_LENGTH = 200

/** Which input surface produced the text. Only affects phrase handling. */
export type CommandInputSource = 'typed' | 'voice'

export interface ExecuteCommandOptions {
  /**
   * Defaults to 'typed'. Voice input additionally allows the fixed confirmation
   * phrases ("yes" / "no" …) while a confirmation is actually pending.
   */
  source?: CommandInputSource
}

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

/** The single execution path. Nothing else in NOVA may perform these steps. */
async function runAction(
  action: StructuredAction,
  deps: CommandPipelineDeps,
  snapshot: RegistrySnapshot,
): Promise<CommandResponse> {
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

function invalidCommand(): CommandResponse {
  return {
    kind: 'clarification',
    action: { intent: 'CLARIFICATION', target: '', label: 'Invalid command.' },
  }
}

function staleConfirmation(): CommandResponse {
  return {
    kind: 'cancelled',
    reason: 'stale',
    message: 'That confirmation is no longer valid. Nothing was run.',
  }
}

/**
 * Risk classification + the confirmation gate. LOW executes immediately;
 * everything else is HELD here and nothing is executed until the user answers.
 */
async function gateAndRun(
  action: StructuredAction,
  deps: CommandPipelineDeps,
  snapshot: RegistrySnapshot,
): Promise<CommandResponse> {
  const risk = classifyRisk(action, trustedTargets(snapshot))
  const classified: StructuredAction = { ...action, risk }
  if (!requiresConfirmation(risk)) {
    return runAction(classified, deps, snapshot)
  }

  const gate = deps.confirmation
  if (!gate) {
    return {
      kind: 'cancelled',
      reason: 'unavailable',
      action: classified,
      message: `${buildConfirmationPrompt(classified, 'MEDIUM')} NOVA could not ask for confirmation, so nothing was run.`,
    }
  }
  return { kind: 'confirmation', request: gate.open(classified) }
}

/**
 * Deterministic spoken answer to a PENDING confirmation. Never used when no
 * confirmation is open: with nothing pending this executes nothing and mutates
 * nothing, it just acknowledges inertly.
 */
async function respondToVoicePhrase(
  phrase: ConfirmationPhrase,
  deps: CommandPipelineDeps,
): Promise<CommandResponse> {
  // The spoken words are NEVER used as a token. Only the token the gate itself
  // issued for the currently pending command can resolve it.
  const request = deps.confirmation?.pending() ?? null
  if (!deps.confirmation || !request) {
    return {
      kind: 'result',
      result: {
        success: false,
        intent: 'UNKNOWN',
        message:
          phrase === 'confirm'
            ? 'There is nothing to confirm.'
            : 'There is nothing to cancel.',
      },
    }
  }
  return phrase === 'confirm'
    ? confirmPendingCommand(request.token, deps)
    : cancelPendingCommand(request.token, deps)
}

/**
 * v0.3 (V03-S5) — OPTIONAL local-AI interpretation fallback.
 *
 * Called ONLY when the deterministic engine returned CLARIFICATION. That single
 * guard is what makes this safe to have at all: a command NOVA already understands
 * is never re-interpreted, so the AI can never reinterpret "open chrome" as
 * something else, and every recognised command keeps its exact V03-S1..S4
 * behaviour, speed and privacy.
 *
 * Whatever comes back is still only a NAME. It is resolved against the validated
 * registry here and then handed to the SAME `gateAndRun` used by deterministic
 * commands, so risk classification, confirmation and execution are identical
 * whether a human pattern or a local model chose the intent.
 */
async function interpretFallback(
  raw: string,
  deps: CommandPipelineDeps,
  snapshot: RegistrySnapshot,
): Promise<
  | { kind: 'action'; action: StructuredAction }
  | { kind: 'failed'; message: string }
  | { kind: 'absent' }
> {
  const interpreter = deps.interpreter?.()
  if (!interpreter) return { kind: 'absent' }

  let outcome
  try {
    outcome = await interpreter.interpret(raw, interpretationContext(snapshot))
  } catch {
    // A throwing interpreter is a failure, never an execution.
    return { kind: 'failed', message: explainFailure('unavailable') }
  }

  if (outcome.status !== 'proposed') {
    return { kind: 'failed', message: explainFailure(outcome.reason) }
  }

  // NOTE: no risk is read from, derived from, or influenced by the proposal.
  // `resolveProposal` returns a StructuredAction with no `risk` field; the level
  // below is computed by `classifyRisk` alone.
  const resolution = resolveProposal(outcome.proposal, snapshot)
  if (!resolution.ok) {
    return { kind: 'failed', message: explainFailure(resolution.reason) }
  }
  return { kind: 'action', action: resolution.action }
}

/** The honest response for an AI attempt that produced nothing runnable. */
function aiClarification(message: string): CommandResponse {
  return {
    kind: 'clarification',
    action: {
      intent: 'CLARIFICATION',
      target: '',
      label: message,
      description: AI_FALLBACK_HINT,
    },
  }
}

export async function executeCommand(
  input: string,
  deps: CommandPipelineDeps,
  options: ExecuteCommandOptions = {},
): Promise<CommandResponse> {
  const source: CommandInputSource = options.source === 'voice' ? 'voice' : 'typed'
  const raw = typeof input === 'string' ? input.trim() : ''
  if (raw.length === 0 || raw.length > MAX_INPUT_LENGTH) {
    return invalidCommand()
  }

  if (source === 'voice') {
    const phrase = resolveConfirmationPhrase(raw)
    if (phrase) return respondToVoicePhrase(phrase, deps)
  }

  // At most one confirmation can ever be pending: a new command supersedes the
  // previous prompt immediately, so a stale dialog can never approve a newer
  // command and an older token is dead the moment it is replaced.
  deps.confirmation?.invalidate('superseded')

  const snapshot = await deps.registry.snapshot()

  // ── Tier 1: deterministic. Always tried first, always wins if it recognises. ──
  const action = resolveCommand(raw, snapshot)
  if (action.intent !== 'CLARIFICATION') {
    // FOCUS_APPLICATION and every OS side effect go through the platform
    // Launcher. SHOW_FAVORITIES / SHOW_RECENTS / OPEN_SETTINGS are answered from
    // the existing config store (and the existing settings window) here, so typed
    // and voice input share this exact same path.
    return gateAndRun(action, deps, snapshot)
  }

  // ── Tier 2: optional local AI. Unrecognised input only. ──────────────────
  const interpreted = await interpretFallback(raw, deps, snapshot)
  if (interpreted.kind === 'action') {
    return gateAndRun(interpreted.action, deps, snapshot)
  }
  if (interpreted.kind === 'failed') {
    return aiClarification(interpreted.message)
  }

  // No interpreter configured: the V03-S1..S4 clarification is returned verbatim.
  return { kind: 'clarification', action }
}

/**
 * Approve the pending command. `token` is the ONLY accepted input — no command
 * data crosses this boundary — and the gate returns the exact command it was
 * bound to, so the confirmed action can never differ from the prompted one.
 */
export async function confirmPendingCommand(
  rawToken: unknown,
  deps: CommandPipelineDeps,
): Promise<CommandResponse> {
  const gate = deps.confirmation
  if (!gate) return staleConfirmation()
  const resolution = gate.confirm(rawToken)
  if (resolution.status === 'rejected') return staleConfirmation()
  const snapshot = await deps.registry.snapshot()
  return runAction(resolution.action, deps, snapshot)
}

/** Reject the pending command. Never executes, whether or not the token matched. */
export function cancelPendingCommand(
  rawToken: unknown,
  deps: CommandPipelineDeps,
): CommandResponse {
  const gate = deps.confirmation
  if (!gate) return staleConfirmation()
  const resolution = gate.cancel(rawToken)
  if (resolution.status === 'rejected') return staleConfirmation()
  const action = resolution.action
  return {
    kind: 'cancelled',
    reason: 'user',
    action,
    message: `Cancelled. ${action.label} was not opened.`,
  }
}