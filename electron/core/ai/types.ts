// NOVA v0.3 (V03-S5) — the AI interpretation seam.
//
// THE AI IS AN INTERPRETER, NOT AN EXECUTOR.
//
// `CommandInterpreter` is the ONLY capability the AI layer is given. It receives
// the user's text plus a minimal, name-only view of NOVA's registry, and it
// returns a *proposal*: a name to select, never an action to run.
//
// What the interpreter deliberately CANNOT reach, by construction:
//
//   * the Launcher          — no way to execute anything
//   * the confirmation gate — no way to approve anything
//   * Electron / IPC / BrowserWindow
//   * node:child_process, node:fs, any filesystem or process API
//   * the risk policy       — it cannot state, raise, or lower a risk level
//
// The interpreter is constructed from plain data only. It is never handed a
// reference to any of the above, so there is nothing for a prompt-injected
// model to reach for even if it is asked to.
//
// Platform-neutral. No Electron imports allowed in this directory.

import type { Intent } from '../types'

export type { Intent }

/**
 * Intents an interpreter MAY propose.
 *
 * Built from the existing `Intent` union — the model cannot invent a new one.
 * Intents deliberately excluded, and why:
 *
 *   OPEN_SETTINGS / SHOW_FAVORITES / SHOW_RECENTS — take no target, are matched
 *     by a single deterministic keyword, and are already recognised whenever a
 *     user asks for them. Letting a model "choose" them adds interpretation
 *     risk and zero capability.
 *   CLARIFICATION / UNKNOWN — these are outcomes the pipeline produces, not
 *     things to propose. A model that is unsure returns UNKNOWN, which is
 *     handled as a failure and never executed.
 */
export const AI_ALLOWED_INTENTS: readonly Intent[] = [
  'OPEN_APPLICATION',
  'OPEN_WEBSITE',
  'OPEN_FILE',
  'OPEN_FOLDER',
  'SEARCH_WEB',
  'SEARCH_YOUTUBE',
  'FOCUS_APPLICATION',
]

/**
 * The ONLY shape the interpreter may return.
 *
 * `target` is a NAME the deterministic registry resolves — never a path, never
 * a URL, never a shell string. `risk` is deliberately absent from this type and
 * from the accepted JSON keys: the model has no vocabulary for risk.
 */
export interface CommandProposal {
  intent: Intent
  /** A registry name/alias, a search query, or a bare http(s) site. */
  target: string
  /** Optional structured extras. Only `query` is meaningful today. */
  arguments?: Record<string, unknown>
  /** Model's own confidence in [0,1]. Metadata only — never risk. */
  confidence?: number
}

/** Why an interpretation attempt produced no usable proposal. */
export type InterpretFailureReason =
  /** The feature is switched off, or no interpreter is configured at all. */
  | 'disabled'
  /** The local runtime/model is not reachable, or the model is not present. */
  | 'unavailable'
  /** The model replied with something that is not a parsable JSON object. */
  | 'malformed'
  /** The model did not answer within the configured timeout. */
  | 'timeout'
  /** The model replied, but the proposal violated the strict schema. */
  | 'invalid'

export type InterpretOutcome =
  | { status: 'proposed'; proposal: CommandProposal }
  | { status: 'unsupported'; reason: InterpretFailureReason; detail?: string }

/**
 * Minimal, name-only registry context.
 *
 * NOVA deliberately sends NAMES AND ALIASES ONLY — never `AppEntry.path`, never
 * a website `url`, never a file path. The model has no way to learn, guess, or
 * echo a machine path or an origin it was not given, and NOVA keeps resolving
 * every target through the validated registry itself.
 */
export interface InterpretationContext {
  apps: string[]
  websites: string[]
  filesAndFolders: string[]
}

export interface CommandInterpreter {
  /** Stable identifier used in logs/messages (e.g. "local-ollama"). */
  readonly name: string
  /**
   * Interpret user text into a proposal. Implementations MUST NOT throw for
   * ordinary failures: every error path returns an `unsupported` outcome so the
   * pipeline can fail closed.
   */
  interpret(input: string, context: InterpretationContext): Promise<InterpretOutcome>
}

/**
 * Builds the name-only context from a validated registry snapshot. Kept here so
 * the only way to build an `InterpretationContext` already drops every path.
 */
export function interpretationContext(snapshot: {
  apps: Array<{ name: string; aliases: string[] }>
  websites: Array<{ name: string; aliases: string[] }>
  fileFolders: Array<{ name: string }>
}): InterpretationContext {
  const names = (items: Array<{ name: string; aliases: string[] }>): string[] => {
    const out: string[] = []
    for (const item of items) {
      if (item.name) out.push(item.name)
      for (const alias of item.aliases) {
        if (alias && !out.includes(alias)) out.push(alias)
      }
    }
    return out
  }
  return {
    apps: names(snapshot.apps),
    websites: names(snapshot.websites),
    filesAndFolders: snapshot.fileFolders.map((f) => f.name).filter(Boolean),
  }
}