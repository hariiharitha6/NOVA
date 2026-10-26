'use strict'

// Renderer for the local speech benchmark recorder. Talks to the main process
// only through the `window.recorder` bridge (see preload.cjs). Captures the mic
// with the SAME constraints the app uses (echoCancellation, noiseSuppression,
// autoGainControl, mono, ideal 16 kHz), then saves 16 kHz mono PCM WAV.

const TARGET_SAMPLE_RATE = 16000
const MAX_RECORDING_MS = 15000
const CHUNK = 4096

const el = (id) => document.getElementById(id)

const state = {
  corpusReady: false,
  consent: false,
  samples: [],
  index: 0,
  recording: false,
  chunks: [],
  ctx: null,
  stream: null,
  source: null,
  processor: null,
  mute: null,
  timer: null,
  actualRate: TARGET_SAMPLE_RATE,
  channels: 1,
}

function pendingIndex(from = 0) {
  for (let i = from; i < state.samples.length; i++) if (!state.samples[i].recorded) return i
  for (let i = 0; i < state.samples.length; i++) if (!state.samples[i].recorded) return i
  return from
}

function updateProgress() {
  const done = state.samples.filter((s) => s.recorded).length
  el('progress').textContent = `${done} / ${state.samples.length} recorded`
}

function renderList() {
  const list = el('list')
  list.innerHTML = ''
  state.samples.forEach((sample, i) => {
    const row = document.createElement('div')
    row.className = 'item' + (i === state.index ? ' active' : '')
    row.innerHTML =
      `<span class="id">${sample.id}</span>` +
      `<span class="ref">${escapeHtml(sample.prompt || sample.hint || '')}</span>` +
      `<span class="badge ${sample.recorded ? 'done' : 'todo'}">${sample.recorded ? 'done' : 'todo'}</span>`
    row.addEventListener('click', () => {
      if (state.recording) return
      state.index = i
      renderCurrent()
      renderList()
    })
    list.appendChild(row)
  })
  updateProgress()
}

function renderCurrent() {
  const sample = state.samples[state.index]
  if (!sample) {
    el('cur-id').textContent = '—'
    el('cur-prompt').textContent = 'No sample selected.'
    el('cur-hint').textContent = ''
    return
  }
  el('cur-id').textContent = `${sample.id}  (${sample.category}${sample.noise ? ' · ' + sample.noise : ''})`
  el('cur-prompt').textContent = sample.prompt ? `Say: \u201C${sample.prompt}\u201D` : 'Do not speak.'
  el('cur-hint').textContent = sample.hint
  const item = el('list').children[state.index]
  if (item) item.scrollIntoView({ block: 'nearest' })
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function setControlsEnabled() {
  const ready = state.corpusReady && state.consent && state.samples.length > 0
  el('record').disabled = !ready && !state.recording
  el('skip').disabled = !ready || state.recording
}

function setStatus(text, warn = false) {
  const node = el('status')
  node.textContent = text
  node.className = 'status' + (warn ? ' warn' : '')
}

function updateMeter(rms) {
  const pct = Math.min(100, Math.round(rms * 400))
  el('meter-fill').style.width = `${pct}%`
}

async function startRecording() {
  const sample = state.samples[state.index]
  if (!sample) return
  setStatus('Requesting microphone…')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: TARGET_SAMPLE_RATE },
      },
      video: false,
    })
    const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    await ctx.resume()
    const track = stream.getAudioTracks()[0]
    const settings = track && track.getSettings ? track.getSettings() : {}
    const channels = Math.min(2, Math.max(1, settings.channelCount || 1))

    const source = ctx.createMediaStreamSource(stream)
    const processor = ctx.createScriptProcessor(CHUNK, channels, 1)
    const mute = ctx.createGain()
    mute.gain.value = 0

    state.chunks = []
    state.ctx = ctx
    state.stream = stream
    state.source = source
    state.processor = processor
    state.mute = mute
    state.actualRate = ctx.sampleRate
    state.channels = channels

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer
      const frames = input.length
      if (input.numberOfChannels === 1) {
        state.chunks.push(new Float32Array(input.getChannelData(0)))
      } else {
        const mono = new Float32Array(frames)
        for (let ch = 0; ch < input.numberOfChannels; ch++) {
          const data = input.getChannelData(ch)
          for (let i = 0; i < frames; i++) mono[i] += data[i] / input.numberOfChannels
        }
        state.chunks.push(mono)
      }
      let sum = 0
      const last = state.chunks[state.chunks.length - 1]
      for (let i = 0; i < last.length; i++) sum += last[i] * last[i]
      updateMeter(Math.sqrt(sum / (last.length || 1)))
    }

    source.connect(processor)
    processor.connect(mute)
    mute.connect(ctx.destination)

    state.recording = true
    el('record').textContent = 'Stop'
    el('record').classList.add('recording')
    setStatus('Recording… speak now.')
    setControlsEnabled()
    state.timer = setTimeout(() => stopRecording(), MAX_RECORDING_MS)
  } catch (error) {
    setStatus(`Microphone error: ${error.message}`, true)
    cleanupAudio()
  }
}

