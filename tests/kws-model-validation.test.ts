import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_KWS_MODEL_NAME, KWS_MODEL_FILES } from '../electron/core/speech/constants'
import { kwsKeywordLineForPhrase, isEnrolledWakePhrase } from '../electron/core/speech/sherpa-kws'

const MODEL_DIR = join(__dirname, '..', 'resources', 'models', DEFAULT_KWS_MODEL_NAME)

/**
 * Integration-level verification of the bundled (or locally-installed) English
 * KWS model. Skips when the model has not been downloaded/extracted into
 * resources/models (it is gitignored), mirroring the speech-model validation
 * suite. Unit tests never require microphone hardware.
 */

describe.skipIf(!existsSync(MODEL_DIR))('KWS model on disk', () => {
  it('model directory exists', () => {
    expect(existsSync(MODEL_DIR)).toBe(true)
  })

  it('contains every file the SherpaKeywordSpotter requires', () => {
    for (const file of KWS_MODEL_FILES) {
      expect(existsSync(join(MODEL_DIR, file)), `missing ${file} in ${MODEL_DIR}`).toBe(true)
    }
  })

  it('carries the bpe.model needed to encode custom keywords', () => {
    expect(existsSync(join(MODEL_DIR, 'bpe.model'))).toBe(true)
  })

  it('the default phrase "Hey NOVA" resolves to an enrolled BPE keyword line', () => {
    expect(kwsKeywordLineForPhrase('Hey NOVA')).not.toBeNull()
    expect(kwsKeywordLineForPhrase('hey nova')).not.toBeNull()
    expect(isEnrolledWakePhrase('Hey NOVA')).toBe(true)
  })

  it('non-NOVA phrases are NOT silently claimed as detectable', () => {
    expect(kwsKeywordLineForPhrase('Hey AJ')).toBeNull()
    expect(kwsKeywordLineForPhrase('Hello world')).toBeNull()
    expect(isEnrolledWakePhrase('Hey AJ')).toBe(false)
  })

  it('actually loads through the sherpa-onnx runtime (model-loading path)', () => {
    // This exercises the exact integration NOVA's main process uses, proving
    // the ONNX + tokens files are compatible with the installed WASM runtime.
    const sherpa = require('sherpa-onnx')
    const kws = sherpa.createKws({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: join(MODEL_DIR, KWS_MODEL_FILES[0]),
          decoder: join(MODEL_DIR, KWS_MODEL_FILES[1]),
          joiner: join(MODEL_DIR, KWS_MODEL_FILES[2]),
        },
        tokens: join(MODEL_DIR, 'tokens.txt'),
        numThreads: 1,
        provider: 'cpu',
        debug: 0,
        modelType: '',
        modelingUnit: 'bpe',
        bpeVocab: join(MODEL_DIR, 'bpe.model'),
      },
      maxActivePaths: 4,
      numTrailingBlanks: 1,
      keywordsScore: 1.0,
      keywordsThreshold: 0.25,
      keywords: kwsKeywordLineForPhrase('Hey NOVA')!,
    })
    expect(kws).toBeTruthy()

    // Feed a short silence buffer: the detector must stay quiet and not crash,
    // and the stream must round-trip cleanly.
    const stream = kws.createStream()
    stream.acceptWaveform(16000, new Float32Array(1600))
    while (kws.isReady(stream)) kws.decode(stream)
    const result = kws.getResult(stream)
    expect(result).toBeTruthy()
    expect(result.keyword).toBe('')
    try {
      stream.free()
    } catch {
      // ignore
    }
    kws.free()
  })
})