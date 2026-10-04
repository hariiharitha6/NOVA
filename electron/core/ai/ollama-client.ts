// NOVA v0.3 (V03-S5) — the local AI provider adapter (Ollama-compatible).
//
// THIS IS THE ONLY FILE IN THE AI LAYER THAT PERFORMS I/O, and it can perform
// exactly one kind of I/O: an HTTP POST to a loopback address on this machine.
//
// Privacy is enforced structurally, not by convention:
//
//   * `assertLoopbackUrl` refuses any host that is not a loopback literal, so a
//     misconfigured base URL cannot send a single character of user text to a
//     remote host. There is no code path that reaches a non-loopback address.
//   * No API key, no auth header, no telemetry, no analytics, no cookie.
//   * The request body is the user's text plus a NAME-ONLY registry listing and
//     the system prompt. NOVA never sends a file path, an app path, or a
//     registry URL off the machine.
//
// The `fetch` implementation is injectable so the entire suite runs with no
// Ollama installed, no service running, and no network. NOVA never downloads a
// model: if the model is not present locally the provider reports
// `unavailable` and the pipeline produces a clean clarification.

import {
  AI_MAX_MODEL_LENGTH,
  DEFAULT_LOCAL_AI_BASE_URL,
  DEFAULT_LOCAL_AI_MODEL,
  LOOPBACK_HOSTS,
} from './constants'
import type { InterpreterMessage } from './prompt'

/** Minimal `fetch` shape, so tests can inject a stub without a network. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export interface LocalModelClient {
  /** Stable identifier for logs and user-facing messages. */
  readonly name: string
  /**
   * Ask the local model to answer `messages`. Returns the raw text, or null when
   * the model could not be reached or did not have the model installed.
   * Implementations MUST respect `signal` and MUST NOT throw for ordinary
   * failures — the caller treats null as "unavailable".
   */
  complete(messages: InterpreterMessage[], signal: AbortSignal): Promise<string | null>
}

export interface OllamaClientOptions {
  baseUrl?: string
  model?: string
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: FetchLike
}

/**
 * Non-throwing form of {@link assertLoopbackUrl}, for the Settings UI (which
 * needs to explain a problem to the user rather than raise it) and for tests.
 * Same guarantee, same code path, no duplicated rules.
 */
export function isLoopbackHttpUrl(rawUrl: string): boolean {
  try {
    assertLoopbackUrl(rawUrl)
    return true
  } catch {
    return false
  }
}

/**
 * Parse and validate a configured base URL, requiring a loopback host.
 * Throws on anything else — a bad base URL is a configuration error the user
 * must see, never something to paper over with a fallback to a remote host.
 */
export function assertLoopbackUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Local AI base URL is not a valid URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Local AI base URL must use http or https.')
  }
  const host = url.hostname.toLowerCase()
  if (!LOOPBACK_HOSTS.includes(host)) {
    // The single most important guarantee in this file.
    throw new Error(
      `Local AI base URL must point at this machine (${LOOPBACK_HOSTS.join(', ')}). ` +
        'NOVA never sends command text to a remote host.',
    )
  }
  return url
}

/** Validate a model name. Kept deliberately narrow: no slashes, no flags. */
export function assertModelName(rawModel: string): string {
  const model = rawModel.trim()
  if (!model) throw new Error('Local AI model name must not be empty.')
  if (model.length > AI_MAX_MODEL_LENGTH) {
    throw new Error(`Local AI model name must be at most ${AI_MAX_MODEL_LENGTH} characters.`)
  }
  if (!/^[A-Za-z0-9._:@-]+$/.test(model)) {
    throw new Error('Local AI model name may contain only letters, digits, dot, dash, underscore, colon and @.')
  }
  return model
}

/**
 * Create the local provider.
 *
 * Uses Ollama's `/api/chat` endpoint with `stream: false`, which returns one JSON
 * object. Ollama is the reference local runtime; any service exposing the same
 * endpoint shape works, and the pipeline never learns which.
 */
export function createOllamaClient(options: OllamaClientOptions = {}): LocalModelClient {
  const base = assertLoopbackUrl(options.baseUrl?.trim() || DEFAULT_LOCAL_AI_BASE_URL)
  const model = assertModelName(options.model?.trim() || DEFAULT_LOCAL_AI_MODEL)
  const fetchImpl: FetchLike =
    options.fetchImpl ??
    ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init))

  const endpoint = new URL('/api/chat', base).toString()

  return {
    name: `local-ollama(${model})`,
    async complete(messages, signal): Promise<string | null> {
      if (signal.aborted) return null
      let response: { ok: boolean; status: number; text(): Promise<string> }
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            // Deterministic decoding keeps interpretation reproducible.
            options: { temperature: 0, num_predict: 160 },
          }),
          signal,
        })
      } catch {
        // Connection refused, DNS failure, abort, or any transport error. The
        // local runtime is simply not available.
        return null
      }

      if (!response.ok) return null
      let raw: string
      try {
        raw = await response.text()
      } catch {
        return null
      }
      return extractMessageContent(raw)
    },
  }
}

/**
 * Pull the assistant text out of an Ollama-shaped response. Returns null for any
 * other shape rather than guessing — a response NOVA does not understand is
 * treated as no response.
 */
export function extractMessageContent(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const message = (parsed as { message?: unknown }).message
  if (typeof message !== 'object' || message === null) return null
  const content = (message as { content?: unknown }).content
  return typeof content === 'string' && content.trim() ? content : null
}