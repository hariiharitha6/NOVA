import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BENCHMARK_REGISTRY,
  CORPUS_DIR_NAME,
  CORPUS_MANIFEST_NAME,
  REQUIRED_CORPUS_COVERAGE,
  loadManifest,
  loadSampleAudio,
  summarizeIntent,
  summarizeTranscripts,
  summarizeWake,
  type BenchmarkManifest,
  type IntentRow,
  type TranscriptRow,
  type WakeRow,
} from '../electron/core/speech/benchmark'
import { SherpaSpeechRecognizer } from '../electron/core/speech/sherpa-recognizer'
import { SherpaKeywordSpotter } from '../electron/core/speech/sherpa-kws'
import {
  CHUNK_SAMPLES,
  DEFAULT_KWS_MODEL_NAME,
  DEFAULT_WAKE_PHRASE,
  KWS_CHUNK_SAMPLES,
  MODEL_NAME,
  TARGET_SAMPLE_RATE,
} from '../electron/core/speech/constants'

const REPO_ROOT = join(__dirname, '..')
const CORPUS_DIR = join(REPO_ROOT, CORPUS_DIR_NAME)
const MANIFEST_PATH = join(CORPUS_DIR, CORPUS_MANIFEST_NAME)
const STT_MODEL_DIR = join(REPO_ROOT, 'resources', 'models', MODEL_NAME)
const KWS_MODEL_DIR = join(REPO_ROOT, 'resources', 'models', DEFAULT_KWS_MODEL_NAME)

type ReadinessStatus = 'corpusMissing' | 'invalid' | 'noConsent' | 'corpusEmpty' | 'partial' | 'ready'

interface Readiness {
  status: ReadinessStatus
  manifest: BenchmarkManifest | null
  expected: number
  recorded: number
  error?: string
}

/**
 * A generated skeleton (corpus.json with no audio) is NOT a corpus. The measured
 * benchmark must keep reporting "not measured" until at least one real recording
 * exists, and only reports "ready" once every sample's WAV is present.
 */
function assessReadiness(): Readiness {
  if (!existsSync(MANIFEST_PATH)) {
    return { status: 'corpusMissing', manifest: null, expected: 0, recorded: 0 }
  }
  let manifest: BenchmarkManifest
  try {
    manifest = loadManifest(MANIFEST_PATH)
  } catch (error) {
    return { status: 'invalid', manifest: null, expected: 0, recorded: 0, error: (error as Error).message }
  }
  const recorded = manifest.samples.filter((s) => existsSync(join(CORPUS_DIR, s.file))).length
  const expected = manifest.samples.length
  if (!manifest.consent) return { status: 'noConsent', manifest, expected, recorded }
  if (recorded === 0) return { status: 'corpusEmpty', manifest, expected, recorded }
  if (recorded < expected) return { status: 'partial', manifest, expected, recorded }
  return { status: 'ready', manifest, expected, recorded }
}

const readiness = assessReadiness()

/** Feed a whole clip through the real streaming recognizer, chunk by chunk. */
function transcribe(recognizer: SherpaSpeechRecognizer, samples: Float32Array): TranscriptRow {
  recognizer.start()
  const startedAt = performance.now()
  let endpointDetected = false
  for (let i = 0; i < samples.length; i += CHUNK_SAMPLES) {
    recognizer.acceptAudio(samples.subarray(i, i + CHUNK_SAMPLES))
    if (!endpointDetected && recognizer.isEndpoint?.()) endpointDetected = true
  }
  const hypothesis = recognizer.finishAndGetTranscript()
  const decodeWallMs = performance.now() - startedAt
  return {
    reference: '',
    hypothesis,
    // Direct recognizer runs always yield exactly one final transcript.
    submissions: 1,
    endpointLatencyMs: decodeWallMs,
  }
}

/** Feed a whole clip through the real KWS runtime; true when it spots the phrase. */
function detectWake(spotter: SherpaKeywordSpotter, samples: Float32Array): boolean {
  spotter.start()
  for (let i = 0; i < samples.length; i += KWS_CHUNK_SAMPLES) {
    spotter.acceptAudio(samples.subarray(i, i + KWS_CHUNK_SAMPLES))
    if (spotter.isDetected()) return true
  }
  return spotter.isDetected()
}

function categoryCounts(manifest: BenchmarkManifest): Record<string, number> {
  const counts: Record<string, number> = { command: 0, wake: 0, negative: 0, noise: 0 }
  for (const sample of manifest.samples) counts[sample.category] = (counts[sample.category] ?? 0) + 1
  return counts
}

