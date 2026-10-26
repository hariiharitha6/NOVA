// NOVA speech-corpus diagnostic (Phase 1/2 of the speech accuracy audit).
//
// Read-only. Never writes, uploads, or deletes audio. Reuses the REAL decoder
// (decodeWav), the REAL audio diagnostics (computeAudioDiagnostics) and the REAL
// command resolver (resolveCommand) so the report reflects production behaviour.
//
//   npx vite-node scripts/speech-diagnose.ts            # corpus + label checks
//   npx vite-node scripts/speech-diagnose.ts --stt      # also re-run STT per sample
//   npx vite-node scripts/speech-diagnose.ts --kws      # also re-run KWS per sample

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  BENCHMARK_REGISTRY,
  CORPUS_DIR_NAME,
  CORPUS_MANIFEST_NAME,
  loadManifest,
  decodeWav,
  normalizeForScoring,
  wordErrorRate,
  type BenchmarkManifest,
} from '../electron/core/speech/benchmark'
import { computeAudioDiagnostics } from '../electron/core/speech/audio-utils'
import { resolveCommand } from '../electron/core/command-engine'

const argv = process.argv.slice(2)
const args = new Set(argv)
const RUN_STT = args.has('--stt')
const RUN_KWS = args.has('--kws')
const MODEL_DIR_ARG = argv.find((a) => a.startsWith('--model-dir='))
const STT_MODEL_DIR_OVERRIDE = MODEL_DIR_ARG ? MODEL_DIR_ARG.slice('--model-dir='.length) : null
const GAIN_ARG = argv.find((a) => a.startsWith('--gain='))
const GAIN = GAIN_ARG ? Number(GAIN_ARG.slice('--gain='.length)) : 1
const RUN_KWS_SWEEP = args.has('--kws-sweep')
const RUN_KWS_PATHS = args.has('--kws-paths')

const REPO_ROOT = join(__dirname, '..')
const CORPUS_DIR = join(REPO_ROOT, CORPUS_DIR_NAME)
const MANIFEST_PATH = join(CORPUS_DIR, CORPUS_MANIFEST_NAME)
const STT_MODEL_DIR = STT_MODEL_DIR_OVERRIDE
  ? STT_MODEL_DIR_OVERRIDE
  : join(REPO_ROOT, 'resources', 'models', 'sherpa-onnx-streaming-zipformer-en-2023-06-21')
const KWS_MODEL_DIR = join(REPO_ROOT, 'resources', 'models', 'sherpa-onnx-kws-hey-nova')

interface RawHeader {
  audioFormat: number
  channels: number
  sampleRate: number
  bitsPerSample: number
  dataBytes: number
  ok: boolean
  error?: string
}

function fourCC(buffer: Buffer, offset: number): string {
  return String.fromCharCode(buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3])
}

function parseHeader(buffer: Buffer): RawHeader {
  const base: RawHeader = { audioFormat: 0, channels: 0, sampleRate: 0, bitsPerSample: 0, dataBytes: 0, ok: false }
  try {
    if (buffer.length < 12 || fourCC(buffer, 0) !== 'RIFF' || fourCC(buffer, 8) !== 'WAVE') {
      return { ...base, error: 'not RIFF/WAVE' }
    }
    let offset = 12
    while (offset + 8 <= buffer.length) {
      const id = fourCC(buffer, offset)
      const size = buffer.readUInt32LE(offset + 4)
      const body = offset + 8
      if (id === 'fmt ') {
        base.audioFormat = buffer.readUInt16LE(body)
        base.channels = buffer.readUInt16LE(body + 2)
        base.sampleRate = buffer.readUInt32LE(body + 4)
        base.bitsPerSample = buffer.readUInt16LE(body + 14)
      } else if (id === 'data') {
        base.dataBytes = Math.min(size, buffer.length - body)
      }
      offset = body + size + (size % 2)
    }
    base.ok = true
    return base
  } catch (error) {
    return { ...base, error: (error as Error).message }
  }
}

interface Row {
  id: string
  category: string
  file: string
  header: RawHeader
  decodeError?: string
  frames: number
  durationS: number
  rms: number
  peak: number
  clippingPercent: number
  silencePercent: number
  refIntact: boolean
  rerampled: boolean
}

