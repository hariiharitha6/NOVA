// sherpa-onnx streaming recognizer (Node.js WASM build).
//
// Uses ONLY the API surface verified in node_modules/sherpa-onnx@1.13.5:
//   sherpa.createOnlineRecognizer(config) -> OnlineRecognizer
//   recognizer.createStream()            -> OnlineStream
//   stream.acceptWaveform(sampleRate, Float32Array)  // samples in [-1, 1]
//   stream.inputFinished()
//   recognizer.isReady(stream) / recognizer.decode(stream)
//   recognizer.getResult(stream) -> { text, is_final, ... }
//   recognizer.isEndpoint(stream) / recognizer.reset(stream)
//   stream.free() / recognizer.free()
//
// The npm package ships a Node.js (not browser) Emscripten build, so it runs
// in the Electron MAIN process. The renderer never touches sherpa-onnx and is
// never handed filesystem access; it streams Float32 PCM over typed IPC.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SpeechRecognizer, SpeechRecognizerOptions } from './recognizer'
import { MODEL_FILES, NUM_THREADS } from './constants'

interface SherpaOnnxModule {
  createOnlineRecognizer(config: Record<string, unknown>): SherpaRecognizer
}

interface SherpaStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void
  inputFinished(): void
  free(): void
}

interface SherpaRecognizer {
  createStream(): SherpaStream
  isReady(stream: SherpaStream): boolean
  decode(stream: SherpaStream): void
  getResult(stream: SherpaStream): { text: string; is_final: boolean }
  isEndpoint(stream: SherpaStream): boolean
  reset(stream: SherpaStream): void
  free(): void
}

export interface SherpaEndpointConfig {
  enableEndpoint: number
  rule1MinTrailingSilence: number
  rule2MinTrailingSilence: number
  rule3MinUtteranceLength: number
}

/**
 * Speech-end rules for the sherpa-onnx online recognizer.
 *
 *  - Rule 1 (no non-silence at all): a silence-only session finalises after
 *    `rule1` seconds. The controller never submits an empty transcript, so a
 *    snappy value is safe.
 *  - Rule 2 (non-silence already present): this IS the speech-end window and
 *    the real "are you done talking?" decision. `1.2` s restores sherpa-onnx's
 *    own upstream default; the previous `0.8` s fired on ordinary mid-phrase
 *    pauses and executed commands before the speaker finished their sentence
 *    (acceptance Bug 6). A short pause between two words < 1.2 s does not
 *    finalise; once the user really stops, the command submits immediately.
 *  - Rule 3: hard cap on continuous utterance length (never hit in practice —
 *    `MAX_LISTENING_MS` ends the session sooner).
 */
export function buildSherpaEndpointConfig(): SherpaEndpointConfig {
  return {
    enableEndpoint: 1,
    rule1MinTrailingSilence: 1.8,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
  }
}

export class SherpaSpeechRecognizer implements SpeechRecognizer {
  readonly kind = 'sherpa-onnx'

  private readonly modelDir: string
  private readonly sampleRate: number
  private sherpa: SherpaOnnxModule | null = null
  private recognizer: SherpaRecognizer | null = null
  private stream: SherpaStream | null = null
  private lastText = ''
  private initialized = false

  constructor(options: SpeechRecognizerOptions) {
    this.modelDir = options.modelDir
    this.sampleRate = options.sampleRate
  }

  initialize(): void {
    if (this.initialized) return
    const missing = MODEL_FILES.find((file) => !existsSync(join(this.modelDir, file)))
    if (missing) {
      throw new Error(`Speech model file is missing: ${join(this.modelDir, missing)}`)
    }

    // Require lazily so the 15 MB WASM only loads when voice is first used.
    // The package is a Node.js build; this must run in the main process.
    const sherpa = require('sherpa-onnx') as SherpaOnnxModule
    if (typeof sherpa.createOnlineRecognizer !== 'function') {
      throw new Error('Installed sherpa-onnx does not expose createOnlineRecognizer')
    }

    const encoder = join(this.modelDir, 'encoder-epoch-99-avg-1.int8.onnx')
    const decoder = join(this.modelDir, 'decoder-epoch-99-avg-1.int8.onnx')
    const joiner = join(this.modelDir, 'joiner-epoch-99-avg-1.int8.onnx')
    const tokens = join(this.modelDir, 'tokens.txt')

    const config = {
      featConfig: { sampleRate: this.sampleRate, featureDim: 80 },
      modelConfig: {
        transducer: { encoder, decoder, joiner },
        tokens,
        numThreads: NUM_THREADS,
        provider: 'cpu',
        debug: 0,
        modelType: 'zipformer',
      },
      decodingMethod: 'greedy_search',
      maxActivePaths: 4,
      ...buildSherpaEndpointConfig(),
    }

    const recognizer = sherpa.createOnlineRecognizer(config)
    if (!recognizer) {
      throw new Error('sherpa-onnx failed to create the online recognizer')
    }
    this.sherpa = sherpa
    this.recognizer = recognizer
    this.initialized = true
  }

  start(): void {
    if (!this.recognizer) throw new Error('Speech recognizer is not initialized')
    this.cancel()
    this.lastText = ''
    this.stream = this.recognizer.createStream()
  }

  acceptAudio(samples: Float32Array): void {
    if (!this.recognizer || !this.stream) return
    this.stream.acceptWaveform(this.sampleRate, samples)
    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream)
    }
    this.lastText = this.recognizer.getResult(this.stream).text ?? ''
  }

  partialTranscript(): string {
    return this.lastText
  }

  isEndpoint(): boolean {
    if (!this.recognizer || !this.stream) return false
    try {
      return this.recognizer.isEndpoint(this.stream)
    } catch {
      return false
    }
  }

  finishAndGetTranscript(): string {
    if (!this.recognizer || !this.stream) return ''
    const stream = this.stream
    stream.inputFinished()
    while (this.recognizer.isReady(stream)) {
      this.recognizer.decode(stream)
    }
    const result = this.recognizer.getResult(stream)
    this.lastText = result.text ?? ''
    // The finished stream can never accept more audio; free it immediately so
    // a finalised session does not leave a WASM stream allocated until the
    // next start()/cancel() (acceptance Bug 9).
    stream.free()
    this.stream = null
    return this.lastText
  }

  cancel(): void {
    if (this.stream) {
      this.stream.free()
      this.stream = null
    }
    this.lastText = ''
  }

  dispose(): void {
    this.cancel()
    if (this.recognizer) {
      this.recognizer.free()
      this.recognizer = null
    }
    this.sherpa = null
    this.initialized = false
  }
}

export function createSherpaSpeechRecognizer(
  options: SpeechRecognizerOptions,
): SpeechRecognizer {
  return new SherpaSpeechRecognizer(options)
}
