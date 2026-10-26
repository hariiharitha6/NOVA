'use strict'

// NOVA local speech benchmark recorder (Electron).
//
//   npm run benchmark:record            # interactive recorder window
//   electron scripts/speech-recorder/main.cjs --selftest   # encoder/IPC smoke test
//
// Records your own voice to benchmark/speech/samples/<id>.wav, 16 kHz mono PCM,
// using the SAME microphone constraints as the app (src/hooks/useVoiceMic.ts).
// Nothing leaves this machine: no network calls, no uploads, no Ollama. The
// window shows an explicit consent gate before the mic is ever requested, and
// recording only starts when you press Record.

const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve, sep } = require('node:path')
const { encodeWav } = require('./wav-encode.cjs')
const { derivePrompt, hintForId } = require('./prompt.cjs')

const REPO_ROOT = resolve(__dirname, '..', '..')
const CORPUS_DIR = join(REPO_ROOT, 'benchmark', 'speech')
const MANIFEST_PATH = join(CORPUS_DIR, 'corpus.json')
const SAMPLES_DIR = join(CORPUS_DIR, 'samples')
const SELFTEST = process.argv.includes('--selftest')

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return null
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    if (!parsed || !Array.isArray(parsed.samples)) return null
    return parsed
  } catch {
    return null
  }
}

/** Build the record plan the UI renders: one entry per manifest sample. */
function buildPlan() {
  const manifest = readManifest()
  if (!manifest) return { corpusReady: false, consent: false, samples: [] }
  const samples = manifest.samples.map((sample) => ({
    id: sample.id,
    file: sample.file,
    category: sample.category,
    reference: sample.reference ?? '',
    wake: sample.wake,
    noise: sample.noise,
    prompt: derivePrompt(sample),
    hint: hintForId(sample.id),
    recorded: existsSync(join(CORPUS_DIR, sample.file)),
  }))
  return { corpusReady: true, consent: manifest.consent === true, samples }
}

/** Resolve a manifest file entry to an absolute path, refusing escapes. */
function safeSamplePath(relativeFile) {
  const abs = resolve(CORPUS_DIR, relativeFile)
  if (!abs.startsWith(CORPUS_DIR + sep)) throw new Error('Refusing to write outside the corpus')
  return abs
}

ipcMain.handle('get-plan', () => buildPlan())

ipcMain.handle('save-wav', (_event, payload) => {
  const manifest = readManifest()
  if (!manifest) return { ok: false, error: 'corpus.json is missing — run npm run benchmark:corpus:init' }
  const sample = manifest.samples.find((s) => s.id === payload.id)
  if (!sample) return { ok: false, error: `Unknown sample id: ${payload.id}` }
  const samples = payload.samples instanceof Float32Array ? payload.samples : Float32Array.from(payload.samples || [])
  if (samples.length === 0) return { ok: false, error: 'Empty recording — nothing saved' }
  const wav = encodeWav(samples, payload.sampleRate || 16000)
  mkdirSync(SAMPLES_DIR, { recursive: true })
  const outPath = safeSamplePath(sample.file)
  writeFileSync(outPath, wav)
  if (manifest.consent !== true) {
    // Saving a recording is the explicit consent act (the renderer only enables
    // Record after the consent box is ticked). Persist it so scoring is allowed.
    manifest.consent = true
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  return { ok: true, path: outPath, bytes: wav.length, seconds: samples.length / (payload.sampleRate || 16000) }
})

// Encoder/IPC smoke test used by `--selftest`. Writes to the OS temp dir only.
ipcMain.handle('selftest-save', (_event, payload) => {
  const samples = payload.samples instanceof Float32Array ? payload.samples : Float32Array.from(payload.samples || [])
  const wav = encodeWav(samples, payload.sampleRate || 16000)
  const outPath = join(tmpdir(), `nova-recorder-selftest-${Date.now()}.wav`)
  writeFileSync(outPath, wav)
  const readBack = readFileSync(outPath)
  const ok =
    readBack.length === wav.length &&
    readBack.toString('ascii', 0, 4) === 'RIFF' &&
    readBack.toString('ascii', 8, 12) === 'WAVE'
  try {
    require('node:fs').rmSync(outPath, { force: true })
  } catch {
    /* ignore */
  }
  return { ok, bytes: wav.length }
})

ipcMain.on('selftest-done', (_event, summary) => {
  console.log(`[selftest] ${JSON.stringify(summary)}`)
  app.exit(summary && summary.ok ? 0 : 1)
})

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    show: !SELFTEST,
    title: 'NOVA — speech benchmark recorder',
    backgroundColor: '#0b0f1a',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(join(__dirname, 'recorder.html'), { query: SELFTEST ? { selftest: '1' } : {} })
  if (SELFTEST) {
    win.webContents.on('console-message', (_e, _level, message) => console.log(`[selftest:renderer] ${message}`))
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
