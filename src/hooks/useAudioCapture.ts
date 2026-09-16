import { useState, useRef, useCallback, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface UseAudioCaptureReturn {
  isCapturing: boolean
  waveformData: Uint8Array
  error: string | null
  startCapture: () => Promise<void>
  stopCapture: () => void
}

/**
 * Captures microphone audio, streams PCM Int16 chunks to a callback,
 * and exposes real-time frequency data for waveform visualization.
 *
 * Audio spec: 16 kHz, mono, 16-bit PCM — compatible with Whisper.
 */
export function useAudioCapture(
  onChunk: (buf: ArrayBuffer) => void
): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false)
  const [waveformData, setWaveformData] = useState<Uint8Array>(new Uint8Array(64))
  const [error, setError] = useState<string | null>(null)

  const ctxRef       = useRef<AudioContext | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const analyserRef  = useRef<AnalyserNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const rafRef       = useRef<number>(0)
  const onChunkRef   = useRef(onChunk)

  // Keep callback ref fresh so the processor never has a stale closure
  useEffect(() => { onChunkRef.current = onChunk }, [onChunk])

  // ── Waveform animation loop ─────────────────────────────────────────────
  const tick = useCallback(() => {
    if (!analyserRef.current) return
    const buf = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(buf)
    setWaveformData(new Uint8Array(buf))  // clone to trigger re-render
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // ── Start ───────────────────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      // 16 kHz sample rate — matches Whisper's expected input
      const ctx = new AudioContext({ sampleRate: 16000 })
      ctxRef.current = ctx

      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyserRef.current = analyser

      // ScriptProcessorNode: 4096 frames @ 16 kHz ≈ 256 ms per chunk
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const f32 = e.inputBuffer.getChannelData(0)
        // Convert Float32 → Int16 PCM
        const i16 = new Int16Array(f32.length)
        for (let i = 0; i < f32.length; i++) {
          i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32768)))
        }
        onChunkRef.current(i16.buffer)
      }

      source.connect(analyser)
      source.connect(processor)
      processor.connect(ctx.destination)   // required even though output is silent

      setIsCapturing(true)
      setError(null)
      tick()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied'
      setError(msg)
    }
  }, [tick])

  // ── Stop ────────────────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    try { processorRef.current?.disconnect() } catch {}
    try { analyserRef.current?.disconnect()  } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    ctxRef.current?.close()

    ctxRef.current       = null
    streamRef.current    = null
    analyserRef.current  = null
    processorRef.current = null

    setIsCapturing(false)
    setWaveformData(new Uint8Array(64))
  }, [])

  // Cleanup on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    stopCapture()
  }, [stopCapture])

  return { isCapturing, waveformData, error, startCapture, stopCapture }
}