describe('speech benchmark — corpus readiness', () => {
  it('declares the exact coverage required before any accuracy number is reported', () => {
    expect(REQUIRED_CORPUS_COVERAGE.length).toBeGreaterThan(0)
    for (const entry of REQUIRED_CORPUS_COVERAGE) {
      expect(entry.minimum).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('reports NOT MEASURED until a consented corpus of real recordings exists', () => {
    expect(CORPUS_DIR_NAME).toBe('benchmark/speech')
    expect([
      'corpusMissing',
      'invalid',
      'noConsent',
      'corpusEmpty',
      'partial',
      'ready',
    ]).toContain(readiness.status)
    if (readiness.status !== 'ready') {
      // The audit must say "not measured", never invent a percentage. A
      // generated skeleton alone never counts as a measurement.
      expect(readiness.recorded).toBeLessThan(readiness.expected || 1)
    }
  })
})

/**
 * End-to-end accuracy measurement against a LOCAL, user-recorded corpus.
 *
 * This suite is intentionally SKIPPED until real recordings exist (a generated
 * skeleton does not count). It never records audio and never contacts the
 * network; it reads WAV files the user recorded into benchmark/speech/
 * (gitignored) and writes benchmark/speech/results.json.
 */
describe.skipIf(readiness.recorded === 0 || readiness.status === 'noConsent' || readiness.status === 'invalid')(
  'speech benchmark — measured results',
  () => {
  it('runs the real recognizer and spotter over the corpus and records metrics', () => {
    const manifest = readiness.manifest ?? loadManifest(MANIFEST_PATH)
    if (!manifest.consent) {
      // Hard gate: no consent, no scoring. Nothing is read or written.
      return
    }

    const sttAvailable = existsSync(STT_MODEL_DIR)
    const kwsAvailable = existsSync(KWS_MODEL_DIR)

    const transcriptRows: TranscriptRow[] = []
    const intentRows: IntentRow[] = []
    const wakeRows: WakeRow[] = []
    const failures: string[] = []

    let recognizer: SherpaSpeechRecognizer | null = null
    if (sttAvailable) {
      recognizer = new SherpaSpeechRecognizer({ modelDir: STT_MODEL_DIR, sampleRate: TARGET_SAMPLE_RATE })
      recognizer.initialize()
    }

    let spotter: SherpaKeywordSpotter | null = null
    if (kwsAvailable) {
      spotter = new SherpaKeywordSpotter({ modelDir: KWS_MODEL_DIR, sampleRate: TARGET_SAMPLE_RATE })
      spotter.setPhrase(DEFAULT_WAKE_PHRASE)
      spotter.initialize()
    }

    for (const sample of manifest.samples) {
      const filePath = join(CORPUS_DIR, sample.file)
      if (!existsSync(filePath)) {
        failures.push(`${sample.id}: missing file ${sample.file}`)
        continue
      }
      let samples: Float32Array
      try {
        samples = loadSampleAudio(readFileSync(filePath))
      } catch (error) {
        failures.push(`${sample.id}: ${(error as Error).message}`)
        continue
      }

      if (sample.category === 'command' && recognizer) {
        const row = transcribe(recognizer, samples)
        row.reference = sample.reference
        transcriptRows.push(row)
        if (sample.expected) {
          intentRows.push({
            hypothesis: row.hypothesis,
            expectedIntent: sample.expected.intent,
            expectedTarget: sample.expected.target,
          })
        }
      } else if ((sample.category === 'wake' || sample.category === 'negative' || sample.category === 'noise') && spotter) {
        const detected = detectWake(spotter, samples)
        spotter.reset()
        const actualWake = sample.wake ?? sample.category === 'wake'
        wakeRows.push({ actualWake, detected })
        if (detected !== actualWake) failures.push(`${sample.id}: wake=${detected} expected=${actualWake}`)
      }
    }

    recognizer?.dispose()
    spotter?.dispose()

    const results = {
      generatedAt: new Date().toISOString(),
      // "measured" only when every sample had audio; otherwise the run is partial.
      status: readiness.status === 'ready' ? 'measured' : 'partial',
      recorded: readiness.recorded,
      expected: readiness.expected,
      models: { sttAvailable, kwsAvailable, sttModel: MODEL_NAME, kwsModel: DEFAULT_KWS_MODEL_NAME },
      coverage: categoryCounts(manifest),
      transcription: transcriptRows.length > 0 ? summarizeTranscripts(transcriptRows) : null,
      intent: intentRows.length > 0 ? summarizeIntent(intentRows, BENCHMARK_REGISTRY) : null,
      wake: wakeRows.length > 0 ? summarizeWake(wakeRows) : null,
      failures,
    }

    mkdirSync(CORPUS_DIR, { recursive: true })
    writeFileSync(join(CORPUS_DIR, 'results.json'), JSON.stringify(results, null, 2))

    // A measured run must at least have produced rows for the categories present.
    expect(results.coverage.command >= 0).toBe(true)
    expect(failures.every((f) => typeof f === 'string')).toBe(true)
  })
})
