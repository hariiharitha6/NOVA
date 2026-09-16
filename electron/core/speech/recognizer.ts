// Platform-neutral speech recognizer abstraction. The rest of NOVA only ever
// talks to this interface; sherpa-onnx specifics stay behind it.

/**
 * A streaming speech recognizer producing partial transcripts while audio is
 * fed in and one final transcript after finish().
 */
export interface SpeechRecognizer {
  /** Human-readable backend name (e.g. "sherpa-onnx"). */
  readonly kind: string
  /**
   * Load the model/engine. Throws a descriptive Error when the recognizer
   * cannot be used. Called once per app run (lazily, on first listen).
   */
  initialize(): void
  /** Begin a new utterance/session. */
  start(): void
  /** Feed a chunk of mono Float32 PCM at the configured sample rate. */
  acceptAudio(samples: Float32Array): void
  /** Current partial transcript for the active session. */
  partialTranscript(): string
  /** Mark input finished, decode the tail, and return the final transcript. */
  finishAndGetTranscript(): string
  /** Discard the active session without producing a final result. */
  cancel(): void
  /** Release all native resources. The recognizer cannot be reused after this. */
  dispose(): void
}

export interface SpeechRecognizerOptions {
  /** Directory containing the model files (encoder/decoder/joiner/tokens). */
  modelDir: string
  /** Audio sample rate expected by the model. */
  sampleRate: number
}

export interface SpeechRecognizerFactory {
  create(options: SpeechRecognizerOptions): SpeechRecognizer
}
