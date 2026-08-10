import { useState, useRef, useCallback, useEffect } from 'react'

// ─── Protocol Types ───────────────────────────────────────────────────────────

/**
 * Messages the CLIENT sends to the FastAPI WebSocket endpoint.
 *
 * Binary messages  → Int16 PCM audio chunks (16 kHz, mono)
 * JSON messages    → control commands below
 */
export type ClientMsg =
  | { type: 'start_listening' }
  | { type: 'stop_listening'  }
  | { type: 'interrupt'       }
  | { type: 'ping'            }

/**
 * Messages the SERVER sends to the client.
 *
 * Whisper partial/final transcripts, LLM streaming chunks,
 * TTS lifecycle events, and error payloads.
 */
export type ServerMsg =
  | { type: 'partial_transcript'; text: string }
  | { type: 'final_transcript';   text: string }
  | { type: 'thinking' }
  | { type: 'response_chunk';     text: string }
  | { type: 'response_done' }
  | { type: 'speaking_start' }
  | { type: 'speaking_chunk';     data: string }   // base64 PCM TTS audio
  | { type: 'speaking_end' }
  | { type: 'error';              message: string }

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

// ─── Return Types ─────────────────────────────────────────────────────────────

export interface UseVoiceWebSocketReturn {
  // State
  wsState: VoiceState
  isConnected: boolean
  partialTranscript: string
  finalTranscript: string
  responseText: string
  error: string | null
  wsUrl: string

  // Actions
  connect: () => void
  disconnect: () => void
  sendAudioChunk: (buf: ArrayBuffer) => void
  sendStart: () => void
  sendStop: () => void
  sendInterrupt: () => void
  setWsUrl: (url: string) => void
  clearSession: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceWebSocket(): UseVoiceWebSocketReturn {
  const [wsState,           setWsState]           = useState<VoiceState>('idle')
  const [isConnected,       setIsConnected]       = useState(false)
  const [partialTranscript, setPartialTranscript] = useState('')
  const [finalTranscript,   setFinalTranscript]   = useState('')
  const [responseText,      setResponseText]      = useState('')
  const [error,             setError]             = useState<string | null>(null)
  const [wsUrl,             setWsUrl]             = useState('ws://localhost:8000/ws/voice')

  const wsRef = useRef<WebSocket | null>(null)

  // ── Incoming message handler ──────────────────────────────────────────────
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
      // Binary → TTS audio; player hook handles playback separately
      return
    }
    try {
      const msg = JSON.parse(event.data as string) as ServerMsg
      switch (msg.type) {
        case 'partial_transcript':
          setPartialTranscript(msg.text)
          setWsState('listening')
          break
        case 'final_transcript':
          setFinalTranscript(msg.text)
          setPartialTranscript('')
          setWsState('thinking')
          break
        case 'thinking':
          setWsState('thinking')
          break
        case 'response_chunk':
          setResponseText(prev => prev + msg.text)
          setWsState('speaking')
          break
        case 'response_done':
          // Keep state as 'speaking' until TTS ends
          break
        case 'speaking_start':
          setWsState('speaking')
          break
        case 'speaking_end':
          setWsState('idle')
          break
        case 'error':
          setError(msg.message)
          setWsState('error')
          break
      }
    } catch {
      // Non-JSON frames (e.g. pong, binary) — ignore
    }
  }, [])

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return
    setWsState('connecting')
    setError(null)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen  = () => { setIsConnected(true); setWsState('idle') }
    ws.onclose = () => { setIsConnected(false); setWsState('idle') }
    ws.onerror = () => {
      setIsConnected(false)
      setError(`Cannot reach ${wsUrl}`)
      setWsState('error')
    }
    ws.onmessage = handleMessage
  }, [wsUrl, handleMessage])

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setIsConnected(false)
    setWsState('idle')
  }, [])

  // ── Send helpers ──────────────────────────────────────────────────────────
  const sendJson = useCallback((msg: ClientMsg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const sendAudioChunk = useCallback((buf: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(buf)
    }
  }, [])

  const sendStart = useCallback(() => {
    setPartialTranscript('')
    setFinalTranscript('')
    setResponseText('')
    setWsState('listening')
    sendJson({ type: 'start_listening' })
  }, [sendJson])

  const sendStop = useCallback(() => {
    sendJson({ type: 'stop_listening' })
  }, [sendJson])

  const sendInterrupt = useCallback(() => {
    sendJson({ type: 'interrupt' })
    setResponseText('')
    setWsState('listening')
  }, [sendJson])

  const clearSession = useCallback(() => {
    setPartialTranscript('')
    setFinalTranscript('')
    setResponseText('')
    setError(null)
    setWsState(isConnected ? 'idle' : 'idle')
  }, [isConnected])

  // Cleanup on unmount
  useEffect(() => () => { wsRef.current?.close() }, [])

  return {
    wsState, isConnected, partialTranscript, finalTranscript, responseText, error, wsUrl,
    connect, disconnect, sendAudioChunk, sendStart, sendStop, sendInterrupt, setWsUrl, clearSession,
  }
}
