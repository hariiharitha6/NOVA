// NOVA v0.3 (V03-S5) — the local command interpreter.
//
// `LocalCommandInterpreter` is a `CommandInterpreter`: it holds a local model
// client and turns user text into a *validated proposal*. That is all it can do.
//
// It imports no Electron module, no process module, no filesystem module, and no
// launcher. It is constructed from plain data. The only things it can reach are
// the injected `LocalModelClient`, the shared prompt builder, and the pure
// validators — so a prompt-injected model has nothing to escalate into.
//
// The full journey of one proposal, with the trust boundary marked:
//
//   user text
//     -> buildInterpretationMessages   (constrained prompt, name-only context)
//     -> client.complete              (loopback only, abortable)
//     -> extractJsonObject            (recover one JSON object from raw text)
//     -> validateProposal             (strict schema + intent allowlist)   << AI output stops being trusted
//     -> checkConfidence              (metadata gate)
//     -> CommandProposal              (a NAME, not an action)
//
// Resolution, risk classification, confirmation and execution all happen in
// NOVA's own code, strictly downstream.

import {
  AI_INTERPRETATION_TIMEOUT_MS,
  AI_LOW_CONFIDENCE_MESSAGE,
  AI_MAX_TIMEOUT_MS,
  AI_MIN_TIMEOUT_MS,
  AI_REJECTED_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  AI_UNSUPPORTED_MESSAGE,
} from './constants'
import { buildInterpretationMessages, extractJsonObject } from './prompt'
import { checkConfidence, validateProposal } from './proposal-schema'
import type { LocalModelClient } from './ollama-client'
import type { CommandInterpreter, InterpretFailureReason, InterpretOutcome, InterpretationContext } from './types'

export interface LocalInterpreterOptions {
  /** The local model client. Required: there is no default remote provider. */
  client: LocalModelClient
  /** Hard ceiling on one request. Defaults to AI_INTERPRETATION_TIMEOUT_MS. */
  timeoutMs?: number
}

export function createLocalCommandInterpreter(options: LocalInterpreterOptions): CommandInterpreter {
  const client = options.client
  const configured = options.timeoutMs ?? AI_INTERPRETATION_TIMEOUT_MS
  const timeoutMs = Math.min(AI_MAX_TIMEOUT_MS, Math.max(AI_MIN_TIMEOUT_MS, configured))

  return {
    name: client.name,

    async interpret(input: string, context: InterpretationContext): Promise<InterpretOutcome> {
      const text = input.trim()
      if (!text) return { status: 'unsupported', reason: 'disabled', detail: 'empty input' }

      // One controller per attempt, cleared in `finally` so a settled request
      // never leaves a timer behind.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      let raw: string | null
      try {
        raw = await client.complete(buildInterpretationMessages(text, context), controller.signal)
      } catch {
        // The interface forbids throwing, but a third-party client could. Treat
        // it as unavailable rather than letting it reach the pipeline.
        raw = null
      } finally {
        clearTimeout(timer)
      }

      if (raw === null) {
        return {
          status: 'unsupported',
          reason: controller.signal.aborted ? 'timeout' : 'unavailable',
          detail: AI_UNAVAILABLE_MESSAGE,
        }
      }

      const json = extractJsonObject(raw)
      if (json === null) return { status: 'unsupported', reason: 'malformed', detail: 'no JSON object' }

      let parsed: unknown
      try {
        parsed = JSON.parse(json)
      } catch {
        return { status: 'unsupported', reason: 'malformed', detail: 'invalid JSON' }
      }

      const validated = validateProposal(parsed)
      if (!validated.ok) return { status: 'unsupported', reason: validated.reason, detail: validated.detail }

      const confident = checkConfidence(validated.proposal)
      if (!confident.ok) {
        return { status: 'unsupported', reason: 'invalid', detail: AI_LOW_CONFIDENCE_MESSAGE }
      }

      return { status: 'proposed', proposal: confident.proposal }
    },
  }
}

/**
 * A permanent, inert interpreter for "AI is switched off". Kept as a function
 * rather than a module constant so nothing can accidentally share and mutate it.
 */
export function createDisabledInterpreter(): CommandInterpreter {
  return {
    name: 'disabled',
    async interpret(): Promise<InterpretOutcome> {
      return { status: 'unsupported', reason: 'disabled' }
    },
  }
}

/** User-facing message for a failure reason. One honest sentence, no jargon. */
export function explainFailure(reason: InterpretFailureReason): string {
  switch (reason) {
    case 'timeout':
      return 'Local AI took too long to answer.'
    case 'malformed':
      return AI_UNSUPPORTED_MESSAGE
    case 'invalid':
      return AI_REJECTED_MESSAGE
    case 'unavailable':
      return AI_UNAVAILABLE_MESSAGE
    case 'disabled':
    default:
      return 'Local AI interpretation is off.'
  }
}