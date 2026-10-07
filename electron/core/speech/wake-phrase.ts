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

const WAKE_LEAD_INTERJECTIONS = new Set(['hey', 'hi', 'hello', 'okay', 'ok', 'alright'])

function wakeTokens(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9']/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Strip a leading WAKE PHRASE from a transcript so the wake hand-off is clean:
 * the STT session starts the moment the keyword is spotted, so the first
 * partial often bleeds the wake phrase into the command ("Hey NOVA open
 * chrome"). This is a transcription-cleanup helper, NOT a command parser — the
 * remainder still flows through the exact same shared command engine as any
 * typed or PTT command.
 *
 * Rules:
 *  - The full phrase is always stripped when it leads the transcript.
 *  - When the phrase starts with a common interjection ("Hey NOVA"), the
 *    interjection may be missing from the audio ("NOVA open chrome") and the
 *    phrase's remaining words are stripped instead.
 *  - Anything else is left untouched, so ordinary first words (an app or site
 *    literally named "Nova", "Hello", ...) are never eaten.
 *
 * A bare wake phrase ("Hey NOVA") leaves an empty remainder; the caller treats
 * that as "the user said nothing" and executes no command.
 */
export function stripWakePhraseFromTranscript(
  transcript: string,
  wakePhrase: string = 'Hey NOVA',
): string {
  const text = transcript.trim()
  if (!text) return text
  const normalized = normalizeWakePhrase(wakePhrase)
  if (!normalized) return text

  const words = wakeTokens(text)
  const wake = wakeTokens(normalized)
  if (wake.length === 0) return text

  let stripLen = 0
  if (words.slice(0, wake.length).join(' ') === wake.join(' ')) {
    stripLen = wake.length
  } else if (
    wake.length > 1 &&
    WAKE_LEAD_INTERJECTIONS.has(wake[0]) &&
    words.slice(0, wake.length - 1).join(' ') === wake.slice(1).join(' ')
  ) {
    stripLen = wake.length - 1
  }
  if (stripLen === 0) return text
  return words.slice(stripLen).join(' ')
}
