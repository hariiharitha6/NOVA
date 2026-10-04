// NOVA v0.3 (V03-S5) — strict, deterministic validation of an AI proposal.
//
// This is the trust boundary. Everything above it is a language model that may be
// wrong, prompt-injected, or hostile. Everything below it is NOVA's own code.
//
// The rules here are intentionally unforgiving and deliberately fail CLOSED:
// anything not explicitly understood is rejected, and a rejection is always a
// clarification — never an execution and never a partial interpretation.
//
// Note on what is NOT validated: no risk level. `risk` is not an accepted key,
// so a model cannot supply one, cannot lower one, and cannot raise one. Risk is
// computed by `risk-policy.ts` from the StructuredAction this module's output
// becomes — strictly downstream of everything here.

import { AI_MAX_TARGET_LENGTH, AI_MIN_CONFIDENCE } from './constants'
import { AI_ALLOWED_INTENTS } from './types'
import type { CommandProposal, InterpretFailureReason, Intent } from './types'

/** The only JSON keys a proposal may contain. Anything else is rejected. */
const ALLOWED_KEYS: readonly string[] = ['intent', 'target', 'arguments', 'confidence']

/** The only key permitted inside `arguments`. */
const ALLOWED_ARGUMENT_KEYS: readonly string[] = ['query']

/**
 * Intents whose `target` names something on this machine. For these, the target
 * must be a NAME — never a path, a URL it was not given, or shell text.
 */
const MACHINE_TARGET_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  'OPEN_APPLICATION',
  'FOCUS_APPLICATION',
  'OPEN_WEBSITE',
  'OPEN_FILE',
  'OPEN_FOLDER',
])

/**
 * Intents whose target becomes a URL query parameter. A target here is provably
 * data-only: `command-engine.ts` puts it through `encodeURIComponent` into a
 * fixed origin, so it can never be parsed as a command. Blocking shell-looking
 * words in a SEARCH query would only break legitimate searches like
 * "how to use powershell", so it is deliberately not blocked here.
 */
const QUERY_INTENTS: ReadonlySet<Intent> = new Set<Intent>(['SEARCH_WEB', 'SEARCH_YOUTUBE'])

/**
 * Tokens that indicate an attempt to smuggle execution through a target. Matched
 * as whole words against a normalized (lowercased, punctuation-collapsed) copy,
 * so "cmd" is caught but "acmdf" is not.
 */
const FORBIDDEN_TARGET_TOKENS: readonly string[] = [
  'cmd',
  'command',
  'powershell',
  'pwsh',
  'batch',
  'bash',
  'sh',
  'zsh',
  'wscript',
  'cscript',
  'mshta',
  'regsvr32',
  'rundll32',
  'schtasks',
  'certutil',
  'bitsadmin',
  'spawn',
  'exec',
  'execsync',
  'evaluate',
  'shell',
  'system',
  'subprocess',
  'child_process',
  'childprocess',
  'invoke',
  'iex',
  'start-process',
  'process',
  'script',
  'delete',
  'remove',
  'rmdir',
  'format',
]

/** Executable/script extensions that must never appear in a machine target. */
const FORBIDDEN_EXTENSIONS: readonly string[] = [
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.ps1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.msi',
  '.msc',
  '.hta',
  '.lnk',
  '.dll',
  '.reg',
  '.cpl',
  '.sys',
  '.inf',
]

/**
 * Shell metacharacters. None of these may appear in a machine target.
 * `?`, `#`, `!`, `~` and `*` are deliberately absent: they are legal URL
 * characters and OPEN_WEBSITE targets may be URLs. They are still refused for
 * the non-website machine intents via `FORBIDDEN_CHARACTERS_NAME`.
 */
const FORBIDDEN_CHARACTERS: readonly string[] = ['|', '&', ';', '>', '<', '`', '$', '%', '\n', '\r', '\0', '"', "'"]

/**
 * Additional characters refused for NAME targets (applications, files, folders).
 * A name is not a URL, so there is no reason to tolerate query/fragment/glob
 * syntax in one.
 */
const FORBIDDEN_CHARACTERS_NAME: readonly string[] = ['?', '#', '!', '~', '*', '+', '@', '[', ']', '(', ')', '{', '}']

