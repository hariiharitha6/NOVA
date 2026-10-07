import { useEffect, useRef } from 'react'
import { useConfig } from '../store/useNovaStore'
import { useVoiceStore } from '../store/useVoiceStore'
import { KWS_CHUNK_SAMPLES, TARGET_SAMPLE_RATE } from '../../electron/core/speech/constants'
import { resample } from '../../electron/core/speech/audio-utils'

// Float32Array type alias to satisfy strict TS5.6+ generic ArrayBuffer checks.
type F32 = Float32Array<ArrayBuffer>

/**
 * Wake capture retry policy. A transient mic failure (device still settling,
 * a permissions prompt, a driver hiccup) must not permanently kill wake-word
 * detection for the whole process lifetime: retry a bounded number of times
 * with a delay, then give up quietly until the next arm/disarm cycle.
 */
const WAKEMIC_MAX_ATTEMPTS = 3
const WAKEMIC_RETRY_DELAY_MS = 4000

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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!armed) {
      stopCapture()
      return
    }

    let cancelled = false
    let attempts = 0

    function scheduleRetry(): void {
      if (cancelled) return
      if (attempts >= WAKEMIC_MAX_ATTEMPTS) return
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        void start()
      }, WAKEMIC_RETRY_DELAY_MS)
    }

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
          attempts++
          scheduleRetry()
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
        // A successful capture resets the budget; a later transient blip can
        // still recover without permanently disarming wake detection.
        attempts = 0
      } catch {
        // Wake detection is optional and must never crash NOVA; a mic error just
        // leaves it unarmed. Retry a bounded number of times in case the device
        // was momentarily unavailable, then stop until the next re-arm.
        attempts++
        scheduleRetry()
      }
    }

    void start()
    return () => {
      cancelled = true
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      stopCapture()
    }
  }, [armed])

  function stopCapture(): void {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
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
