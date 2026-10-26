import { describe, expect, it } from 'vitest'
import {
  normalizeForScoring,
  tokenizeForScoring,
  wordEditDistance,
  wordErrorRate,
  exactTranscriptMatch,
  summarizeTranscripts,
  summarizeIntent,
  latencySummary,
  summarizeWake,
  parseManifest,
  decodeWav,
  BENCHMARK_REGISTRY,
  CORPUS_MANIFEST_NAME,
} from '../electron/core/speech/benchmark'

describe('speech-benchmark metrics', () => {
  describe('normalizeForScoring', () => {
    it('lowercases, strips punctuation, collapses whitespace', () => {
      expect(normalizeForScoring('  Open   Chrome, please! ')).toBe('open chrome please')
    })

    it('keeps intra-word apostrophes', () => {
      expect(normalizeForScoring("what's the weather")).toBe("what's the weather")
    })

    it('handles empty string', () => {
      expect(normalizeForScoring('')).toBe('')
      expect(tokenizeForScoring('')).toEqual([])
    })
  })

  describe('wordEditDistance', () => {
    it('is zero for identical sequences', () => {
      const d = wordEditDistance(['open', 'chrome'], ['open', 'chrome'])
      expect(d.distance).toBe(0)
      expect(d.substitutions + d.deletions + d.insertions).toBe(0)
    })

    it('counts a substitution', () => {
      const d = wordEditDistance(['open', 'chrome'], ['open', 'crome'])
      expect(d.substitutions).toBe(1)
      expect(d.deletions).toBe(0)
      expect(d.insertions).toBe(0)
      expect(d.distance).toBe(1)
    })

    it('counts deletions (missed words)', () => {
      const d = wordEditDistance(['open', 'the', 'chrome'], ['open', 'chrome'])
      expect(d.deletions).toBe(1)
      expect(d.distance).toBe(1)
    })

    it('counts insertions (hallucinated words)', () => {
      const d = wordEditDistance(['open', 'chrome'], ['open', 'the', 'chrome'])
      expect(d.insertions).toBe(1)
      expect(d.distance).toBe(1)
    })

    it('handles the classic kitten/sitting-shaped word case', () => {
      const d = wordEditDistance(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'y'])
      expect(d.distance).toBe(2)
    })
  })

  describe('wordErrorRate', () => {
    it('is 0 for a perfect transcript', () => {
      const r = wordErrorRate('open youtube', 'Open YouTube.')
      expect(r.wer).toBe(0)
      expect(r.refWords).toBe(2)
    })

    it('is 0.5 when half the words are wrong', () => {
      // reference: 4 words, 2 substitutions → 2/4
      const r = wordErrorRate('open google chrome now', 'open goggle crome now')
      expect(r.wer).toBeCloseTo(0.5)
    })

    it('rewards an empty hypothesis as full error over a non-empty reference', () => {
      expect(wordErrorRate('open chrome', '').wer).toBe(1)
    })

    it('returns 1 when reference is empty but hypothesis is not', () => {
      expect(wordErrorRate('', 'hello').wer).toBe(1)
    })

    it('returns 0 when both are empty', () => {
      expect(wordErrorRate('', '').wer).toBe(0)
    })
  })

  describe('exactTranscriptMatch', () => {
    it('matches despite case and punctuation differences', () => {
      expect(exactTranscriptMatch('Open Chrome!', 'open chrome')).toBe(true)
    })
  })

  describe('summarizeTranscripts', () => {
    it('aggregates corpus (micro) WER, exact accuracy and duplicates', () => {
      const summary = summarizeTranscripts([
        { reference: 'open chrome', hypothesis: 'open chrome', endpointLatencyMs: 400, submissions: 1 },
        { reference: 'open youtube', hypothesis: 'open you tube', endpointLatencyMs: 600, submissions: 1 },
        { reference: 'open notepad', hypothesis: 'open notepad', endpointLatencyMs: 500, submissions: 2 },
      ])
      expect(summary.samples).toBe(3)
      // "open you tube" vs reference "open youtube": 2 edits (sub + insertion)
      // over 6 total reference words → corpus WER 2/6. This is the raw-transcript
      // WER; intent resolution separately folds the spoken variant (see below).
      expect(summary.wer).toBeCloseTo(1 / 3)
      expect(summary.exactAccuracy).toBeCloseTo(2 / 3)
      expect(summary.duplicateSubmissions).toBe(1)
      expect(summary.endpoint?.count).toBe(3)
      expect(summary.endpoint?.mean).toBeCloseTo(500)
    })

    it('returns zeros for an empty corpus', () => {
      const summary = summarizeTranscripts([])
      expect(summary.wer).toBe(0)
      expect(summary.exactAccuracy).toBe(0)
      expect(summary.endpoint).toBeUndefined()
    })
  })

  describe('summarizeIntent', () => {
    it('scores intent and target resolution against the fixed registry', () => {
      const summary = summarizeIntent(
        [
          { hypothesis: 'open chrome', expectedIntent: 'OPEN_APPLICATION', expectedTarget: 'Google Chrome' },
          { hypothesis: 'open you tube', expectedIntent: 'OPEN_WEBSITE', expectedTarget: 'YouTube' },
          { hypothesis: 'flibbertigibbet', expectedIntent: 'OPEN_APPLICATION', expectedTarget: 'Calculator' },
        ],
        BENCHMARK_REGISTRY,
      )
      expect(summary.samples).toBe(3)
      expect(summary.intentAccuracy).toBeCloseTo(2 / 3)
      expect(summary.targetSamples).toBe(3)
      expect(summary.targetAccuracy).toBeCloseTo(2 / 3)
      expect(summary.failures.length).toBe(1)
    })

    it('folds the spoken "you tube" variant via the shared engine', () => {
      const summary = summarizeIntent(
        [{ hypothesis: 'open you tube', expectedIntent: 'OPEN_WEBSITE', expectedTarget: 'YouTube' }],
        BENCHMARK_REGISTRY,
      )
      expect(summary.intentAccuracy).toBe(1)
      expect(summary.targetAccuracy).toBe(1)
    })

    it('resolves the same command through natural polite phrasing', () => {
      const summary = summarizeIntent(
        [{ hypothesis: 'can you please open Google Chrome', expectedIntent: 'OPEN_APPLICATION', expectedTarget: 'Google Chrome' }],
        BENCHMARK_REGISTRY,
      )
      expect(summary.intentAccuracy).toBe(1)
      expect(summary.targetAccuracy).toBe(1)
    })
  })

  describe('latencySummary', () => {
    it('computes min/max/mean/median/p95', () => {
      const s = latencySummary([100, 200, 300, 400, 500])
      expect(s.count).toBe(5)
      expect(s.min).toBe(100)
      expect(s.max).toBe(500)
      expect(s.mean).toBe(300)
      expect(s.median).toBe(300)
      expect(s.p95).toBe(500)
    })

    it('handles an empty list', () => {
      expect(latencySummary([]).count).toBe(0)
    })
  })

  describe('summarizeWake (confusion matrix)', () => {
    it('computes recall/precision/FPR', () => {
      // 2 true wakes, 1 missed wake, 1 false wake, 2 clean negatives.
      const s = summarizeWake([
        { actualWake: true, detected: true },
        { actualWake: true, detected: true },
        { actualWake: true, detected: false },
        { actualWake: false, detected: true },
        { actualWake: false, detected: false },
        { actualWake: false, detected: false },
      ])
      expect(s.truePositives).toBe(2)
      expect(s.falseNegatives).toBe(1)
      expect(s.falsePositives).toBe(1)
      expect(s.trueNegatives).toBe(2)
      expect(s.recall).toBeCloseTo(2 / 3)
      expect(s.precision).toBeCloseTo(2 / 3)
      expect(s.falsePositiveRate).toBeCloseTo(1 / 3)
      expect(s.accuracy).toBeCloseTo(4 / 6)
    })
  })

  describe('parseManifest', () => {
    it('accepts a minimal valid manifest', () => {
      const manifest = parseManifest(
        JSON.stringify({
          version: 1,
          consent: true,
          samples: [{ id: 'a', file: 'a.wav', category: 'command', reference: 'open chrome' }],
        }),
      )
      expect(manifest.samples).toHaveLength(1)
      expect(manifest.samples[0].category).toBe('command')
    })

    it('rejects a manifest without explicit consent', () => {
      expect(() =>
        parseManifest(JSON.stringify({ version: 1, samples: [] })),
      ).toThrow(/consent/)
    })

    it('rejects an invalid category', () => {
      expect(() =>
        parseManifest(
          JSON.stringify({
            version: 1,
            consent: true,
            samples: [{ id: 'a', file: 'a.wav', category: 'singing' }],
          }),
        ),
      ).toThrow(/invalid category/)
    })
  })

  describe('decodeWav', () => {
    function makePcm16Wav(samples: number[], sampleRate: number, channels: number): Buffer {
      const bytesPerSample = 2
      const data = Buffer.alloc(samples.length * bytesPerSample)
      samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * bytesPerSample))
      const header = Buffer.alloc(44)
      header.write('RIFF', 0, 'ascii')
      header.writeUInt32LE(36 + data.length, 4)
      header.write('WAVE', 8, 'ascii')
      header.write('fmt ', 12, 'ascii')
      header.writeUInt32LE(16, 16)
      header.writeUInt16LE(1, 20) // PCM
      header.writeUInt16LE(channels, 22)
      header.writeUInt32LE(sampleRate, 24)
      header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
      header.writeUInt16LE(channels * bytesPerSample, 32)
      header.writeUInt16LE(16, 34)
      header.write('data', 36, 'ascii')
      header.writeUInt32LE(data.length, 40)
      return Buffer.concat([header, data])
    }

    it('decodes mono 16-bit PCM at 16 kHz unchanged', () => {
      const wav = makePcm16Wav([0, 0.5, -0.5, 1], 16000, 1)
      const decoded = decodeWav(wav)
      expect(decoded.sampleRate).toBe(16000)
      expect(decoded.channels).toBe(1)
      expect(decoded.samples.length).toBe(4)
      expect(decoded.samples[1]).toBeCloseTo(0.5, 2)
      expect(decoded.samples[3]).toBeCloseTo(1, 2)
    })

    it('downmixes stereo to mono', () => {
      const wav = makePcm16Wav([1, 0, 0, 1], 16000, 2)
      const decoded = decodeWav(wav)
      expect(decoded.samples.length).toBe(2)
      expect(decoded.samples[0]).toBeCloseTo(0.5, 2)
      expect(decoded.samples[1]).toBeCloseTo(0.5, 2)
    })

    it('resamples 48 kHz input to the 16 kHz target rate', () => {
      const wav = makePcm16Wav(new Array(48).fill(0.1), 48000, 1)
      const decoded = decodeWav(wav)
      expect(decoded.sampleRate).toBe(16000)
      expect(decoded.samples.length).toBe(16)
    })

    it('throws on a non-WAV buffer', () => {
      expect(() => decodeWav(Buffer.from('not a wav file at all'))).toThrow(/RIFF/)
    })
  })

  it('exposes the manifest file name used by the harness', () => {
    expect(CORPUS_MANIFEST_NAME).toBe('corpus.json')
  })
})