function cleanupAudio() {
  if (state.timer) clearTimeout(state.timer)
  state.timer = null
  try {
    if (state.processor) state.processor.disconnect()
    if (state.source) state.source.disconnect()
    if (state.mute) state.mute.disconnect()
  } catch {
    /* ignore */
  }
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop())
  if (state.ctx && state.ctx.state !== 'closed') state.ctx.close().catch(() => {})
  state.processor = null
  state.source = null
  state.mute = null
  state.stream = null
  state.ctx = null
  updateMeter(0)
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.round(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const idx = Math.floor(src)
    const frac = src - idx
    out[i] = idx + 1 < input.length ? input[idx] * (1 - frac) + input[idx + 1] * frac : input[idx] || 0
  }
  return out
}

async function stopRecording() {
  if (!state.recording) return
  state.recording = false
  el('record').textContent = 'Record'
  el('record').classList.remove('recording')
  if (state.timer) clearTimeout(state.timer)
  state.timer = null

  const sample = state.samples[state.index]
  const chunks = state.chunks
  const actualRate = state.actualRate
  cleanupAudio()
  setControlsEnabled()

  let total = 0
  for (const c of chunks) total += c.length
  if (total === 0) {
    setStatus('Nothing recorded (mic produced no audio).', true)
    return
  }
  const combined = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    combined.set(c, offset)
    offset += c.length
  }
  const mono = resampleLinear(combined, actualRate, TARGET_SAMPLE_RATE)
  const res = await window.recorder.saveWav({ id: sample.id, samples: mono, sampleRate: TARGET_SAMPLE_RATE })
  if (!res || !res.ok) {
    setStatus(`Save failed: ${res ? res.error : 'unknown error'}`, true)
    return
  }
  sample.recorded = true
  setStatus(`Saved ${res.seconds.toFixed(1)}s → ${sample.file}`)
  state.index = pendingIndex(state.index + 1)
  renderList()
  renderCurrent()
}

async function runSelftest() {
  const synthetic = new Float32Array(TARGET_SAMPLE_RATE) // 1 s
  for (let i = 0; i < synthetic.length; i++) synthetic[i] = Math.sin((2 * Math.PI * 440 * i) / TARGET_SAMPLE_RATE) * 0.5
  try {
    const res = await window.recorder.selftestSave({ samples: synthetic, sampleRate: TARGET_SAMPLE_RATE })
    window.recorder.selftestDone({ ok: !!res.ok, bytes: res.bytes })
  } catch (error) {
    window.recorder.selftestDone({ ok: false, error: String(error) })
  }
}

async function init() {
  const params = new URLSearchParams(location.search)
  if (params.get('selftest') === '1') {
    await runSelftest()
    return
  }

  const plan = await window.recorder.getPlan()
  state.corpusReady = plan.corpusReady
  state.consent = plan.consent
  el('consent').checked = plan.consent
  state.samples = plan.samples
  state.index = pendingIndex(0)

  if (!plan.corpusReady) {
    el('cur-prompt').textContent = 'No corpus.json found.'
    el('cur-hint').textContent = 'Run  npm run benchmark:corpus:init  first.'
    setStatus('Corpus missing.', true)
    return
  }

  el('consent').addEventListener('change', (e) => {
    state.consent = e.target.checked
    setControlsEnabled()
  })
  el('record').addEventListener('click', () => {
    if (state.recording) stopRecording()
    else if (state.consent) startRecording()
  })
  el('skip').addEventListener('click', () => {
    state.index = pendingIndex(state.index + 1)
    renderList()
    renderCurrent()
  })

  renderList()
  renderCurrent()
  setControlsEnabled()
}

window.addEventListener('DOMContentLoaded', init)
