'use strict'

// Minimal, dependency-free WAV encoder (16-bit signed PCM, little-endian).
// Produces mono files the benchmark loader (decodeWav in
// electron/core/speech/benchmark.ts) reads back losslessly.

const HEADER_BYTES = 44

/** Clamp a float sample to [-1, 1] and quantise to signed 16-bit. */
function toInt16(value) {
  const clamped = Math.max(-1, Math.min(1, value))
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
}

/**
 * Encode mono Float32 samples as a 16-bit PCM WAV.
 * @param {Float32Array|number[]} samples mono samples in [-1, 1]
 * @param {number} sampleRate samples per second
 * @returns {Buffer}
 */
function encodeWav(samples, sampleRate) {
  const count = samples.length
  const dataBytes = count * 2
  const buffer = Buffer.alloc(HEADER_BYTES + dataBytes)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // fmt chunk size (PCM)
  buffer.writeUInt16LE(1, 20) // audio format 1 = PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)

  for (let i = 0; i < count; i++) {
    buffer.writeInt16LE(toInt16(samples[i]), HEADER_BYTES + i * 2)
  }
  return buffer
}

module.exports = { encodeWav, toInt16, HEADER_BYTES }
