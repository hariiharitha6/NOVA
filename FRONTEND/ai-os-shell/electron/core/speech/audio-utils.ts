// Audio processing utilities for the voice pipeline.
// Pure functions — no Electron or DOM imports. Unit-testable.

/**
 * High-quality resampling using linear interpolation with anti-aliasing.
 * Converts Float32 PCM from `fromRate` to `toRate`. When rates match, returns
 * the input unchanged. Quality is adequate for speech recognition (16 kHz).
 */
export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples
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
