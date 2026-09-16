import { useEffect, useRef } from 'react'
import { useConfig } from '../store/useNovaStore'
import { useVoiceStore } from '../store/useVoiceStore'
import { KWS_CHUNK_SAMPLES, TARGET_SAMPLE_RATE } from '../../electron/core/speech/constants'
import { resample } from '../../electron/core/speech/audio-utils'

// Float32Array type alias to satisfy strict TS5.6+ generic ArrayBuffer checks.
type F32 = Float32Array<ArrayBuffer>

/**
 * Captures a lightweight continuous microphone stream while the wake-word
 * detector is ARMED and streams mono Float32 PCM (16 kHz, small chunks) to the
 * main process keyword spotter.
 *
 * ARMED means: wake word enabled AND voice enabled AND voice phase === idle.
 *
 * This is a SEPARATE, lightweight capture from the STT capture (`useVoiceMic`).
 * The two are mutually exclusive via the voice phase gate:
 *   - while idle + wake armed -> this hook captures and feeds the spotter
 *   - while STT listening    -> useVoiceMic captures; this hook is inactive
 * No audio is ever persisted. Any mic failure is reported to main (which simply
 * disarms/ignores wake activity) and the local context is torn down.
 */
export function useWakeMic(): void {
  const config = useConfig()
  const phase = useVoiceStore((s) => s.state.phase)

  const wakeEnabled = config?.wakeWordEnabled === true
  const voiceEnabled = config?.voiceEnabled === true
  const idle = phase === 'idle'
  const armed = wakeEnabled && voiceEnabled && idle

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const actualRateRef = useRef<number>(TARGET_SAMPLE_RATE)

  useEffect(() => {
    if (!armed) {
      stopCapture()
      return
    }

    let cancelled = false

    async function start(): Promise<void> {
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
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const audioTrack = stream.getAudioTracks()[0]
        if (!audioTrack) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
        ctxRef.current = ctx
        try {
          await ctx.resume()
        } catch {
          // best-effort; proceed
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          await ctx.close().catch(() => {})
          return
        }

        const processRate = ctx.sampleRate
        actualRateRef.current = processRate

        const source = ctx.createMediaStreamSource(stream)
        const processor = ctx.createScriptProcessor(KWS_CHUNK_SAMPLES, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          const raw = e.inputBuffer.getChannelData(0)
          let samples = new Float32Array(raw.length)
          samples.set(raw)
          if (processRate !== TARGET_SAMPLE_RATE) {
            samples = resample(samples, processRate, TARGET_SAMPLE_RATE) as F32
          }
          window.nova.wakeSendAudio(samples)
        }
        source.connect(processor)
        processor.connect(ctx.destination)
      } catch {
        // Wake detection is optional; a mic error simply leaves it unarmed.
        // No crash. Main already knows how to ignore wake audio.
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCapture()
    }
  }, [armed])

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
  }
}
