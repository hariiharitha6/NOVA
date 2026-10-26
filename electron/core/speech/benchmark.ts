// Speech accuracy & wake-word benchmark — pure, platform-neutral core.
//
// This module is deliberately free of Electron, WASM, microphone or filesystem
// side effects EXCEPT the optional WAV reader, so every measurement formula can
// be unit-tested without hardware. The actual audio run is driven by
// `tests/speech-benchmark.test.ts`, which feeds recorded local samples through
// the REAL sherpa-onnx recognizer / keyword spotter.
//
// Nothing here records, uploads, or persists audio. The corpus lives in
// benchmark/speech/ (gitignored) and can be deleted at any time; see
// `removeSpeechCorpus()` and scripts/speech-corpus-remove.mjs.

import { readFileSync } from 'node:fs'
import { resolveCommand } from '../command-engine'
import type { CommandSource } from '../command-engine'
import { resample } from './audio-utils'
import { TARGET_SAMPLE_RATE } from './constants'

// ─── Corpus model ───────────────────────────────────────────────────────────

export type BenchmarkCategory =
  /** A spoken command that must resolve to a registry target/intent. */
  | 'command'
  /** A spoken "Hey NOVA" that must trigger the wake detector. */
  | 'wake'
  /** Ordinary speech that must NOT trigger the wake detector. */
  | 'negative'
  /** Silence/noise used to measure false wake activations. */
  | 'noise'

export type SpeechSpeed = 'slow' | 'normal' | 'fast'
export type Accent = 'indian-en' | 'us-en' | 'uk-en' | 'other'

export interface ExpectedCommand {
  intent: string
  /** Registry label the command must resolve to (target-resolution score). */
  target?: string
}

export interface BenchmarkSample {
  id: string
  /** File name relative to the corpus directory. */
  file: string
  category: BenchmarkCategory
  /** Ground-truth transcript. Empty for pure wake/negative samples. */
  reference: string
  speaker?: string
  accent?: Accent
  speed?: SpeechSpeed
  /** Free-form noise label, e.g. "none", "fan", "traffic". */
  noise?: string
  /** For category "command": the command the transcript must resolve to. */
  expected?: ExpectedCommand
  /** For category "wake"/"negative": whether the wake phrase is present. */
  wake?: boolean
}

export interface BenchmarkManifest {
  version: 1
  /** Explicit user consent flag: no corpus is scored unless true. */
  consent: boolean
  /** Free-form notes (collection device, room, date, ...). */
  notes?: string
  samples: BenchmarkSample[]
}

// ─── Scoring normalization ─────────────────────────────────────────────────

/**
 * Normalize a transcript for scoring: lowercase, strip punctuation, collapse
 * whitespace. Deliberately does NOT fold spoken variants (e.g. "you tube" →
 * "youtube"); WER must reflect raw recognition.
 */
export function normalizeForScoring(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenizeForScoring(text: string): string[] {
  const normalized = normalizeForScoring(text)
  return normalized ? normalized.split(' ') : []
}

// ─── WER (word-level Levenshtein) ──────────────────────────────────────────

export interface EditCounts {
  substitutions: number
  deletions: number
  insertions: number
  distance: number
}

/** Word-level Levenshtein distance with substitution/deletion/insertion counts. */
export function wordEditDistance(reference: string[], hypothesis: string[]): EditCounts {
  const n = reference.length
  const m = hypothesis.length
  // dp[i][j] = { cost, subs, dels, inss } for reference[0..i) vs hypothesis[0..j)
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  const subs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  const dels: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  const inss: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))

  for (let i = 0; i <= n; i++) {
    cost[i][0] = i
    dels[i][0] = i
  }
  for (let j = 0; j <= m; j++) {
    cost[0][j] = j
    inss[0][j] = j
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = cost[i - 1][j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)
      const delCost = cost[i - 1][j] + 1
      const insCost = cost[i][j - 1] + 1

      let best = subCost
      let from: 'sub' | 'del' | 'ins' = 'sub'
      if (delCost < best) {
        best = delCost
        from = 'del'
      }
      if (insCost < best) {
        best = insCost
        from = 'ins'
      }
      cost[i][j] = best
      if (from === 'sub') {
        subs[i][j] = subs[i - 1][j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)
        dels[i][j] = dels[i - 1][j - 1]
        inss[i][j] = inss[i - 1][j - 1]
      } else if (from === 'del') {
        subs[i][j] = subs[i - 1][j]
        dels[i][j] = dels[i - 1][j] + 1
        inss[i][j] = inss[i - 1][j]
      } else {
        subs[i][j] = subs[i][j - 1]
        dels[i][j] = dels[i][j - 1]
        inss[i][j] = inss[i][j - 1] + 1
      }
    }
  }
  return {
    substitutions: subs[n][m],
    deletions: dels[n][m],
    insertions: inss[n][m],
    distance: cost[n][m],
  }
}

