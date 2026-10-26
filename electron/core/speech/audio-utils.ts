// Audio processing utilities for the voice pipeline.
// Pure functions — no Electron or DOM imports. Unit-testable.

/**
 * Resample Float32 PCM from `fromRate` to `toRate`. When rates match, returns
 * the input unchanged.
 *
 * Downsampling first applies an anti-aliasing low-pass (a box average over the
 * input samples that overlap each output interval). Plain decimation without
 * this step folds energy above the new Nyquist frequency back into the speech
 * band as noise — worst at 48 kHz → 16 kHz, the common Windows microphone case.
 * Upsampling uses linear interpolation (no aliasing is introduced by upsampling).
 */
export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples
  if (samples.length === 0) return samples
  if (fromRate > toRate) return downsampleAntiAliased(samples, fromRate, toRate)
  return upsampleLinear(samples, fromRate, toRate)
}

/**
 * Aliasing-resistant decimation: each output sample is the weighted average of
 * the input samples whose unit intervals overlap `[i*ratio, (i+1)*ratio)`.
 * For an integer ratio this is an exact box average (e.g. 3:1 averages triples).
 */
function downsampleAntiAliased(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  const ratio = fromRate / toRate
  const outLen = Math.round(samples.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const start = i * ratio
    const end = Math.min((i + 1) * ratio, samples.length)
    let sum = 0
    let weight = 0
    for (let j = Math.floor(start); j < end; j++) {
      const overlap = Math.min(end, j + 1) - Math.max(start, j)
      if (overlap > 0) {
        sum += (samples[j] ?? 0) * overlap
        weight += overlap
      }
    }
    out[i] = weight > 0 ? sum / weight : samples[Math.min(samples.length - 1, Math.floor(start))] ?? 0
  }
  return out
}

/** Linear-interpolation upsampling (`fromRate` < `toRate`). */
function upsampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  const ratio = fromRate / toRate
  const outLen = Math.round(samples.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio
    const idx = Math.floor(srcIdx)
    const frac = srcIdx - idx
    if (idx + 1 < samples.length) {
      out[i] = samples[idx] * (1 - frac) + samples[idx + 1] * frac
    } else {
      out[i] = samples[idx] ?? 0
    }
  }
  return out
}

/**
 * Downmix multi-channel audio to mono by averaging all channels.
 * Input layout: [L0, R0, L1, R1, ...] for stereo, or [C0, C1, ...] for mono.
 */
export function downmixToMono(
  samples: Float32Array,
  channels: number,
): Float32Array {
  if (channels <= 1) return samples
  const frames = Math.floor(samples.length / channels)
  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let ch = 0; ch < channels; ch++) {
      sum += samples[i * channels + ch]
    }
    mono[i] = sum / channels
  }
  return mono
}

/** Lightweight audio diagnostics for development/testing. */
export interface AudioDiagnostics {
  sampleRate: number
  channels: number
  rms: number
  peak: number
  clippingPercent: number
  silencePercent: number
  chunkCount: number
}

const SILENCE_THRESHOLD = 0.01

/** Compute diagnostics from a single Float32 audio chunk. */
export function computeAudioDiagnostics(
  samples: Float32Array,
  sampleRate: number,
  channels: number,
): AudioDiagnostics {
  let sumSquares = 0
  let peak = 0
  let clipping = 0
  let silent = 0
  const len = samples.length
  for (let i = 0; i < len; i++) {
    const v = Math.abs(samples[i])
    sumSquares += samples[i] * samples[i]
    if (v > peak) peak = v
    if (v >= 0.99) clipping++
    if (v < SILENCE_THRESHOLD) silent++
  }
  return {
    sampleRate,
    channels,
    rms: Math.sqrt(sumSquares / (len || 1)),
    peak,
    clippingPercent: len > 0 ? (clipping / len) * 100 : 0,
    silencePercent: len > 0 ? (silent / len) * 100 : 0,
    chunkCount: 1,
  }
}
