// NOVA v0.3 (V03-S5) — local AI interpretation constants.
//
// Single home for every tunable value in the AI layer, following the same
// convention as `electron/core/speech/constants.ts`: no scattered magic numbers.
//
// NOTHING here downloads a model. NOVA never fetches weights, never installs a
// runtime, and never requires a model to start. The user supplies the local
// runtime (e.g. Ollama) and the model name; NOVA only talks to it over loopback.

/** Default local provider base URL. Loopback only — see `isLoopbackUrl`. */
export const DEFAULT_LOCAL_AI_BASE_URL = 'http://127.0.0.1:11434'

/** Default local model name. Not downloaded, bundled, or verified by NOVA. */
export const DEFAULT_LOCAL_AI_MODEL = 'llama3.2'

/**
 * Hard ceiling on one interpretation request. Local interpretation must never
 * block NOVA: a wedged model service must fail into a clean clarification, not
 * into a hanging overlay.
 */
export const AI_INTERPRETATION_TIMEOUT_MS = 8000

/** Bounds accepted for a user-configured timeout. */
export const AI_MIN_TIMEOUT_MS = 1000
export const AI_MAX_TIMEOUT_MS = 30000

/**
 * Minimum self-reported confidence for a proposal to be considered at all.
 * Below this the pipeline returns a clarification instead of acting.
 *
 * Confidence is INTERPRETATION METADATA ONLY. It is not risk: a proposal with
 * confidence 0.99 is classified by `risk-policy.ts` exactly like a deterministic
 * command, and a confirmation-required action is still gated.
 */
export const AI_MIN_CONFIDENCE = 0.6

/** Maximum accepted length for a model-supplied target or query. */
export const AI_MAX_TARGET_LENGTH = 200

/** Shown when the model replied with text that is not a readable command. */
export const AI_UNSUPPORTED_MESSAGE =
  'I could not interpret that locally. Try a simpler command.'

/** Shown when the local runtime or model is not usable. */
export const AI_UNAVAILABLE_MESSAGE = 'Local AI model unavailable.'

/** Shown when the model replied, but not with something NOVA may act on. */
export const AI_REJECTED_MESSAGE = 'I could not turn that into a NOVA command.'

/** Shown when the model was not confident enough to act on. */
export const AI_LOW_CONFIDENCE_MESSAGE = 'I was not sure what you meant.'

/** Second line under every AI failure message. */
export const AI_FALLBACK_HINT =
  'Try "Open <app>", "Focus <app>", or "Search for <query>".'

/**
 * The ONLY hosts a local AI provider may be reached at. Anything else is
 * refused before a request is built, which is what makes "no command text
 * leaves this machine" a structural property rather than a promise.
 */
export const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '::1', '[::1]', '0:0:0:0:0:0:0:1']

/** Max characters accepted in a configured model name. */
export const AI_MAX_MODEL_LENGTH = 64