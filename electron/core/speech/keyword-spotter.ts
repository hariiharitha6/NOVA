// Keyword-spotting (wake word) abstraction. Platform-neutral and injected so the
// whole wake-word lifecycle is unit-testable without WASM, a keyword model, or
// a microphone.
//
// The rest of NOVA only ever talks to this interface; sherpa-onnx KWS specifics
// stay behind the concrete implementation.

/**
 * A lightweight local keyword spotter. It is deliberately NOT an STT recognizer
 * and it never produces command text — it only signals whether the configured
 * wake phrase was detected in the audio it was fed.
 */
export interface KeywordSpotter {
  /** Human-readable backend name (e.g. "sherpa-onnx-kws"). */
  readonly kind: string
  /**
   * Load the keyword model. Throws a descriptive Error when the keyword model
   * (specific to the configured phrase) is not available or cannot be used.
   * Called lazily, once per arm, only when wake mode is actually enabled.
   */
  initialize(): void
  /**
   * (Re)target the spotter at a specific normalized phrase. Only phrases that
   * have a backing local keyword model are genuinely supported. Must be called
   * before/around an init so the correct model is loaded.
   */
  setPhrase(phrase: string): void
  /** Begin a fresh keyword-matching window. */
  start(): void
  /** Feed a chunk of mono Float32 PCM at the configured sample rate. */
  acceptAudio(samples: Float32Array): void
  /**
   * True once the wake phrase has been detected within the current window.
   * Latch is cleared by `reset()`. Never returns command text.
   */
  isDetected(): boolean
  /** Clear any latched detection so the next window starts clean. */
  reset(): void
  /** Release all native resources. Idempotent; safe to call repeatedly. */
  dispose(): void
}

export interface KeywordSpotterOptions {
  /** Directory containing the keyword-specific model files. */
  modelDir: string
  /** Audio sample rate expected by the model. */
  sampleRate: number
}

export interface KeywordSpotterFactory {
  create(options: KeywordSpotterOptions): KeywordSpotter
}
