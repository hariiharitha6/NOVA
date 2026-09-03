import { useEffect, useRef } from 'react'
import { useVoiceStore } from '../store/useVoiceStore'
import { CHUNK_SAMPLES, TARGET_SAMPLE_RATE } from '../../electron/core/speech/constants'
import { resample, computeAudioDiagnostics } from '../../electron/core/speech/audio-utils'

// Float32Array type alias to satisfy strict TS5.6+ generic ArrayBuffer checks.
type F32 = Float32Array<ArrayBuffer>

/**
 * Captures microphone audio ONLY while a listening session is active and
 * streams mono Float32 PCM (16 kHz, 4096-sample chunks) to the main process.
 *
 * The capture pipeline:
 *  1. Requests mic with speech-optimized constraints (echo/noise/AGC).
 *  2. Creates an AudioContext targeting 16 kHz.
 *  3. Verifies the actual sample rate; if the browser cannot honour 16 kHz,
 *     performs linear-interpolation resampling on each chunk.
 *  4. Downmixes to mono if the mic produces stereo.
 *  5. Sends 16 kHz mono Float32 chunks to the main process via IPC.
 *
 * No audio is ever persisted. On any mic failure the renderer reports the
 * error to main, which cancels the session and returns to IDLE.
 */
export function useVoiceMic(): void {
  const listening = useVoiceStore((s) => s.state.phase === 'listening')

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const actualRateRef = useRef<number>(TARGET_SAMPLE_RATE)
  const channelsRef = useRef<number>(1)
  const chunkCountRef = useRef<number>(0)

  useEffect(() => {
    if (!listening) {
      stopCapture()
      return
    }

    let cancelled = false

    async function start(): Promise<void> {
      try {
        // Speech-optimised constraints. We request the ideal 16 kHz rate so
        // the AudioContext can avoid internal resampling, but we handle any
        // rate the hardware actually provides.
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
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        // Verify a live audio track actually exists; otherwise the session would
        // sit in "Listening" forever with no audio ever reaching the recognizer.
        const audioTrack = stream.getAudioTracks()[0]
        if (!audioTrack) {
          stream.getTracks().forEach((t) => t.stop())
          window.nova.voiceMicError('no audio track from microphone')
          return
        }
        streamRef.current = stream

        const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
        ctxRef.current = ctx

        // An AudioContext created outside a user gesture (the PTT binding is a
        // global shortcut, not a click in the renderer) can start "suspended",
        // in which case ScriptProcessorNode callbacks never fire and no audio is
        // captured. Resume it explicitly so capture actually runs.
        try {
          await ctx.resume()
        } catch {
          // even if resume is rejected, the onaudioprocess may still fire;
          // proceed and let a silent stream surface via diagnostics
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          await ctx.close().catch(() => {})
          return
        }
        if (ctx.state !== 'running') {
          stream.getTracks().forEach((t) => t.stop())
          await ctx.close().catch(() => {})
          window.nova.voiceMicError('audio context failed to start')
          return
        }

        // Detect the actual channel count and sample rate after negotiation.
        const trackSettings = stream.getTracks()[0]?.getSettings()
        const micChannels = trackSettings?.channelCount ?? 1
        const micRate = trackSettings?.sampleRate ?? ctx.sampleRate
        channelsRef.current = micChannels

        // The AudioContext may have been created at a different rate than
        // requested (browser/OS limitation). Use the context's real rate as
        // the rate of samples coming out of the ScriptProcessorNode.
        const processRate = ctx.sampleRate
        actualRateRef.current = processRate

        const source = ctx.createMediaStreamSource(stream)
        const processor = ctx.createScriptProcessor(CHUNK_SAMPLES, micChannels, 1)
        processorRef.current = processor

        chunkCountRef.current = 0

        processor.onaudioprocess = (e) => {
          chunkCountRef.current++

          // Get raw samples — may be multi-channel interleaved.
          const raw = e.inputBuffer.getChannelData(0)
          let samples = new Float32Array(raw.length)
          samples.set(raw)

          // Downmix to mono if the input had more than one channel.
          // (getChannelData(0) already gives us channel 0, but if the
          // AudioContext is multi-channel the buffer layout differs.)
          const bufChannels = e.inputBuffer.numberOfChannels
          if (bufChannels > 1) {
            const interleaved = new Float32Array(e.inputBuffer.length * bufChannels)
            for (let ch = 0; ch < bufChannels; ch++) {
              const chData = e.inputBuffer.getChannelData(ch)
              for (let i = 0; i < chData.length; i++) {
                interleaved[i * bufChannels + ch] = chData[i]
              }
            }
            // Average all channels to mono
            const frames = e.inputBuffer.length
            samples = new Float32Array(frames)
            for (let i = 0; i < frames; i++) {
              let sum = 0
              for (let ch = 0; ch < bufChannels; ch++) {
                sum += interleaved[i * bufChannels + ch]
              }
              samples[i] = sum / bufChannels
            }
          }

          // Resample if the AudioContext rate differs from the model rate.
          if (processRate !== TARGET_SAMPLE_RATE) {
            samples = resample(samples, processRate, TARGET_SAMPLE_RATE) as F32
          }

          // Lightweight diagnostics (dev only, no persistence). Reported via
          // console.debug so it never spams the packaged production console.
          if (chunkCountRef.current <= 3 || chunkCountRef.current % 50 === 0) {
            const diag = computeAudioDiagnostics(samples, TARGET_SAMPLE_RATE, 1)
            console.debug(
              `[NOVA:mic] chunk=${chunkCountRef.current} rate=${processRate}→${TARGET_SAMPLE_RATE} ` +
              `rms=${diag.rms.toFixed(4)} peak=${diag.peak.toFixed(4)} ` +
              `silence=${diag.silencePercent.toFixed(1)}% ` +
              (diag.rms > 0 ? '☑ audio-received' : '⚠ silence-only'),
            )
          }

          window.nova.voiceSendAudio(samples)
        }
        source.connect(processor)
        processor.connect(ctx.destination)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'microphone unavailable'
        window.nova.voiceMicError(msg)
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCapture()
    }
  }, [listening])

  function stopCapture(): void {
    try {
      processorRef.current?.disconnect()
    } catch {
      // ignore
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      // ignore
    }
    try {
      void ctxRef.current?.close()
    } catch {
      // ignore
    }
    processorRef.current = null
    streamRef.current = null
    ctxRef.current = null
    chunkCountRef.current = 0
  }
}
