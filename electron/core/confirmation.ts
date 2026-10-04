// NOVA v0.3 (V03-S4) — confirmation gate for confirmation-required commands.
//
// The gate holds AT MOST ONE pending command. A confirmation is bound to that
// exact command by an opaque, single-use token, so approval can never be
// replayed onto a different action:
//
//   * `confirm(token)` / `cancel(token)` return the bound command and clear the
//     pending slot SYNCHRONOUSLY, before any awaiting. A second confirm of the
//     same token therefore finds nothing pending and executes nothing.
//   * A token that does not match the pending one is rejected and leaves the
//     pending command untouched.
//   * A pending command is superseded by the next command, or invalidated by
//     confirmation, cancellation, or timeout — all four paths clear the slot.
//   * The renderer never sends executable data; it can only echo a token it was
//     given, so this is not a bypass for validation. `command-pipeline.ts`
//     re-runs the same gate for typed and voice input, so there is exactly one
//     mechanism and no voice-only execution path.
//
// Platform-neutral. No Electron imports allowed here.

import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { ConfirmationRequest, RiskLevel, StructuredAction } from './types'

/** How long a pending confirmation stays answerable. Short and deterministic. */
export const CONFIRMATION_TIMEOUT_MS = 30_000

/** Wording used when a future HIGH-risk action needs a broader approval. */
export const HIGH_RISK_PROMPT = 'Allow NOVA to perform this action?'

/** Deterministic, fixed vocabulary. No fuzzy or partial phrase matching. */
export const CONFIRM_PHRASES: readonly string[] = ['yes', 'confirm', 'do it']
export const CANCEL_PHRASES: readonly string[] = ['no', 'cancel', 'stop']

export type ConfirmationPhrase = 'confirm' | 'cancel'

/** How a pending confirmation left the gate. */
export type ConfirmationOutcome = 'confirmed' | 'cancelled' | 'expired' | 'superseded'

/** Why a confirm/cancel attempt was refused. */
export type ConfirmationRejectReason = 'invalid-token' | 'no-pending' | 'mismatch'

export type ConfirmationResolution =
  | { status: 'resolved'; action: StructuredAction; request: ConfirmationRequest }
  | { status: 'rejected'; reason: ConfirmationRejectReason }

export interface ConfirmationGateDeps {
  /** Override the prompt lifetime (tests). Defaults to CONFIRMATION_TIMEOUT_MS. */
  timeoutMs?: number
  /** Override token creation (tests). Defaults to a random UUID. */
  createToken?: () => string
  /** Called once whenever a pending confirmation leaves the gate. */
  onSettled?: (outcome: ConfirmationOutcome, request: ConfirmationRequest) => void
}

export interface ConfirmationGate {
  /**
   * Hold `action` for confirmation and return the prompt. Any previously pending
   * command is superseded first, so only ever one token is ever answerable.
   */
  open(action: StructuredAction): ConfirmationRequest
  /** Current prompt, or null. Returns a copy so callers cannot mutate it. */
  pending(): ConfirmationRequest | null
  /** Approve. Returns the bound command, or rejects without executing. */
  confirm(token: unknown): ConfirmationResolution
  /** Reject. Returns the bound command, or rejects. Never executes. */
  cancel(token: unknown): ConfirmationResolution
  /**
   * Drop a pending confirmation without a token (new command superseded it, or
   * the surface that showed the prompt went away). Returns true if one dropped.
   */
  invalidate(outcome: 'cancelled' | 'superseded'): boolean
  /** Tear down without notifying (app shutdown). */
  dispose(): void
}

/** Only canonical UUID tokens are accepted; anything else never reaches a compare. */
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isConfirmationToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

function tokensMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'))
}

/**
 * Resolve one spoken/typed utterance to a confirmation phrase.
 * Returns null for anything not exactly on the fixed list, so ordinary
 * commands are never swallowed by the confirmation path.
 */
