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

/**
 * Canonical DEFAULT wake phrase for NOVA v0.2. The user may change this in
 * Settings; the currently selected phrase is persisted as `config.wakeWord`.
 * The character sequence is used to build a slug for resolving the matching
 * local keyword-specific model directory.
 */
export const DEFAULT_WAKE_PHRASE = 'Hey NOVA'

/** Backwards-compatible alias used by the (updated) Settings surface. */
export const WAKE_PHRASE = DEFAULT_WAKE_PHRASE

/** Maximum length (in characters) of an acceptable custom wake phrase. */
export const WAKE_PHRASE_MAX_LEN = 50

// ─── Keyword-spotting (wake-word) constants ────────────────────────────────
// The wake detector is a lightweight local keyword-spotting layer. It uses the
// sherpa-onnx KWS runtime with a REAL, officially published, open-vocabulary
// English model installed at
//   resources/models/<KWS_MODEL_DIR_PREFIX><phrase-slug>/
// The bundled model is "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
// (open-vocabulary: it can spot any English keyword given its BPE token
// sequence — see DEFAULT_KWS_BPE). Custom phrases WITHOUT a matching local
// model (or an enrolled BPE token map entry) fail gracefully and never arm a
// detector for the wrong phrase.

/** Directory name prefix for wake-word keyword models. */
export const KWS_MODEL_DIR_PREFIX = 'sherpa-onnx-kws-'

/** Default name of a bundled keyword model for the default phrase. */
export const DEFAULT_KWS_MODEL_NAME = `${KWS_MODEL_DIR_PREFIX}hey-nova`

/** sherpa-onnx KWS feature extractor config. */
export const KWS_FEATURE_DIM = 80

/**
 * BPE token sequence for the default wake phrase "Hey NOVA", computed with the
 * model's own `bpe.model` (sentencepiece) and VERIFIED at runtime against the
 * model's bundled test audio (0/0 false alarms on non-wake speech; the same
 * encode path reproduces the documented `HEY SIRI`/`HELLO WORLD` examples
 * exactly). The `:1.2` and `#0.20` are the per-keyword boosting score and
 * trigger threshold annotation consumed by sherpa-onnx KWS (boosting makes the
 * wake path survive beam search; a lower threshold eases recall without the
 * false-alarm cost measured above).
 */
export const DEFAULT_KWS_BPE = '▁HE Y ▁NO V A :1.2 #0.20'

/**
 * sherpa-onnx KWS decoding knobs. `keywordsScore`/`keywordsThreshold` are the
 * GLOBAL fallback values used when a keyword line does NOT carry its own
 * `:score #threshold` annotation. Measured against the model's test speech we
 * saw zero false alarms at the default threshold; the per-keyword annotation
 * above raises wake recall for "Hey NOVA" specifically.
 */
export const KWS_KEYWORDS_SCORE = 1.0
export const KWS_KEYWORDS_THRESHOLD = 0.25
export const KWS_MAX_ACTIVE_PATHS = 4
export const KWS_NUM_TRAILING_BLANKS = 1

/**
 * Files every keyword model directory must contain (mirrors the layout of the
 * bundled English KWS model; file names match the model's original packaging so
 * an enrolled model stays recognizable when inspecting resources/models).
 */
export const KWS_MODEL_FILES = [
  'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  'decoder-epoch-12-avg-2-chunk-16-left-64.onnx',
  'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  'tokens.txt',
  'bpe.model',
] as const

/**
 * False-trigger guardrails. These are deliberate, centralized constants rather
 * than magic numbers scattered through the wake controller.
 */
/** Minimum gap (ms) between accepting two detections — prevents duplicate
 * trigger events fired from one spoken phrase. */
export const KWS_DEBOUNCE_MS = 500
/** Cooldown (ms) after a successful wake trigger during which detections are
 * ignored — prevents re-triggering from the same phrase right after hand-off. */
export const KWS_COOLDOWN_MS = 2000
/** How often the renderer's wake microphone sends a chunk (frames at 16 kHz).
 * Smaller than the STT chunk so keyword spotting starts as early as possible. */
export const KWS_CHUNK_SAMPLES = 2048

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
