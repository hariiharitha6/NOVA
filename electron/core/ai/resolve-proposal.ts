// NOVA v0.3 (V03-S5) — deterministic resolution of a validated AI proposal.
//
// This is where the AI's suggestion stops being a suggestion. A `CommandProposal`
// carries only an intent and a NAME; this module turns that name into a real
// `StructuredAction` using NOVA's own registry, and refuses anything that does
// not resolve.
//
// The rules, all of which are deterministic and none of which consult a model:
//
//   * An app / file / folder / site NAME must resolve through the validated
//     registry. An unresolvable name is a failure, never a guess.
//   * The resolved intent MUST equal the proposed intent. A model that says
//     OPEN_APPLICATION for something the registry knows as a website is wrong,
//     and is refused rather than coerced.
//   * A model NEVER supplies a path or a URL. Every executable path and every
//     origin in the result comes from the registry or from the two fixed search
//     origins — verbatim, never from model text.
//   * The only model text that survives into an action is a SEARCH query, and it
//     arrives `encodeURIComponent`-escaped inside a fixed origin.
//   * The result carries NO risk level. `risk-policy.ts` stamps that downstream,
//     after this function returns.

import { buildSearchAction, resolveTarget } from '../command-engine'
import type { CommandSource } from '../command-engine'
import type { StructuredAction } from '../types'
import type { CommandProposal, InterpretFailureReason } from './types'

export type ProposalResolution =
  | { ok: true; action: StructuredAction }
  | { ok: false; reason: InterpretFailureReason; detail: string }

function reject(detail: string): ProposalResolution {
  return { ok: false, reason: 'invalid', detail }
}

/** A bare http(s) URL, reduced to its host for display. */
function describeUrl(url: string): string | null {
  const match = url.match(/^(https?):\/\/([^/?#]+)/i)
  return match ? `${match[1].toLowerCase()}://${match[2]}` : null
}

/**
 * Resolve a validated proposal against the validated registry.
 *
 * Returns a StructuredAction with no `risk` field set — classification is not
 * this module's job and it has no authority to assign one.
 */
export function resolveProposal(
  proposal: CommandProposal,
  registry: CommandSource,
): ProposalResolution {
  const { intent, target } = proposal

  // ── Search: the query is data and is escaped into a fixed origin ──────────
  if (intent === 'SEARCH_WEB' || intent === 'SEARCH_YOUTUBE') {
    const action = buildSearchAction(intent, target)
    if (!action) return reject('empty search query')
    return { ok: true, action }
  }

  // ── Applications ────────────────────────────────────────────────────────
  if (intent === 'OPEN_APPLICATION' || intent === 'FOCUS_APPLICATION') {
    const resolved = resolveTarget(target, registry)
    if (!resolved) return reject(`"${target}" is not something NOVA knows`)
    if (resolved.intent !== 'OPEN_APPLICATION' && resolved.intent !== 'FOCUS_APPLICATION') {
      // e.g. the model asked to launch something the registry knows as a website.
      return reject(`"${target}" resolves to ${resolved.intent}, not ${intent}`)
    }
    // Re-derive the action with the EXACT intent the model proposed. The target
    // is the registry's verbatim path, never the model's text.
    return {
      ok: true,
      action: { intent, target: resolved.target, label: resolved.label },
    }
  }

  // ── Websites ─────────────────────────────────────────────────────────────
  if (intent === 'OPEN_WEBSITE') {
    // A site NAME resolves through the registry and inherits the registry URL.
    const resolved = resolveTarget(target, registry)
    if (resolved && resolved.intent === 'OPEN_WEBSITE') {
      return { ok: true, action: { intent, target: resolved.target, label: resolved.label } }
    }

    // A bare http(s) URL is allowed but is NOT trusted: `risk-policy.ts` classifies
    // an unvalidated origin as MEDIUM, so the confirmation gate holds it. This is
    // the only way model text can influence a URL, and it is why the origin is
    // shown to the user before anything opens.
    const described = describeUrl(target)
    if (described) {
      return { ok: true, action: { intent, target, label: described } }
    }

    return reject(`"${target}" is not a site NOVA knows and is not an http(s) address`)
  }

  // ── Files and folders ────────────────────────────────────────────────────
  // Only the registry may supply a path. The validator has already refused any
  // target containing a backslash or drive letter, so reaching here means the
  // model named a registered file/folder.
  if (intent === 'OPEN_FILE' || intent === 'OPEN_FOLDER') {
    const entry = registry.fileFolders.find(
      (f) =>
        f.name.trim().toLowerCase() === target.trim().toLowerCase() ||
        f.path.trim().toLowerCase() === target.trim().toLowerCase(),
    )
    if (!entry) return reject(`"${target}" is not a file or folder NOVA knows`)
    const expected = entry.kind === 'folder' ? 'OPEN_FOLDER' : 'OPEN_FILE'
    if (expected !== intent) return reject(`"${target}" is a ${entry.kind}, not ${intent}`)
    return { ok: true, action: { intent, target: entry.path, label: entry.name } }
  }

  // The allowlist makes this unreachable; the refusal is here so that widening
  // the allowlist later cannot silently fall through into an action.
  return reject(`intent ${intent} cannot be proposed`)
}