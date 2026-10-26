import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  BENCHMARK_REGISTRY,
  REQUIRED_CORPUS_COVERAGE,
  decodeWav,
  parseManifest,
} from '../electron/core/speech/benchmark'
import { resolveCommand } from '../electron/core/command-engine'
import { DEFAULT_WAKE_PHRASE } from '../electron/core/speech/constants'

// The recorder scripts are plain CommonJS; load them directly.
const require = createRequire(import.meta.url)

interface TemplateSample {
  id: string
  file: string
  category: 'command' | 'wake' | 'negative' | 'noise'
  reference: string
  accent?: string
  speed?: string
  noise?: string
  expected?: { intent: string; target?: string }
  wake?: boolean
}

interface CoverageBucket {
  match: string
  prefixes: string[]
  minimum: number
}

const template = require('../scripts/corpus-template.cjs') as {
  WAKE_PHRASE: string
  CORPUS_NOTES: string
  CORPUS_SAMPLES: TemplateSample[]
  COVERAGE_BUCKETS: CoverageBucket[]
}

const promptModule = require('../scripts/speech-recorder/prompt.cjs') as {
  WAKE_PHRASE: string
  derivePrompt: (s: TemplateSample) => string
  hintForId: (id: string) => string
}

const wavModule = require('../scripts/speech-recorder/wav-encode.cjs') as {
  encodeWav: (samples: Float32Array, sampleRate: number) => Buffer
  toInt16: (v: number) => number
}

const commandSamples = template.CORPUS_SAMPLES.filter((s) => s.category === 'command')

// These fixtures only validate the SKELETON and tooling. They never stand in for
// a real microphone measurement — the measured benchmark stays skipped until a
// consented corpus of real recordings exists.
describe('speech corpus skeleton', () => {
  it('has unique ids and file paths that match samples/<id>.wav', () => {
    const ids = new Set<string>()
    for (const sample of template.CORPUS_SAMPLES) {
      expect(ids.has(sample.id), `duplicate id ${sample.id}`).toBe(false)
      ids.add(sample.id)
      expect(sample.file).toBe(`samples/${sample.id}.wav`)
      expect(['command', 'wake', 'negative', 'noise']).toContain(sample.category)
    }
  })

  it('meets every REQUIRED_CORPUS_COVERAGE bucket', () => {
    for (const required of REQUIRED_CORPUS_COVERAGE) {
      const bucket = template.COVERAGE_BUCKETS.find((b) => required.description.includes(b.match))
      expect(bucket, `no template bucket matches "${required.description}"`).toBeTruthy()
      const count = template.CORPUS_SAMPLES.filter((s) =>
        (bucket as CoverageBucket).prefixes.some((p) => s.id.startsWith(p)),
      ).length
      expect(
        count,
        `bucket "${required.description}" has ${count}, needs >= ${required.minimum}`,
      ).toBeGreaterThanOrEqual(required.minimum)
    }
  })

  it('covers all four manifest categories', () => {
    const categories = new Set(template.CORPUS_SAMPLES.map((s) => s.category))
    expect(categories).toEqual(new Set(['command', 'wake', 'negative', 'noise']))
  })

  it('tags wake positives/negatives/noise correctly', () => {
    for (const sample of template.CORPUS_SAMPLES) {
      if (sample.category === 'wake') {
        expect(sample.wake).toBe(true)
        expect(sample.reference).toBe('')
      } else if (sample.category === 'negative') {
        expect(sample.wake).toBe(false)
        expect(sample.reference.length).toBeGreaterThan(0)
      } else if (sample.category === 'noise') {
        expect(sample.wake).toBe(false)
        expect(sample.reference).toBe('')
      }
    }
  })

  it('every command reference resolves to its declared expected command', () => {
    for (const sample of commandSamples) {
      expect(sample.expected, `${sample.id} has no expected command`).toBeTruthy()
      const action = resolveCommand(sample.reference, BENCHMARK_REGISTRY)
      expect(action.intent, `${sample.id} ("${sample.reference}") intent`).toBe(sample.expected!.intent)
      if (sample.expected!.target !== undefined) {
        expect(action.label, `${sample.id} ("${sample.reference}") target`).toBe(sample.expected!.target)
      }
    }
  })

  it('builds a manifest the harness accepts (consent true, 120 samples)', () => {
    const manifest = parseManifest(
      JSON.stringify({ version: 1, consent: true, notes: template.CORPUS_NOTES, samples: template.CORPUS_SAMPLES }),
    )
    expect(manifest.consent).toBe(true)
    expect(manifest.samples).toHaveLength(template.CORPUS_SAMPLES.length)
  })
})

describe('recorder prompt module', () => {
  it('uses the same wake phrase as the runtime', () => {
    expect(promptModule.WAKE_PHRASE).toBe(DEFAULT_WAKE_PHRASE)
    expect(template.WAKE_PHRASE).toBe(DEFAULT_WAKE_PHRASE)
  })

  it('derives the spoken prompt from the sample category', () => {
    for (const sample of template.CORPUS_SAMPLES) {
      const prompt = promptModule.derivePrompt(sample)
      if (sample.category === 'noise') expect(prompt).toBe('')
      else if (sample.category === 'wake') expect(prompt).toBe(DEFAULT_WAKE_PHRASE)
      else expect(prompt).toBe(sample.reference)
    }
  })

  it('gives every sample a non-empty hint', () => {
    for (const sample of template.CORPUS_SAMPLES) {
      expect(promptModule.hintForId(sample.id).length).toBeGreaterThan(0)
    }
  })
})

describe('recorder WAV encoder', () => {
  it('clamps and quantises to signed 16-bit', () => {
    expect(wavModule.toInt16(0)).toBe(0)
    expect(wavModule.toInt16(1)).toBe(32767)
    expect(wavModule.toInt16(-1)).toBe(-32768)
    expect(wavModule.toInt16(5)).toBe(32767)
    expect(wavModule.toInt16(-5)).toBe(-32768)
  })

  it('round-trips a tone through the benchmark WAV loader', () => {
    const rate = 16000
    const tone = new Float32Array(rate)
    for (let i = 0; i < tone.length; i++) tone[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5
    const wav = wavModule.encodeWav(tone, rate)

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')

    const decoded = decodeWav(wav)
    expect(decoded.sampleRate).toBe(rate)
    expect(decoded.channels).toBe(1)
    expect(decoded.samples.length).toBe(rate)
    // 16-bit quantisation tolerance.
    for (let i = 0; i < rate; i += 97) {
      expect(Math.abs(decoded.samples[i] - tone[i])).toBeLessThan(1 / 32767 + 1e-6)
    }
  })
})