export interface WerResult extends EditCounts {
  /** Word error rate: distance / reference length (0 when reference is empty). */
  wer: number
  refWords: number
  hypWords: number
}

export function wordErrorRate(reference: string, hypothesis: string): WerResult {
  const refWords = tokenizeForScoring(reference)
  const hypWords = tokenizeForScoring(hypothesis)
  const edits = wordEditDistance(refWords, hypWords)
  return {
    ...edits,
    wer: refWords.length === 0 ? (hypWords.length === 0 ? 0 : 1) : edits.distance / refWords.length,
    refWords: refWords.length,
    hypWords: hypWords.length,
  }
}

/** Exact transcript match after scoring normalization. */
export function exactTranscriptMatch(reference: string, hypothesis: string): boolean {
  return normalizeForScoring(reference) === normalizeForScoring(hypothesis)
}

// ─── Aggregate transcript metrics ──────────────────────────────────────────

export interface TranscriptRow {
  reference: string
  hypothesis: string
  /** Endpoint latency in ms, when measured. */
  endpointLatencyMs?: number
  /** How many times the session produced a final submission (duplicate guard). */
  submissions?: number
}

export interface TranscriptSummary {
  samples: number
  /** Corpus-level (micro) WER: total distance / total reference words. */
  wer: number
  /** Mean per-utterance WER (macro), useful when utterance lengths vary. */
  meanWer: number
  exactAccuracy: number
  totalDistance: number
  totalRefWords: number
  /** Utterances that produced more than one submission. */
  duplicateSubmissions: number
  endpoint?: LatencySummary
}

export function summarizeTranscripts(rows: TranscriptRow[]): TranscriptSummary {
  let totalDistance = 0
  let totalRefWords = 0
  let exact = 0
  let werSum = 0
  let duplicates = 0
  const latencies: number[] = []

  for (const row of rows) {
    const result = wordErrorRate(row.reference, row.hypothesis)
    totalDistance += result.distance
    totalRefWords += result.refWords
    werSum += result.wer
    if (exactTranscriptMatch(row.reference, row.hypothesis)) exact += 1
    if ((row.submissions ?? 0) > 1) duplicates += 1
    if (typeof row.endpointLatencyMs === 'number') latencies.push(row.endpointLatencyMs)
  }

  const n = rows.length
  return {
    samples: n,
    wer: totalRefWords === 0 ? 0 : totalDistance / totalRefWords,
    meanWer: n === 0 ? 0 : werSum / n,
    exactAccuracy: n === 0 ? 0 : exact / n,
    totalDistance,
    totalRefWords,
    duplicateSubmissions: duplicates,
    endpoint: latencies.length > 0 ? latencySummary(latencies) : undefined,
  }
}

// ─── Intent / target resolution ────────────────────────────────────────────

export interface IntentRow {
  hypothesis: string
  expectedIntent: string
  expectedTarget?: string
}

export interface IntentSummary {
  samples: number
  intentAccuracy: number
  /** Target-name accuracy across samples that declare an expected target. */
  targetAccuracy: number
  targetSamples: number
  failures: Array<{ hypothesis: string; expected: string; actual: string }>
}

