// sherpa-onnx keyword spotter (Node.js WASM build) for wake-word detection.
//
// Uses ONLY the API surface verified in node_modules/sherpa-onnx@1.13.5:
//   sherpa.createKws(config) -> Kws
//   kws.createStream()                       -> Stream
//   stream.acceptWaveform(sampleRate, Float32Array)
//   stream.inputFinished() / stream.free()
//   kws.isReady(stream) / kws.decode(stream)
//   kws.getResult(stream) -> { keyword, ... }  // keyword match info, not text
//   kws.reset(stream) / kws.free()
//
// RUNTIME: the baked-in model is the official open-vocabulary English KWS model
// `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` (Apache-2.0). It can
// spot any English keyword given its BPE token sequence (derived from the
// model's bundled `bpe.model`). The default phrase "Hey NOVA" is enrolled with
// the verified sequence `▁HE Y ▁NO V A :1.2 #0.20`. NOTE: the `:1.2`/`#0.20`
// tuning fields are space-separated suffixes; attaching them to a token (e.g.
// `A:1.2`) makes the runtime treat them as one unknown token and it aborts.
//
// A phrase is GENUINELY supported only when BOTH hold: (1) a compatible keyword
// model directory exists at the spotter's modelDir, AND (2) an enrolled BPE
// token sequence exists for that phrase. Otherwise `initialize()` throws a
// descriptive "model not installed" error and the controller surfaces the wake
// detector as unavailable — it never arms against the wrong phrase and never
// fakes detection.
//
// The spotter never executes a command and never emits free-form text — the
// caller only sees a boolean detection latch.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { KeywordSpotter, KeywordSpotterOptions } from './keyword-spotter'
import {
  DEFAULT_KWS_BPE,
  KWS_FEATURE_DIM,
  KWS_KEYWORDS_SCORE,
  KWS_KEYWORDS_THRESHOLD,
  KWS_MAX_ACTIVE_PATHS,
  KWS_MODEL_FILES,
  KWS_NUM_TRAILING_BLANKS,
  NUM_THREADS,
} from './constants'
import { normalizeWakePhrase } from './wake-phrase'

interface SherpaOnnxModule {
  createKws(config: Record<string, unknown>): SherpaKws
}

interface SherpaKws {
  createStream(): SherpaStream
  isReady(stream: SherpaStream): boolean
  decode(stream: SherpaStream): void
  getResult(stream: SherpaStream): { keyword: string }
  reset(stream: SherpaStream): void
  free(): void
}

interface SherpaStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void
  inputFinished(): void
  free(): void
}

/**
 * Enrolled phrase → BPE keyword-line map. Only phrases present here (with a
 * matching local model directory) are genuinely detectable at runtime. Adding a
 * new phrase = adding its BPE token sequence (computed with the model's
 * `bpe.model` via sherpa-onnx `text2token`) + installing the model directory.
 */
export const ENROLLED_KWS_PHRASES: Readonly<Record<string, string>> = {
  'hey nova': DEFAULT_KWS_BPE,
}

/** Resolve the sherpa keyword line (BPE token sequence + tuning) for a phrase. */
export function kwsKeywordLineForPhrase(phrase: string): string | null {
  const normalized = normalizeWakePhrase(phrase)
  if (!normalized) return null
  const key = normalized.toLowerCase()
  return ENROLLED_KWS_PHRASES[key] ?? null
}

/** Whether a phrase has an enrolled BPE keyword line (is genuinely detectable). */
export function isEnrolledWakePhrase(phrase: string): boolean {
  return kwsKeywordLineForPhrase(phrase) !== null
}

export class SherpaKeywordSpotter implements KeywordSpotter {
  readonly kind = 'sherpa-onnx-kws'

  private readonly modelDir: string
  private readonly sampleRate: number
  private phrase = ''
  private sherpa: SherpaOnnxModule | null = null
  private kws: SherpaKws | null = null
  private stream: SherpaStream | null = null
  private detected = false
  private initializedPhrase = ''

  constructor(options: KeywordSpotterOptions) {
    this.modelDir = options.modelDir
    this.sampleRate = options.sampleRate
  }

