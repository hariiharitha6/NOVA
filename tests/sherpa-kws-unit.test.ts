import { describe, expect, it } from 'vitest'
import {
  ENROLLED_KWS_PHRASES,
  isEnrolledWakePhrase,
  kwsKeywordLineForPhrase,
} from '../electron/core/speech/sherpa-kws'
import { DEFAULT_KWS_BPE, DEFAULT_KWS_MODEL_NAME } from '../electron/core/speech/constants'
import { wakeModelNameForPhrase } from '../electron/core/speech/wake-model'

describe('KWS phrase enrollment (pure helpers)', () => {
  it('enrolls the default "Hey NOVA" phrase with a BPE keyword line', () => {
    expect(ENROLLED_KWS_PHRASES['hey nova']).toBe(DEFAULT_KWS_BPE)
    expect(kwsKeywordLineForPhrase('Hey NOVA')).toBe(DEFAULT_KWS_BPE)
    expect(kwsKeywordLineForPhrase('hey nova')).toBe(DEFAULT_KWS_BPE)
    expect(kwsKeywordLineForPhrase('HEY NOVA')).toBe(DEFAULT_KWS_BPE)
    expect(isEnrolledWakePhrase('Hey NOVA')).toBe(true)
  })

  it('does not enroll arbitrary phrases (no silent wrong-model detection)', () => {
    expect(kwsKeywordLineForPhrase('Hey AJ')).toBeNull()
    expect(kwsKeywordLineForPhrase('Hello Ajay')).toBeNull()
    expect(kwsKeywordLineForPhrase('Heyy Harii')).toBeNull()
    expect(kwsKeywordLineForPhrase('Hii Harii')).toBeNull()
    expect(isEnrolledWakePhrase('Hey AJ')).toBe(false)
  })

  it('rejects invalid/empty phrases', () => {
    expect(kwsKeywordLineForPhrase('')).toBeNull()
    expect(kwsKeywordLineForPhrase('   ')).toBeNull()
    expect(kwsKeywordLineForPhrase('!!!')).toBeNull()
    expect(kwsKeywordLineForPhrase('no\nnewlines')).toBeNull()
  })

  it('resolves the default model directory name for the default phrase', () => {
    expect(wakeModelNameForPhrase('Hey NOVA')).toBe(DEFAULT_KWS_MODEL_NAME)
    expect(wakeModelNameForPhrase('hey nova')).toBe(DEFAULT_KWS_MODEL_NAME)
  })

  it('still resolves a (never-present) per-phrase directory for custom phrases', () => {
    // This is the enrollment seam: a custom phrase maps to its own model dir
    // even though no model has been created for it. The spotter will refuse to
    // arm because the phrase is not enrolled.
    expect(wakeModelNameForPhrase('Hey AJ')).toBe('sherpa-onnx-kws-hey-aj')
  })
})