export function summarizeIntent(rows: IntentRow[], registry: CommandSource): IntentSummary {
  let intentHits = 0
  let targetHits = 0
  let targetSamples = 0
  const failures: IntentSummary['failures'] = []

  for (const row of rows) {
    const action = resolveCommand(row.hypothesis, registry)
    const intentOk = action.intent === row.expectedIntent
    if (intentOk) intentHits += 1

    if (row.expectedTarget !== undefined) {
      targetSamples += 1
      const targetOk = intentOk && action.label === row.expectedTarget
      if (targetOk) targetHits += 1
      if (!intentOk || !targetOk) {
        failures.push({
          hypothesis: row.hypothesis,
          expected: `${row.expectedIntent}${row.expectedTarget ? ` → ${row.expectedTarget}` : ''}`,
          actual: `${action.intent}${action.label ? ` → ${action.label}` : ''}`,
        })
      }
    } else if (!intentOk) {
      failures.push({
        hypothesis: row.hypothesis,
        expected: row.expectedIntent,
        actual: action.intent,
      })
    }
  }

  const n = rows.length
  return {
    samples: n,
    intentAccuracy: n === 0 ? 0 : intentHits / n,
    targetAccuracy: targetSamples === 0 ? 0 : targetHits / targetSamples,
    targetSamples,
    failures,
  }
}

// ─── Latency ───────────────────────────────────────────────────────────────

export interface LatencySummary {
  count: number
  min: number
  max: number
  mean: number
  median: number
  p95: number
}

export function latencySummary(values: number[]): LatencySummary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  const quantile = (q: number): number => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
    return sorted[idx]
  }
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: quantile(0.5),
    p95: quantile(0.95),
  }
}

// ─── Wake-word confusion matrix ────────────────────────────────────────────

export interface WakeRow {
  /** Ground truth: was the wake phrase actually present? */
  actualWake: boolean
  /** Detector output for this sample. */
  detected: boolean
}

export interface WakeSummary {
  samples: number
  truePositives: number
  falsePositives: number
  trueNegatives: number
  falseNegatives: number
  /** TP / (TP + FN): wake phrases that were missed lower this. */
  recall: number
  /** TP / (TP + FP): spurious activations lower this. */
  precision: number
  /** FP / (FP + TN): false wake activations over all non-wake audio. */
  falsePositiveRate: number
  accuracy: number
}

export function summarizeWake(rows: WakeRow[]): WakeSummary {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const row of rows) {
    if (row.actualWake && row.detected) tp += 1
    else if (row.actualWake && !row.detected) fn += 1
    else if (!row.actualWake && row.detected) fp += 1
    else tn += 1
  }
  const precisionDenom = tp + fp
  const recallDenom = tp + fn
  const fprDenom = fp + tn
  const n = rows.length
  return {
    samples: n,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    recall: recallDenom === 0 ? 0 : tp / recallDenom,
    precision: precisionDenom === 0 ? 0 : tp / precisionDenom,
    falsePositiveRate: fprDenom === 0 ? 0 : fp / fprDenom,
    accuracy: n === 0 ? 0 : (tp + tn) / n,
  }
}

// ─── WAV decoding (local corpus, no external deps) ─────────────────────────

export interface DecodedAudio {
  sampleRate: number
  channels: number
  /** Mono, resampled to TARGET_SAMPLE_RATE. */
  samples: Float32Array
}

function readAscii(buffer: Buffer, offset: number, length: number): string {
  return buffer.toString('ascii', offset, offset + length)
}

/**
 * Decode a WAV file to mono Float32 at TARGET_SAMPLE_RATE. Supports PCM 8/16/24/
 * 32-bit integer and 32-bit float. Throws a descriptive error for anything else
 * so a malformed corpus sample fails loudly rather than scoring garbage.
 */