  setPhrase(phrase: string): void {
    // If we're already initialized against a different phrase we cannot swap
    // models without a full re-init; the controller tears down and re-arms
    // around phrase changes. Store the target for the next initialize().
    this.phrase = phrase
    if (this.initializedPhrase !== '' && this.initializedPhrase !== phrase) {
      this.dispose()
    }
    this.detected = false
  }

  initialize(): void {
    if (this.sherpa) return
    const missing = KWS_MODEL_FILES.find((file) => !existsSync(join(this.modelDir, file)))
    if (missing) {
      throw new Error(
        `Wake-word model not installed for phrase "${this.phrase}". ` +
          `Install a compatible keyword model with "${missing}" in: ${this.modelDir}`,
      )
    }
    const keywordLine = kwsKeywordLineForPhrase(this.phrase)
    if (!keywordLine) {
      throw new Error(
        `No enrolled keyword model for phrase "${this.phrase}". ` +
          `Only phrases with an enrolled BPE token sequence (e.g. "${kwsKeywordLineForPhrase('Hey NOVA')}") can be detected.`,
      )
    }

    // Require lazily so the WASM only loads when wake mode is first armed.
    const sherpa = require('sherpa-onnx') as SherpaOnnxModule
    if (typeof sherpa.createKws !== 'function') {
      throw new Error('Installed sherpa-onnx does not expose createKws')
    }

    const encoder = join(this.modelDir, 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx')
    const decoder = join(this.modelDir, 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx')
    const joiner = join(this.modelDir, 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx')
    const tokens = join(this.modelDir, 'tokens.txt')
    const bpeVocab = join(this.modelDir, 'bpe.model')

    const config: Record<string, unknown> = {
      featConfig: { sampleRate: this.sampleRate, featureDim: KWS_FEATURE_DIM },
      modelConfig: {
        transducer: { encoder, decoder, joiner },
        tokens,
        numThreads: NUM_THREADS,
        provider: 'cpu',
        debug: 0,
        modelType: '',
        modelingUnit: 'bpe',
        bpeVocab,
      },
      maxActivePaths: KWS_MAX_ACTIVE_PATHS,
      numTrailingBlanks: KWS_NUM_TRAILING_BLANKS,
      keywordsScore: KWS_KEYWORDS_SCORE,
      keywordsThreshold: KWS_KEYWORDS_THRESHOLD,
      // The `keywords` field is a newline-delimited list of BPE token
      // sequences for the phrases the model should spot. The entry must be the
      // exact token sequence (from the model's bpe.model), not the plain text.
      keywords: keywordLine,
    }

    const kws = sherpa.createKws(config)
    if (!kws) {
      throw new Error('sherpa-onnx failed to create the keyword spotter')
    }
    this.sherpa = sherpa
    this.kws = kws
    this.initializedPhrase = this.phrase
    this.detected = false
  }

  start(): void {
    if (!this.kws) throw new Error('Keyword spotter is not initialized')
    this.reset()
    this.stream = this.kws.createStream()
  }

  acceptAudio(samples: Float32Array): void {
    if (!this.kws || !this.stream) return
    this.stream.acceptWaveform(this.sampleRate, samples)
    while (this.kws.isReady(this.stream)) {
      this.kws.decode(this.stream)
    }
    const result = this.kws.getResult(this.stream)
    if (result && typeof result.keyword === 'string' && result.keyword.length > 0) {
      this.detected = true
    }
  }

  isDetected(): boolean {
    return this.detected
  }

  reset(): void {
    if (this.kws && this.stream) {
      // Reset the stream so a repeated phrase in the same window is re-spotted.
      try {
        this.kws.reset(this.stream)
      } catch {
        // ignore
      }
    }
    this.detected = false
  }

  dispose(): void {
    if (this.stream) {
      try {
        this.stream.free()
      } catch {
        // ignore
      }
      this.stream = null
    }
    if (this.kws) {
      try {
        this.kws.free()
      } catch {
        // ignore
      }
      this.kws = null
    }
    this.sherpa = null
    this.detected = false
    this.initializedPhrase = ''
  }
}

export function createSherpaKeywordSpotter(
  options: KeywordSpotterOptions,
): KeywordSpotter {
  return new SherpaKeywordSpotter(options)
}