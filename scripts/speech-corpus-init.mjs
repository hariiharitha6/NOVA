// Generate the local speech benchmark corpus skeleton.
//
//   npm run benchmark:corpus:init            # create if missing
//   npm run benchmark:corpus:init -- --force # overwrite an existing skeleton
//
// Produces, inside benchmark/speech/ (gitignored):
//   corpus.json    the exact manifest schema the harness validates
//   RECORDING.md   the human recording instructions + coverage checklist
//   samples/       empty directory you record .wav files into
//
// This script only writes the *skeleton*: no audio, no measured results, and
// consent is required before the harness will ever score anything. It never
// records or uploads.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { CORPUS_NOTES, CORPUS_SAMPLES, COVERAGE_BUCKETS } = require('./corpus-template.cjs')

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const corpusDir = join(repoRoot, 'benchmark', 'speech')
const samplesDir = join(corpusDir, 'samples')
const manifestPath = join(corpusDir, 'corpus.json')
const readmePath = join(corpusDir, 'RECORDING.md')

const force = process.argv.includes('--force')

function promptFor(sample) {
  if (sample.category === 'wake') return 'Say the wake phrase: "Hey NOVA"'
  if (sample.category === 'noise') return `Do NOT speak — record ${sample.noise} only`
  if (sample.category === 'negative') return `Say clearly (must NOT wake): "${sample.reference}"`
  return sample.reference
}

function expectedFor(sample) {
  if (!sample.expected) return '—'
  const target = sample.expected.target ? ` → ${sample.expected.target}` : ''
  return `${sample.expected.intent}${target}`
}

function buildRecordingMarkdown() {
  const lines = []
  lines.push('# NOVA speech benchmark — recording instructions')
  lines.push('')
  lines.push('All audio stays on this machine. Nothing is uploaded, and no recording is')
  lines.push('sent to Ollama or any external API. Files live under `benchmark/speech/`,')
  lines.push('which git ignores. Delete every trace with `npm run speech:corpus:remove`.')
  lines.push('')
  lines.push('## How to record')
  lines.push('')
  lines.push('1. `npm run benchmark:corpus:init` (creates this file and `corpus.json`).')
  lines.push('2. `npm run benchmark:record` — opens the recorder. Tick the consent box,')
  lines.push('   press Record, speak the prompt, press Stop. It auto-saves the next sample.')
  lines.push('   (Any app that writes 16 kHz mono WAV works too, as long as the file name')
  lines.push('   matches the table below.)')
  lines.push('3. When all files exist: `npm run benchmark:speech`.')
  lines.push('4. Results are written to `benchmark/speech/results.json`.')
  lines.push('')
  lines.push('Record in one sitting if possible, in your normal room, with the same mic')
  lines.push('you use with NOVA. Keep the default speech-optimised constraints on.')
  lines.push('')
  lines.push('## Coverage checklist')
  lines.push('')
  lines.push('| Bucket | Samples | Minimum |')
  lines.push('| --- | ---: | ---: |')
  for (const bucket of COVERAGE_BUCKETS) {
    const count = CORPUS_SAMPLES.filter((s) => bucket.prefixes.some((p) => s.id.startsWith(p))).length
    lines.push(`| ${bucket.match} | ${count} | ${bucket.minimum} |`)
  }
  lines.push('')
  lines.push('## Sample-by-sample plan')
  lines.push('')
  lines.push('| File | Say / do | Ground-truth transcript | Expected command |')
  lines.push('| --- | --- | --- | --- |')
  for (const sample of CORPUS_SAMPLES) {
    const transcript = sample.reference ? `\`${sample.reference}\`` : '_(none)_'
    lines.push(`| \`${sample.file}\` | ${promptFor(sample)} | ${transcript} | ${expectedFor(sample)} |`)
  }
  lines.push('')
  lines.push('> Bucket notes: `cmd-pause-*` — insert a clear 0.5–1.5 s pause in the middle.')
  lines.push('> `cmd-noisy-*` — start the background sound first, then speak over it.')
  lines.push('> `wake-pos-*` — vary distance and angle across the 15 takes.')
  lines.push('> `noise-*` — stay silent; record only the named sound.')
  lines.push('')
  return lines.join('\n')
}

mkdirSync(samplesDir, { recursive: true })

if (existsSync(manifestPath) && !force) {
  console.log(`Corpus already exists: ${manifestPath}`)
  console.log('Refusing to overwrite recorded labels. Re-run with --force to regenerate.')
  console.log(`Recording instructions: ${readmePath}`)
  process.exit(0)
}

const manifest = {
  version: 1,
  // The skeleton is generated without a user consent action. `npm run
  // benchmark:record` flips this to true the first time you save a recording.
  consent: false,
  notes: CORPUS_NOTES,
  samples: CORPUS_SAMPLES,
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(readmePath, `${buildRecordingMarkdown()}\n`)

const counts = CORPUS_SAMPLES.reduce((acc, s) => {
  acc[s.category] = (acc[s.category] ?? 0) + 1
  return acc
}, {})

console.log(`Wrote corpus skeleton: ${manifestPath}`)
console.log(`Wrote instructions:    ${readmePath}`)
console.log(`Samples directory:     ${samplesDir}`)
console.log(`Samples by category:   ${JSON.stringify(counts)} (${CORPUS_SAMPLES.length} total)`)
console.log('Next: npm run benchmark:record')