export function decodeWav(buffer: Buffer, targetRate = TARGET_SAMPLE_RATE): DecodedAudio {
  if (buffer.length < 12 || readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file')
  }

  let offset = 12
  let audioFormat = 1
  let channels = 1
  let sampleRate = 16000
  let bitsPerSample = 16
  let dataOffset = -1
  let dataLength = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = readAscii(buffer, offset, 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(body)
      channels = buffer.readUInt16LE(body + 2)
      sampleRate = buffer.readUInt32LE(body + 4)
      bitsPerSample = buffer.readUInt16LE(body + 14)
    } else if (chunkId === 'data') {
      dataOffset = body
      dataLength = Math.min(chunkSize, buffer.length - body)
    }
    offset = body + chunkSize + (chunkSize % 2)
  }

  if (dataOffset < 0) throw new Error('WAV has no data chunk')
  if (channels < 1) throw new Error('WAV has zero channels')

  const bytesPerSample = bitsPerSample / 8
  const frames = Math.floor(dataLength / (bytesPerSample * channels))
  const interleaved = new Float32Array(frames * channels)

  for (let frame = 0; frame < frames; frame++) {
    for (let ch = 0; ch < channels; ch++) {
      const p = dataOffset + (frame * channels + ch) * bytesPerSample
      let value = 0
      if (audioFormat === 3 && bitsPerSample === 32) {
        value = buffer.readFloatLE(p)
      } else if (bitsPerSample === 8) {
        value = (buffer.readUInt8(p) - 128) / 128
      } else if (bitsPerSample === 16) {
        value = buffer.readInt16LE(p) / 32768
      } else if (bitsPerSample === 24) {
        const b0 = buffer.readUInt8(p)
        const b1 = buffer.readUInt8(p + 1)
        const b2 = buffer.readInt8(p + 2)
        value = ((b2 << 16) | (b1 << 8) | b0) / 8388608
      } else if (bitsPerSample === 32) {
        value = buffer.readInt32LE(p) / 2147483648
      } else {
        throw new Error(`Unsupported WAV format: ${bitsPerSample}-bit`)
      }
      interleaved[frame * channels + ch] = value
    }
  }

  // Downmix to mono.
  let mono: Float32Array
  if (channels === 1) {
    mono = interleaved
  } else {
    mono = new Float32Array(frames)
    for (let frame = 0; frame < frames; frame++) {
      let sum = 0
      for (let ch = 0; ch < channels; ch++) sum += interleaved[frame * channels + ch]
      mono[frame] = sum / channels
    }
  }

  const samples = sampleRate === targetRate ? mono : resample(mono, sampleRate, targetRate)
  return { sampleRate: targetRate, channels, samples }
}

export function loadSampleAudio(buffer: Buffer): Float32Array {
  return decodeWav(buffer).samples
}

// ─── Manifest loading & validation ─────────────────────────────────────────

export function parseManifest(json: string): BenchmarkManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new Error(`Benchmark manifest is not valid JSON: ${(error as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Benchmark manifest must be a JSON object')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.version !== 1) throw new Error('Benchmark manifest version must be 1')
  if (typeof obj.consent !== 'boolean') {
    throw new Error('Benchmark manifest must set "consent" to true or false explicitly')
  }
  if (!Array.isArray(obj.samples)) throw new Error('Benchmark manifest must have a "samples" array')

  const samples: BenchmarkSample[] = obj.samples.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Sample ${index} must be an object`)
    }
    const s = raw as Record<string, unknown>
    const id = s.id
    const file = s.file
    const category = s.category
    if (typeof id !== 'string' || !id) throw new Error(`Sample ${index} is missing a string "id"`)
    if (typeof file !== 'string' || !file) throw new Error(`Sample ${id} is missing a string "file"`)
    if (
      category !== 'command' &&
      category !== 'wake' &&
      category !== 'negative' &&
      category !== 'noise'
    ) {
      throw new Error(`Sample ${id} has an invalid category "${String(category)}"`)
    }
    return {
      id,
      file,
      category,
      reference: typeof s.reference === 'string' ? s.reference : '',
      speaker: typeof s.speaker === 'string' ? s.speaker : undefined,
      accent: s.accent as BenchmarkSample['accent'],
      speed: s.speed as BenchmarkSample['speed'],
      noise: typeof s.noise === 'string' ? s.noise : undefined,
      expected: s.expected as ExpectedCommand | undefined,
      wake: typeof s.wake === 'boolean' ? s.wake : undefined,
    }
  })

  return {
    version: 1,
    consent: obj.consent,
    notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    samples,
  }
}

