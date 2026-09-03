// NOVA v0.2 voice constants. Single home for timing values so the codebase
// never relies on scattered magic numbers.

export const TARGET_SAMPLE_RATE = 16000
/** Renderer mic chunk size in frames (~256 ms at 16 kHz). */
export const CHUNK_SAMPLES = 4096

/** Max duration of a single listening session (hard cap). */
export const MAX_LISTENING_MS = 15000
/** Idle-after-last-partial-change before a session is finalized. */
export const INACTIVITY_TIMEOUT_MS = 8000
/** How long a terminal state (success/error) stays visible before IDLE. */
export const RESULT_DISPLAY_MS = 2000

export const DEFAULT_SPEECH_LANGUAGE = 'en-US'

/** Model directory name inside resources/models. */
export const MODEL_NAME = 'sherpa-onnx-streaming-zipformer-en-2023-06-21'
export const MODEL_FILES = [
  'encoder-epoch-99-avg-1.int8.onnx',
  'decoder-epoch-99-avg-1.int8.onnx',
  'joiner-epoch-99-avg-1.int8.onnx',
  'tokens.txt',
] as const

/** Number of CPU threads for the sherpa-onnx recognizer (WASM is single-threaded). */
export const NUM_THREADS = 1
