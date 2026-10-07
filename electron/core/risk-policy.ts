// NOVA v0.3 (V03-S4) — deterministic risk policy.
//
// THIS MODULE IS THE SINGLE SOURCE OF TRUTH for `StructuredAction.risk`.
//
// The command parser (command-engine.ts) deliberately does NOT assign a risk
// level. Recognition and risk are separate concerns: a future natural-language
// or AI interpreter must never be able to declare its own proposal "safe".
// `command-pipeline.ts` stamps the level from this policy immediately before the
// confirmation gate, so no action can reach the executor unclassified.
//
// Policy (conservative by construction):
//
//   LOW    — no meaningful system-side or external effect.
//            SHOW_FAVORITES / SHOW_RECENTS (reads existing config only),
//            OPEN_SETTINGS (reuses the existing settings window),
//            SEARCH_WEB / SEARCH_YOUTUBE (fixed trusted origins, read-only),
//            FOCUS_APPLICATION (activates an ALREADY RUNNING window; starts
//            nothing), CLARIFICATION / UNKNOWN (no side effect at all), and
//            registry-validated websites / files / folders (the user already
//            approved them in Settings).
//
//   MEDIUM — a real system-side or external effect:
//            OPEN_APPLICATION (starts a process on the machine),
//            OPEN_SYSTEM_SETTINGS (starts the Windows Settings app),
//            any website/file/folder whose target is NOT registry-validated
//            (an origin or path NOVA never vetted, e.g. a URL pasted in by hand
//            or proposed by a future interpreter).
//
//   HIGH   — reserved for destructive / irreversible / outward-facing actions.
//            NO currently supported NOVA intent qualifies, so the policy
//            assigns HIGH to nothing today. It is defined now so the level set
//            does not have to change — and so the confirmation gate treats it as
//            requiring confirmation — when such an action arrives in a later
//            slice. Inventing a dangerous command here just to exercise HIGH
//            would be dishonest, so the policy does not.
//
// Fail-closed default: any intent this policy does not explicitly know is
// classified MEDIUM, so adding an intent later can never silently widen what
// NOVA is allowed to run without a confirmation.

import type { Intent, RegistrySnapshot, RiskLevel, StructuredAction } from './types'

/** Intents that are always LOW: no meaningful system-side or external effect. */
const ALWAYS_LOW: ReadonlySet<Intent> = new Set<Intent>([
  'CLARIFICATION',
  'UNKNOWN',
  'SHOW_FAVORITES',
  'SHOW_RECENTS',
  'OPEN_SETTINGS',
  'SEARCH_WEB',
  'SEARCH_YOUTUBE',
  'FOCUS_APPLICATION',
])

/** Intents that are always MEDIUM: they start a process on the machine. */
const ALWAYS_MEDIUM: ReadonlySet<Intent> = new Set<Intent>([
  'OPEN_APPLICATION',
  // Windows Settings is an OS application, so opening it starts a process —
  // exactly like OPEN_APPLICATION, and therefore confirmation-gated. Listed
  // explicitly (rather than relying on the fail-closed default below) so the
  // level is deliberate, not accidental.
  'OPEN_SYSTEM_SETTINGS',
])

/**
 * Intents that are LOW only while the target is registry-validated (the user
 * already approved that exact website / file / folder in Settings) and MEDIUM
 * otherwise.
 */
const VALIDATED_TARGET: ReadonlySet<Intent> = new Set<Intent>([
  'OPEN_WEBSITE',
  'OPEN_FILE',
  'OPEN_FOLDER',
])

/** Conservative classification for any intent not listed above. */
const UNKNOWN_INTENT_RISK: RiskLevel = 'MEDIUM'

/**
 * Risk levels that must stop at the confirmation gate before execution.
 * LOW is the only level that executes immediately.
 */
export function requiresConfirmation(risk: RiskLevel): boolean {
  return risk !== 'LOW'
}

/**
 * The set of targets NOVA is allowed to treat as pre-approved: exactly the
 * registry entries (app executables, website URLs, file/folder paths) that
 * came from the validated snapshot. Empty strings are dropped so a malformed
 * entry can never make an empty target "trusted".
 */
export function trustedTargets(snapshot?: RegistrySnapshot | null): ReadonlySet<string> {
  const trusted = new Set<string>()
  if (!snapshot) return trusted
  for (const app of snapshot.apps) {
    if (app.path) trusted.add(app.path)
  }
  for (const website of snapshot.websites) {
    if (website.url) trusted.add(website.url)
  }
  for (const entry of snapshot.fileFolders) {
    if (entry.path) trusted.add(entry.path)
  }
  return trusted
}

/**
 * Deterministic risk classification for one validated StructuredAction.
 * `trusted` is the registry-derived target set; omitting it is the most
 * conservative choice (target-bearing intents then classify as MEDIUM).
 */
export function classifyRisk(
  action: StructuredAction,
  trusted?: ReadonlySet<string>,
): RiskLevel {
  if (ALWAYS_LOW.has(action.intent)) return 'LOW'
  if (ALWAYS_MEDIUM.has(action.intent)) return 'MEDIUM'
  if (VALIDATED_TARGET.has(action.intent)) {
    // Exact match only: targets always originate from the registry verbatim, so
    // no case-folding or path rewriting is needed (and none is safe to guess).
    return trusted?.has(action.target) ? 'LOW' : 'MEDIUM'
  }
  return UNKNOWN_INTENT_RISK
}

/**
 * Returns a copy of the action carrying the authoritative risk level. The
 * original action object is never mutated, so a caller cannot observe a stale
 * or caller-supplied level.
 */
export function withClassifiedRisk(
  action: StructuredAction,
  trusted?: ReadonlySet<string>,
): StructuredAction {
  return { ...action, risk: classifyRisk(action, trusted) }
}