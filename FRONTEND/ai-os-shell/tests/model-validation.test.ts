import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_NAME, MODEL_FILES } from '../electron/core/speech/constants'

/**
 * Validates that the bundled speech model is a genuine zipformer (v1) model
 * whose ONNX metadata contains the fields sherpa-onnx requires. This catches
 * regressions where someone accidentally sets modelType to an incompatible
 * value (e.g. 'zipformer2') or points at the wrong model directory.
 */

const MODEL_DIR = join(__dirname, '..', 'resources', 'models', MODEL_NAME)

function readEncoderBinary(): Buffer {
  return readFileSync(join(MODEL_DIR, 'encoder-epoch-99-avg-1.int8.onnx'))
}

/**
 * The large model binaries are gitignored (resources/models/), so on a fresh
 * clone they are absent until downloaded locally. Skip validation rather than
 * failing so `npm test` stays green without the model present; the suite runs
 * in full when the model has been downloaded/extracted.
 */
describe.skipIf(!existsSync(MODEL_DIR))('speech model validation', () => {
  it('model directory exists', () => {
    expect(existsSync(MODEL_DIR)).toBe(true)
  })

  it('all model files exist', () => {
    for (const file of MODEL_FILES) {
      expect(existsSync(join(MODEL_DIR, file)), `missing ${file}`).toBe(true)
    }
  })

  it('encoder contains model_type metadata (zipformer v1)', () => {
    const buf = readEncoderBinary()
    const text = buf.toString('utf-8')
    // The ONNX metadata must contain model_type = zipformer (not zipformer2)
    expect(text).toContain('model_type')
    expect(text).toContain('zipformer')
    // Ensure it does NOT claim to be zipformer2
    expect(text).not.toContain('zipformer2')
  })

  it('encoder contains attention_dims metadata', () => {
    const buf = readEncoderBinary()
    const text = buf.toString('utf-8')
    expect(text).toContain('attention_dims')
  })

  it('encoder does NOT contain query_head_dims (zipformer2-only field)', () => {
    const buf = readEncoderBinary()
    const text = buf.toString('utf-8')
    // query_head_dims is a zipformer2-only field. If this appears, the model
    // has been swapped to a zipformer2 checkpoint and the modelType must also
    // be updated.
    expect(text).not.toContain('query_head_dims')
  })

  it('recognizer modelType config must match model architecture', () => {
    // If the encoder contains 'query_head_dims', modelType must be 'zipformer2'.
    // If it does NOT contain 'query_head_dims', modelType must be 'zipformer'.
    // This test ensures the sherpa-recognizer.ts config stays in sync.
    const buf = readEncoderBinary()
    const hasZipformer2Metadata = buf.toString('utf-8').includes('query_head_dims')

    // Read the actual config from sherpa-recognizer.ts source
    const src = readFileSync(
      join(__dirname, '..', 'electron', 'core', 'speech', 'sherpa-recognizer.ts'),
      'utf-8',
    )
    const match = src.match(/modelType:\s*['"](\w+)['"]/)
    expect(match).not.toBeNull()
    const configuredType = match![1]

    if (hasZipformer2Metadata) {
      expect(configuredType).toBe('zipformer2')
    } else {
      expect(configuredType).toBe('zipformer')
    }
  })
})