export type ProposalValidation =
  | { ok: true; proposal: CommandProposal }
  | { ok: false; reason: InterpretFailureReason; detail: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Lowercase and collapse punctuation so token matching cannot be evaded with spacing. */
function normalizeForScan(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hasForbiddenToken(value: string): string | null {
  const normalized = normalizeForScan(value)
  const tokens = normalized.split(' ')
  for (const forbidden of FORBIDDEN_TARGET_TOKENS) {
    const wanted = normalizeForScan(forbidden)
    if (tokens.includes(wanted)) return forbidden
  }
  return null
}

function hasForbiddenCharacter(value: string): string | null {
  for (const ch of FORBIDDEN_CHARACTERS) {
    if (value.includes(ch)) return ch
  }
  return null
}

/**
 * Extract the http(s) URL from a machine target, or return why it is not one.
 * A bare site name ("youtube") is not a URL at all and is resolved from the
 * registry; only an explicit http(s) URL may pass through, and even then it is
 * untrusted → MEDIUM → confirmation.
 */
function urlProblem(target: string): string | null {
  const schemeMatch = target.match(/^([A-Za-z][A-Za-z0-9+.-]*):/)
  if (!schemeMatch) return null // no scheme: treated as a registry name
  if (schemeMatch[1].toLowerCase() !== 'http' && schemeMatch[1].toLowerCase() !== 'https') {
    return `protocol "${schemeMatch[1]}:" is not supported`
  }
  if (!/^https?:\/\/[^\s/?#]+/i.test(target)) return 'malformed URL'
  return null
}

function reject(detail: string): ProposalValidation {
  return { ok: false, reason: 'invalid', detail }
}

/**
 * Validate an arbitrary parsed JSON value as an AI proposal.
 *
 * Accepts only: a plain object, an allowlisted intent, a bounded non-empty
 * string target, an optional `query` argument, and an optional confidence in
 * [0,1]. Everything else is a rejection.
 */
export function validateProposal(raw: unknown): ProposalValidation {
  if (!isRecord(raw)) return reject('proposal is not a JSON object')

  // Unsupported fields are REJECTED, not ignored. A model that volunteers
  // `risk`, `url`, `executablePath` or `shellCommand` is telling us it is
  // trying to steer execution, and that request is refused outright.
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.includes(key)) return reject(`unsupported field "${key}"`)
  }

  const intent = raw['intent']
  if (typeof intent !== 'string') return reject('intent must be a string')
  if (!AI_ALLOWED_INTENTS.includes(intent as Intent)) return reject(`intent "${intent}" is not allowed`)

  const rawTarget = raw['target']
  if (typeof rawTarget !== 'string') return reject('target must be a string')
  const target = rawTarget.trim()
  if (!target) return reject('target is empty')
  if (target.length > AI_MAX_TARGET_LENGTH) return reject(`target exceeds ${AI_MAX_TARGET_LENGTH} characters`)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(target)) return reject('target contains control characters')

  // `arguments` — optional, and only `query` is understood.
  let query: string | undefined
  if (raw['arguments'] !== undefined) {
    const args = raw['arguments']
    if (!isRecord(args)) return reject('arguments must be an object')
    for (const key of Object.keys(args)) {
      if (!ALLOWED_ARGUMENT_KEYS.includes(key)) return reject(`unsupported argument "${key}"`)
    }
    if (args['query'] !== undefined) {
      if (typeof args['query'] !== 'string') return reject('arguments.query must be a string')
      const q = args['query'].trim()
      if (q.length > AI_MAX_TARGET_LENGTH) return reject('arguments.query is too long')
      query = q || undefined
    }
  }

  // `confidence` — optional. Present means it must be a real number in [0,1].
  let confidence: number | undefined
  if (raw['confidence'] !== undefined) {
    const value = raw['confidence']
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return reject('confidence must be a finite number')
    }
    if (value < 0 || value > 1) return reject('confidence must be between 0 and 1')
    confidence = value
  }

  // Cross-field consistency.
  if (QUERY_INTENTS.has(intent as Intent)) {
    const effective = query ?? target
    if (!effective) return reject(`${intent} requires a search query`)
    if (effective.length > AI_MAX_TARGET_LENGTH) return reject('search query is too long')
    return { ok: true, proposal: { intent: intent as Intent, target: effective, confidence } }
  }

  if (MACHINE_TARGET_INTENTS.has(intent as Intent)) {
    // A machine target is a NAME. Paths, schemes it was not given, and shell
    // text are all refused here, before the registry is even consulted.
    const isWebsite = intent === 'OPEN_WEBSITE'
    const badChar = hasForbiddenCharacter(target)
    if (badChar) return reject(`target contains a forbidden character (${JSON.stringify(badChar)})`)
    if (!isWebsite) {
      const badNameChar = FORBIDDEN_CHARACTERS_NAME.find((ch) => target.includes(ch))
      if (badNameChar) return reject(`target contains a forbidden character (${JSON.stringify(badNameChar)})`)
    }
    if (target.includes('\\')) return reject('target must be a name, not a Windows path')
    if (target.includes('..')) return reject('target must not contain path traversal')
    if (/^[A-Za-z]:/.test(target)) return reject('target must not be a drive-qualified path')
    const lower = target.toLowerCase()
    for (const ext of FORBIDDEN_EXTENSIONS) {
      if (lower.endsWith(ext) || lower.includes(`${ext} `)) return reject(`target must not reference ${ext}`)
    }
    const badToken = hasForbiddenToken(target)
    if (badToken) return reject(`target contains a forbidden term ("${badToken}")`)

    if (isWebsite) {
      const problem = urlProblem(target)
      if (problem) return reject(problem)
    } else if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) {
      // Only OPEN_WEBSITE may carry a scheme at all.
      return reject('only OPEN_WEBSITE may contain a URL')
    }
  }

  return { ok: true, proposal: { intent: intent as Intent, target, arguments: query ? { query } : undefined, confidence } }
}

/**
 * Confidence gate. Separated from schema validation because "structurally valid
 * but not sure" and "structurally invalid" are different user-facing outcomes.
 *
 * ABSENCE of confidence is allowed. That is not a safety hole: the proposal
 * still passes the strict schema, the intent allowlist, registry resolution, the
 * deterministic risk policy, and the confirmation gate. Safety comes from those,
 * not from a number the model wrote about itself. A number that IS present and is
 * below the threshold is honoured and refused.
 */
export function checkConfidence(proposal: CommandProposal): ProposalValidation {
  const confidence = proposal.confidence
  if (confidence === undefined) return { ok: true, proposal }
  // Re-validated here as well as in `validateProposal`, so this gate is safe on
  // its own: a proposal built in code (rather than parsed from JSON) cannot
  // smuggle in a nonsense or non-finite confidence.
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return reject('confidence must be a finite number')
  }
  if (confidence < 0 || confidence > 1) return reject('confidence must be between 0 and 1')
  if (confidence < AI_MIN_CONFIDENCE) {
    return { ok: false, reason: 'invalid', detail: 'confidence below threshold' }
  }
  return { ok: true, proposal }
}

export { ALLOWED_KEYS, MACHINE_TARGET_INTENTS, QUERY_INTENTS }