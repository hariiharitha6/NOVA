import { describe, expect, it } from 'vitest'
import { resample, downmixToMono, computeAudioDiagnostics } from '../electron/core/speech/audio-utils'

describe('audio-utils', () => {
  describe('resample', () => {
    it('returns input unchanged when rates match', () => {
      const input = new Float32Array([1, 2, 3, 4])
      const output = resample(input, 16000, 16000)
      expect(output).toBe(input)
    })

    it('downsamples from 48 kHz to 16 kHz (3:1)', () => {
      const input = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1])
      const output = resample(input, 48000, 16000)
      expect(output.length).toBe(4)
      expect(output[0]).toBeCloseTo(0)
      expect(output[1]).toBeCloseTo(1)
      expect(output[2]).toBeCloseTo(0)
      expect(output[3]).toBeCloseTo(1)
    })

    it('upsamples from 8 kHz to 16 kHz (1:2)', () => {
      const input = new Float32Array([0, 0.5, 1])
      const output = resample(input, 8000, 16000)
      expect(output.length).toBe(6)
      expect(output[0]).toBeCloseTo(0)
      expect(output[5]).toBeCloseTo(1)
    })

    it('preserves signal shape through 44100→16000', () => {
      // Generate a simple 1-second sine-ish signal at 44100 Hz
      const len = 44100
      const input = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        input[i] = Math.sin((2 * Math.PI * 440 * i) / 44100)
      }
      const output = resample(input, 44100, 16000)
      expect(output.length).toBeCloseTo(16000, 0)
      // Output should still have energy (not all zeros)
      let energy = 0
      for (let i = 0; i < output.length; i++) energy += output[i] * output[i]
      expect(energy).toBeGreaterThan(0)
    })

    it('handles empty input', () => {
      const input = new Float32Array(0)
      const output = resample(input, 48000, 16000)
      expect(output.length).toBe(0)
    })

    it('handles single-sample input (downsample)', () => {
      const input = new Float32Array([0.5])
      const output = resample(input, 16000, 48000)
      expect(output.length).toBe(3)
      expect(output[0]).toBeCloseTo(0.5)
    })

    it('handles short input (upsample)', () => {
      const input = new Float32Array([0.5, 0.8])
      const output = resample(input, 8000, 16000)
      expect(output.length).toBe(4)
    })
  })

  describe('downmixToMono', () => {
    it('returns input unchanged for mono', () => {
      const input = new Float32Array([1, 2, 3])
      const output = downmixToMono(input, 1)
      expect(output).toBe(input)
    })

    it('averages stereo channels', () => {
      // Stereo: [L0, R0, L1, R1]
      const input = new Float32Array([1, 3, 2, 4])
      const output = downmixToMono(input, 2)
      expect(output.length).toBe(2)
      expect(output[0]).toBe(2) // (1+3)/2
      expect(output[1]).toBe(3) // (2+4)/2
    })

    it('handles identical stereo channels', () => {
      const input = new Float32Array([5, 5, 5, 5])
      const output = downmixToMono(input, 2)
      expect(output[0]).toBe(5)
      expect(output[1]).toBe(5)
    })
  })

  describe('computeAudioDiagnostics', () => {
    it('detects silence', () => {
      const samples = new Float32Array(100) // all zeros
      const diag = computeAudioDiagnostics(samples, 16000, 1)
      expect(diag.rms).toBe(0)
      expect(diag.peak).toBe(0)
      expect(diag.silencePercent).toBe(100)
      expect(diag.clippingPercent).toBe(0)
    })

    it('detects clipping', () => {
      const samples = new Float32Array(100).fill(1.0)
      const diag = computeAudioDiagnostics(samples, 16000, 1)
      expect(diag.clippingPercent).toBe(100)
    })

    it('reports correct RMS for known signal', () => {
      // RMS of [1, -1] is 1.0
      const samples = new Float32Array([1, -1])
      const diag = computeAudioDiagnostics(samples, 16000, 1)
      expect(diag.rms).toBeCloseTo(1.0)
      expect(diag.peak).toBe(1.0)
    })

    it('reports correct sample rate and channels', () => {
      const samples = new Float32Array(100)
      const diag = computeAudioDiagnostics(samples, 48000, 2)
      expect(diag.sampleRate).toBe(48000)
      expect(diag.channels).toBe(2)
    })

    it('handles empty input', () => {
      const samples = new Float32Array(0)
      const diag = computeAudioDiagnostics(samples, 16000, 1)
      expect(diag.rms).toBe(0)
      expect(diag.peak).toBe(0)
    })
  })
})