function analyze(manifest: BenchmarkManifest): Row[] {
  const rows: Row[] = []
  for (const s of manifest.samples) {
    const p = join(CORPUS_DIR, s.file)
    const row: Row = {
      id: s.id,
      category: s.category,
      file: s.file,
      header: { audioFormat: 0, channels: 0, sampleRate: 0, bitsPerSample: 0, dataBytes: 0, ok: false },
      frames: 0,
      durationS: 0,
      rms: 0,
      peak: 0,
      clippingPercent: 0,
      silencePercent: 0,
      refIntact: true,
      rerampled: false,
    }
    if (!existsSync(p)) {
      row.decodeError = 'missing'
      rows.push(row)
      continue
    }
    const buffer = readFileSync(p)
    row.header = parseHeader(buffer)
    try {
      const decoded = decodeWav(buffer)
      row.frames = decoded.samples.length
      row.durationS = decoded.samples.length / 16000
      row.rerampled = row.header.sampleRate !== 16000 || row.header.channels !== 1
      const d = computeAudioDiagnostics(decoded.samples, 16000, 1)
      row.rms = d.rms
      row.peak = d.peak
      row.clippingPercent = d.clippingPercent
      row.silencePercent = d.silencePercent
      if (s.reference) row.refIntact = normalizeForScoring(s.reference).length > 0
    } catch (error) {
      row.decodeError = (error as Error).message
    }
    rows.push(row)
  }
  return rows
}

