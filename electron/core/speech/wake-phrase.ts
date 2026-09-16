// Wake-phrase normalization & validation. Platform-neutral, pure functions so
// both the config sanitizer and the wake-word lifecycle can share the same
// rules and stay unit-testable without any model or microphone.

import { WAKE_PHRASE_MAX_LEN } from './constants'

// Permitted characters in a wake phrase: letters, digits, spaces, and common
// punctuation (comma, apostrophe, hyphen, period, exclamation). Anything else
// is rejected so we never pass an unsafe/ambiguous string into model config.
const ALLOWED_CHARS = /^[A-Za-z0-9\s,.'!-]+$/

/**
 * Normalize a raw user-entered wake phrase for safe storage and model config:
 * trims leading/trailing whitespace, collapses runs of internal whitespace to
 * a single space, and enforces the max length. Returns `null` when the value
 * is empty/invalid.
 */
export function normalizeWakePhrase(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const collapsed = raw.trim().replace(/\s+/g, ' ')
  if (!collapsed) return null
  if (collapsed.length > WAKE_PHRASE_MAX_LEN) return null
  if (!ALLOWED_CHARS.test(collapsed)) return null
  return collapsed
}

/** True when the value is a usable (non-empty, valid) wake phrase. */
export function isValidWakePhrase(raw: string): boolean {
  return normalizeWakePhrase(raw) !== null
}

/**
 * Build a filesystem-safe slug for a normalized wake phrase so we can locate
 * the keyword-specific model directory that backs that exact phrase.
 *
 * `normalizeWakePhrase` must be applied before calling this.
 */
export function slugifyWakePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