export function resolveConfirmationPhrase(input: string): ConfirmationPhrase | null {
  if (typeof input !== 'string') return null
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,]+$/, '')
    .trim()
  if (!normalized) return null
  if (CONFIRM_PHRASES.includes(normalized)) return 'confirm'
  if (CANCEL_PHRASES.includes(normalized)) return 'cancel'
  return null
}

/** Display-only extra context; never an actionable field. */
export function confirmationDetail(action: StructuredAction): string | undefined {
  switch (action.intent) {
    case 'OPEN_WEBSITE':
    case 'OPEN_FILE':
    case 'OPEN_FOLDER':
      return action.target || undefined
    default:
      // Applications are identified by name; the raw executable path is not
      // surfaced in the prompt.
      return undefined
  }
}

/** Wording reflects the actual pending action. */
export function buildConfirmationPrompt(action: StructuredAction, risk: RiskLevel): string {
  if (risk === 'HIGH') return HIGH_RISK_PROMPT
  const label = action.label.trim()
  return label ? `Open ${label}?` : HIGH_RISK_PROMPT
}

interface PendingConfirmation {
  token: string
  request: ConfirmationRequest
  action: StructuredAction
  timer: ReturnType<typeof setTimeout>
}

export function createConfirmationGate(deps: ConfirmationGateDeps = {}): ConfirmationGate {
  const timeoutMs = deps.timeoutMs ?? CONFIRMATION_TIMEOUT_MS
  const createToken = deps.createToken ?? (() => randomUUID())
  let pending: PendingConfirmation | null = null

  function clearPending(): PendingConfirmation | null {
    const current = pending
    pending = null
    if (current) clearTimeout(current.timer)
    return current
  }

  function settle(outcome: ConfirmationOutcome, current: PendingConfirmation): void {
    try {
      deps.onSettled?.(outcome, current.request)
    } catch {
      // A listener must never be able to break the gate.
    }
  }

  /** Shared confirm/cancel resolution: validate the token, then free the slot. */
  function resolve(rawToken: unknown, outcome: 'confirmed' | 'cancelled'): ConfirmationResolution {
    if (!isConfirmationToken(rawToken)) return { status: 'rejected', reason: 'invalid-token' }
    const current = pending
    if (!current) return { status: 'rejected', reason: 'no-pending' }
    if (!tokensMatch(current.token, rawToken)) return { status: 'rejected', reason: 'mismatch' }
    clearPending()
    settle(outcome, current)
    return { status: 'resolved', action: current.action, request: current.request }
  }

  return {
    open(action: StructuredAction): ConfirmationRequest {
      const previous = clearPending()
      if (previous) settle('superseded', previous)

      // Fail closed: an unclassified action is treated as the most conservative
      // level rather than being waved through.
      const risk: RiskLevel = action.risk ?? 'HIGH'
      const request: ConfirmationRequest = {
        token: createToken(),
        risk,
        intent: action.intent,
        prompt: buildConfirmationPrompt(action, risk),
        detail: confirmationDetail(action),
        expiresInMs: timeoutMs,
      }
      const timer = setTimeout(() => {
        if (!pending || pending.token !== request.token) return
        const expired = clearPending()
        if (expired) settle('expired', expired)
      }, timeoutMs)
      pending = { token: request.token, request, action, timer }
      return { ...request }
    },

    pending(): ConfirmationRequest | null {
      return pending ? { ...pending.request } : null
    },

    confirm(token: unknown): ConfirmationResolution {
      return resolve(token, 'confirmed')
    },

    cancel(token: unknown): ConfirmationResolution {
      return resolve(token, 'cancelled')
    },

    invalidate(outcome: 'cancelled' | 'superseded'): boolean {
      const current = clearPending()
      if (!current) return false
      settle(outcome, current)
      return true
    },

    dispose(): void {
      clearPending()
    },
  }
}