async function main(): Promise<void> {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`No manifest at ${MANIFEST_PATH}`)
    process.exit(2)
  }
  const manifest = loadManifest(MANIFEST_PATH)
  console.log('=== CORPUS ===')
  console.log(`manifest: ${MANIFEST_PATH}`)
  console.log(`consent: ${manifest.consent}  samples: ${manifest.samples.length}`)
  const byCat: Record<string, number> = {}
  for (const s of manifest.samples) byCat[s.category] = (byCat[s.category] ?? 0) + 1
  console.log('categories:', JSON.stringify(byCat))

  const rows = analyze(manifest)

  console.log('\n=== WAV HEADER / DECODE ===')
  const headerRates: Record<string, number> = {}
  const headerChannels: Record<string, number> = {}
  const formats: Record<string, number> = {}
  let missing = 0
  let decodeErrors = 0
  for (const r of rows) {
    if (r.decodeError === 'missing') {
      missing++
      continue
    }
    if (r.decodeError) decodeErrors++
    headerRates[String(r.header.sampleRate)] = (headerRates[String(r.header.sampleRate)] ?? 0) + 1
    headerChannels[String(r.header.channels)] = (headerChannels[String(r.header.channels)] ?? 0) + 1
    formats[`fmt${r.header.audioFormat}/${r.header.bitsPerSample}bit`] =
      (formats[`fmt${r.header.audioFormat}/${r.header.bitsPerSample}bit`] ?? 0) + 1
  }
  console.log('missing files:', missing, ' decode errors:', decodeErrors)
  console.log('header sample rates:', JSON.stringify(headerRates))
  console.log('header channels:', JSON.stringify(headerChannels))
  console.log('formats:', JSON.stringify(formats))

  console.log('\n=== DURATION / LEVEL (seconds, rms, peak, clip%, silence%) ===')
  const sorted = [...rows].filter((r) => !r.decodeError).sort((a, b) => a.durationS - b.durationS)
  const shortest = sorted.slice(0, 8)
  const longest = sorted.slice(-8)
  const printRow = (r: Row) =>
    `${r.id.padEnd(18)} ${r.category.padEnd(8)} dur=${r.durationS.toFixed(2)}s rms=${r.rms.toFixed(4)} peak=${r.peak.toFixed(3)} clip=${r.clippingPercent.toFixed(2)}% sil=${r.silencePercent.toFixed(0)}% rate=${r.header.sampleRate} ch=${r.header.channels}`
  console.log('-- shortest --')
  shortest.forEach((r) => console.log(printRow(r)))
  console.log('-- longest --')
  longest.forEach((r) => console.log(printRow(r)))

  const nearSilent = rows.filter((r) => !r.decodeError && r.rms < 0.005)
  const lowPeak = rows.filter((r) => !r.decodeError && r.peak < 0.05)
  const clipped = rows.filter((r) => !r.decodeError && r.clippingPercent > 0.5)
  const veryShort = rows.filter((r) => !r.decodeError && r.durationS < 0.4)
  console.log(`\nnear-silent (rms<0.005): ${nearSilent.length}`, nearSilent.map((r) => `${r.id}(${r.rms.toFixed(4)})`).join(', '))
  console.log(`low-peak (peak<0.05): ${lowPeak.length}`, lowPeak.map((r) => r.id).join(', '))
  console.log(`clipped (>0.5%): ${clipped.length}`, clipped.map((r) => `${r.id}(${r.clippingPercent.toFixed(1)}%)`).join(', '))
  console.log(`very short (<0.4s): ${veryShort.length}`, veryShort.map((r) => `${r.id}(${r.durationS.toFixed(2)}s)`).join(', '))

  // Per-category duration stats
  console.log('\n=== PER-CATEGORY DURATION ===')
  for (const cat of ['command', 'wake', 'negative', 'noise']) {
    const ds = rows.filter((r) => r.category === cat && !r.decodeError).map((r) => r.durationS)
    if (!ds.length) continue
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length
    console.log(`  ${cat.padEnd(8)} n=${ds.length} mean=${mean.toFixed(2)}s min=${Math.min(...ds).toFixed(2)}s max=${Math.max(...ds).toFixed(2)}s`)
  }

  // Label self-consistency: does the engine's own resolver reproduce the manifest labels?
  console.log('\n=== LABEL SELF-CONSISTENCY (resolveCommand(reference) vs expected) ===')
  let labelOk = 0
  let labelBad = 0
  for (const s of manifest.samples) {
    if (s.category !== 'command' || !s.expected) continue
    const action = resolveCommand(s.reference, BENCHMARK_REGISTRY)
    const intentOk = action.intent === s.expected.intent
    const targetOk = s.expected.target === undefined || action.label === s.expected.target
    if (intentOk && targetOk) labelOk++
    else {
      labelBad++
      console.log(`  MISMATCH ${s.id}: "${s.reference}" expected=${s.expected.intent}${s.expected.target ? ' -> ' + s.expected.target : ''} got=${action.intent}${action.label ? ' -> ' + action.label : ''}`)
    }
  }
  console.log(`  labels ok: ${labelOk}  mismatched: ${labelBad}`)

  if (RUN_STT) {
    console.log(`\n=== STT RE-RUN (per command sample) model=${STT_MODEL_DIR} gain=${GAIN} ===`)
    const { SherpaSpeechRecognizer } = await import('../electron/core/speech/sherpa-recognizer')
    const { CHUNK_SAMPLES, TARGET_SAMPLE_RATE } = await import('../electron/core/speech/constants')
    const rec = new SherpaSpeechRecognizer({ modelDir: STT_MODEL_DIR, sampleRate: TARGET_SAMPLE_RATE })
    rec.initialize()
    const applyGain = (input: Float32Array): Float32Array => {
      if (GAIN === 1) return input
      const out = new Float32Array(input.length)
      for (let i = 0; i < input.length; i++) out[i] = Math.max(-1, Math.min(1, input[i] * GAIN))
      return out
    }
    let dist = 0
    let refWords = 0
    let exact = 0
    let n = 0
    for (const s of manifest.samples) {
      // Transcribe commands (scored) and wake/negative (content inspection only).
      if (s.category === 'noise') continue
      const p = join(CORPUS_DIR, s.file)
      if (!existsSync(p)) continue
      const samplesA = applyGain(decodeWav(readFileSync(p)).samples)
      rec.start()
      for (let i = 0; i < samplesA.length; i += CHUNK_SAMPLES) rec.acceptAudio(samplesA.subarray(i, i + CHUNK_SAMPLES))
      const hyp = rec.finishAndGetTranscript()
      if (s.category === 'command') {
        const wer = wordErrorRate(s.reference, hyp)
        dist += wer.distance
        refWords += wer.refWords
        n++
        if (normalizeForScoring(s.reference) === normalizeForScoring(hyp)) exact++
        console.log(`  ${s.id.padEnd(16)} [cmd] ref="${s.reference}" hyp="${hyp}" wer=${wer.wer.toFixed(2)}`)
      } else {
        console.log(`  ${s.id.padEnd(16)} [${s.category}] ref="${s.reference}" hyp="${hyp}"`)
      }
    }
    rec.dispose()
    console.log(`STT micro-WER=${(dist / (refWords || 1)).toFixed(4)} exact=${(exact / (n || 1)).toFixed(4)} n=${n}`)
  }

  if (RUN_KWS) {
    console.log('\n=== KWS RE-RUN (wake/negative/noise) ===')
    const { SherpaKeywordSpotter } = await import('../electron/core/speech/sherpa-kws')
    const { KWS_CHUNK_SAMPLES, TARGET_SAMPLE_RATE, DEFAULT_WAKE_PHRASE } = await import('../electron/core/speech/constants')
    const spot = new SherpaKeywordSpotter({ modelDir: KWS_MODEL_DIR, sampleRate: TARGET_SAMPLE_RATE })
    spot.setPhrase(DEFAULT_WAKE_PHRASE)
    spot.initialize()
    for (const s of manifest.samples) {
      if (s.category === 'command') continue
      const p = join(CORPUS_DIR, s.file)
      if (!existsSync(p)) continue
      const samplesA = decodeWav(readFileSync(p)).samples
      spot.start()
      let detected = false
      for (let i = 0; i < samplesA.length; i += KWS_CHUNK_SAMPLES) {
        spot.acceptAudio(samplesA.subarray(i, i + KWS_CHUNK_SAMPLES))
        if (spot.isDetected()) {
          detected = true
          break
        }
      }
      spot.reset()
      const actual = s.wake ?? s.category === 'wake'
      console.log(`  ${s.id.padEnd(16)} ${s.category.padEnd(8)} dur=${(samplesA.length / 16000).toFixed(2)}s detected=${detected} expected=${actual}`)
    }
    spot.dispose()
  }

  if (RUN_KWS_SWEEP) {
    console.log('\n=== KWS THRESHOLD / BOOST SWEEP (recall vs false-trigger) ===')
    const { buildKwsConfig } = await import('../electron/core/speech/sherpa-kws')
    const { KWS_FEATURE_DIM, KWS_CHUNK_SAMPLES, TARGET_SAMPLE_RATE } = await import(
      '../electron/core/speech/constants'
    )
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sherpa = require('sherpa-onnx') as { createKws: (c: Record<string, unknown>) => any }
    const modelFiles = {
      encoder: join(KWS_MODEL_DIR, 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
      decoder: join(KWS_MODEL_DIR, 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'),
      joiner: join(KWS_MODEL_DIR, 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
      tokens: join(KWS_MODEL_DIR, 'tokens.txt'),
      bpeVocab: join(KWS_MODEL_DIR, 'bpe.model'),
    }
    const items = manifest.samples
      .filter((s) => s.category !== 'command' && existsSync(join(CORPUS_DIR, s.file)))
      .map((s) => ({
        id: s.id,
        wake: (s.wake ?? s.category === 'wake') as boolean,
        data: decodeWav(readFileSync(join(CORPUS_DIR, s.file))).samples,
      }))
    const thresholds = [0.6, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05, 0.0]
    const boosts = [1.0, 1.2, 2.0]
    for (const boost of boosts) {
      for (const th of thresholds) {
        const line = `▁HE Y ▁NO V A :${boost} #${th}`
        const config = buildKwsConfig({
          sampleRate: TARGET_SAMPLE_RATE,
          featureDim: KWS_FEATURE_DIM,
          ...modelFiles,
          keywords: line,
        })
        let kws: any
        try {
          kws = sherpa.createKws(config)
        } catch (error) {
          console.log(`boost=${boost} th=${th} createKws FAILED: ${(error as Error).message}`)
          continue
        }
        const detect = (data: Float32Array): boolean => {
          const stream = kws.createStream()
          let det = false
          for (let i = 0; i < data.length; i += KWS_CHUNK_SAMPLES) {
            stream.acceptWaveform(TARGET_SAMPLE_RATE, data.subarray(i, i + KWS_CHUNK_SAMPLES))
            while (kws.isReady(stream)) kws.decode(stream)
            const r = kws.getResult(stream)
            if (r && typeof r.keyword === 'string' && r.keyword.length > 0) {
              det = true
              break
            }
          }
          stream.free()
          return det
        }
        let tp = 0
        let fn = 0
        let fp = 0
        let tn = 0
        const rec: string[] = []
        const bad: string[] = []
        for (const it of items) {
          const got = detect(it.data)
          if (it.wake && got) {
            tp++
            rec.push(it.id)
          } else if (it.wake) fn++
          else if (got) {
            fp++
            bad.push(it.id)
          } else tn++
        }
        console.log(
          `boost=${boost.toFixed(1)} th=${th.toFixed(2)} TP=${tp} FN=${fn} FP=${fp} TN=${tn} recall=${(tp / (tp + fn || 1)).toFixed(3)} recovered=[${rec.join(',')}] false=[${bad.join(',')}]`,
        )
        try {
          kws.free()
        } catch {
          // ignore
        }
      }
    }
  }

  if (RUN_KWS_PATHS) {
    console.log('\n=== KWS BEAM-WIDTH SWEEP (maxActivePaths) ===')
    const { buildKwsConfig } = await import('../electron/core/speech/sherpa-kws')
    const { KWS_FEATURE_DIM, KWS_CHUNK_SAMPLES, TARGET_SAMPLE_RATE } = await import(
      '../electron/core/speech/constants'
    )
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sherpa = require('sherpa-onnx') as { createKws: (c: Record<string, unknown>) => any }
    const modelFiles = {
      encoder: join(KWS_MODEL_DIR, 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
      decoder: join(KWS_MODEL_DIR, 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'),
      joiner: join(KWS_MODEL_DIR, 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
      tokens: join(KWS_MODEL_DIR, 'tokens.txt'),
      bpeVocab: join(KWS_MODEL_DIR, 'bpe.model'),
    }
    const items = manifest.samples
      .filter((s) => s.category !== 'command' && existsSync(join(CORPUS_DIR, s.file)))
      .map((s) => ({
        id: s.id,
        wake: (s.wake ?? s.category === 'wake') as boolean,
        data: decodeWav(readFileSync(join(CORPUS_DIR, s.file))).samples,
      }))
    for (const paths of [4, 8, 16, 32, 64]) {
      for (const th of [0.25, 0.15, 0.05]) {
        const line = `▁HE Y ▁NO V A :1.2 #${th}`
        const config = buildKwsConfig({
          sampleRate: TARGET_SAMPLE_RATE,
          featureDim: KWS_FEATURE_DIM,
          ...modelFiles,
          keywords: line,
        })
        config.maxActivePaths = paths
        let kws: any
        try {
          kws = sherpa.createKws(config)
        } catch (error) {
          console.log(`paths=${paths} th=${th} createKws FAILED: ${(error as Error).message}`)
          continue
        }
        const detect = (data: Float32Array): boolean => {
          const stream = kws.createStream()
          let det = false
          for (let i = 0; i < data.length; i += KWS_CHUNK_SAMPLES) {
            stream.acceptWaveform(TARGET_SAMPLE_RATE, data.subarray(i, i + KWS_CHUNK_SAMPLES))
            while (kws.isReady(stream)) kws.decode(stream)
            const r = kws.getResult(stream)
            if (r && typeof r.keyword === 'string' && r.keyword.length > 0) {
              det = true
              break
            }
          }
          stream.free()
          return det
        }
        let tp = 0
        let fn = 0
        let fp = 0
        let tn = 0
        const rec: string[] = []
        const bad: string[] = []
        for (const it of items) {
          const got = detect(it.data)
          if (it.wake && got) {
            tp++
            rec.push(it.id.replace('wake-pos-', ''))
          } else if (it.wake) fn++
          else if (got) {
            fp++
            bad.push(it.id)
          } else tn++
        }
        console.log(
          `paths=${paths} th=${th.toFixed(2)} TP=${tp} FN=${fn} FP=${fp} TN=${tn} recall=${(tp / (tp + fn || 1)).toFixed(3)} recovered=[${rec.join(',')}] false=[${bad.join(',')}]`,
        )
        try {
          kws.free()
        } catch {
          // ignore
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