export function loadManifest(path: string): BenchmarkManifest {
  return parseManifest(readFileSync(path, 'utf8'))
}

// ─── Fixed benchmark registry ──────────────────────────────────────────────

/**
 * The apps/websites a benchmark command sample may resolve to. Kept explicit so
 * expected targets are deterministic and independent of the host machine.
 */
export const BENCHMARK_REGISTRY: CommandSource = {
  apps: [
    { id: 'app-chrome', name: 'Google Chrome', aliases: ['chrome', 'google chrome', 'browser'], path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { id: 'app-notepad', name: 'Notepad', aliases: ['notepad', 'text editor'], path: 'C:\\Windows\\System32\\notepad.exe' },
    { id: 'app-vscode', name: 'Visual Studio Code', aliases: ['vs code', 'vscode', 'code'], path: 'C:\\Users\\Public\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe' },
    { id: 'app-spotify', name: 'Spotify', aliases: ['spotify', 'music'], path: 'C:\\Users\\Public\\AppData\\Roaming\\Spotify\\Spotify.exe' },
    { id: 'app-calc', name: 'Calculator', aliases: ['calculator', 'calc'], path: 'C:\\Windows\\System32\\calc.exe' },
    { id: 'app-explorer', name: 'File Explorer', aliases: ['file explorer', 'explorer', 'files'], path: 'C:\\Windows\\explorer.exe' },
  ],
  websites: [
    { id: 'web-youtube', name: 'YouTube', aliases: ['youtube', 'you tube'], url: 'https://www.youtube.com' },
    { id: 'web-gmail', name: 'Gmail', aliases: ['gmail', 'g mail'], url: 'https://mail.google.com' },
    { id: 'web-github', name: 'GitHub', aliases: ['github', 'git hub'], url: 'https://github.com' },
    { id: 'web-whatsapp', name: 'WhatsApp', aliases: ['whatsapp', 'whats app'], url: 'https://web.whatsapp.com' },
  ],
  fileFolders: [
    { id: 'folder-downloads', name: 'Downloads', kind: 'folder', path: 'C:\\Users\\Public\\Downloads' },
    { id: 'folder-documents', name: 'Documents', kind: 'folder', path: 'C:\\Users\\Public\\Documents' },
  ],
}

export const CORPUS_DIR_NAME = 'benchmark/speech'
export const CORPUS_MANIFEST_NAME = 'corpus.json'

/**
 * The exact list a user must produce. Returned by the runner when no corpus is
 * present so the audit reports precisely what to collect rather than guessing.
 */
export const REQUIRED_CORPUS_COVERAGE: ReadonlyArray<{
  category: BenchmarkCategory
  description: string
  minimum: number
}> = [
  { category: 'command', description: 'Indian-English accent, normal speed', minimum: 20 },
  { category: 'command', description: 'Indian-English accent, fast and slow speech', minimum: 10 },
  { category: 'command', description: 'short and long pauses inside a sentence', minimum: 10 },
  { category: 'command', description: 'common application names (Chrome, Notepad, VS Code, Spotify)', minimum: 10 },
  { category: 'command', description: 'common website names (YouTube, Gmail, GitHub, WhatsApp)', minimum: 10 },
  { category: 'command', description: 'natural conversational requests ("can you please open...")', minimum: 10 },
  { category: 'command', description: 'samples recorded with representative background noise', minimum: 10 },
  { category: 'wake', description: '"Hey NOVA" positive samples from several distances/angles', minimum: 15 },
  { category: 'negative', description: 'non-wake speech that must not trigger ("hello nova", "hey jack", ...)', minimum: 15 },
  { category: 'noise', description: 'silence / room noise / TV that must not trigger', minimum: 10 },
]
