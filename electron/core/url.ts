// URL normalization for user-entered website shortcuts. Platform-neutral.

const HTTP_SCHEME = /^https?:\/\//i

// Scheme-like prefixes that must never be turned into a website shortcut.
const BLOCKED_SCHEMES =
  /^(javascript|data|file|mailto|ftp|tel|sms|vbscript|about|chrome|blob|ws|wss|git|market|webcal):/i

/**
 * Normalize a user-entered URL. Returns the normalized http(s) URL, or null
 * if the input is invalid (empty, has a non-http(s) scheme, or contains
 * whitespace). Never allows javascript:, file:, data:, mailto:, etc.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (HTTP_SCHEME.test(trimmed)) return trimmed
  if (trimmed.includes('://')) return null
  if (BLOCKED_SCHEMES.test(trimmed)) return null
  if (/\s/.test(trimmed)) return null
  return `https://${trimmed}`
}
