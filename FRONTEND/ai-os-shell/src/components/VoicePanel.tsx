import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useShellStore } from '../store/useShellStore'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useVoiceWebSocket } from '../hooks/useVoiceWebSocket'
import { resizeWindow } from '../hooks/useElectronBridge'

// Window dimension for Voice Panel mode
const VOICE_WIN_W = 540
const VOICE_WIN_H = 500

const S_SPRING = { type: 'spring', stiffness: 420, damping: 28 }

export function VoicePanel({ onClose }: { onClose: () => void }) {
  const { setVoiceMode } = useShellStore()

  // Simulated backend toggle for local standalone testing
  const [simulationMode, setSimulationMode] = useState(true)
  const [simState, setSimState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')

  // Real WS connection
  const {
    wsState,
    isConnected,
    partialTranscript,
    finalTranscript,
    responseText,
    error: wsError,
    connect,
    disconnect,
    sendAudioChunk,
    sendStart,
    sendStop,
    sendInterrupt,
    wsUrl,
    setWsUrl,
  } = useVoiceWebSocket()

  // Real Audio Capture
  const { isCapturing, waveformData, startCapture, stopCapture, error: micError } = useAudioCapture((buf) => {
    if (!simulationMode && isConnected) {
      sendAudioChunk(buf)
    }
  })

  // Simulated Voice Lifecycle timers
  const simTimerRef = useRef<NodeJS.Timeout[]>([])

  const clearSimTimers = () => {
    simTimerRef.current.forEach(clearTimeout)
    simTimerRef.current = []
  }

  // Active combined state
  const currentState = simulationMode ? simState : wsState === 'error' ? 'idle' : wsState

  // Auto resize window when VoicePanel mounts
  useEffect(() => {
    resizeWindow(VOICE_WIN_W, VOICE_WIN_H)
  }, [])

  // Simulated transcription & streaming response generator
  const [simPartial, setSimPartial] = useState('')
  const [simFinal, setSimFinal] = useState('')
  const [simResponse, setSimResponse] = useState('')

  const startSimulationCycle = () => {
    clearSimTimers()
    setSimState('listening')
    setSimPartial('')
    setSimFinal('')
    setSimResponse('')

    // 1. Partial transcript stream
    const phrases = [
      'Hey AI...',
      'Hey AI, can you check',
      'Hey AI, can you check system status',
      'Hey AI, can you check system status and open neural docs?',
    ]

    phrases.forEach((phrase, idx) => {
      const t = setTimeout(() => {
        setSimPartial(phrase)
      }, (idx + 1) * 700)
      simTimerRef.current.push(t)
    })

    // 2. Finalize transcript & transition to thinking
    const tFinal = setTimeout(() => {
      const fullQuery = phrases[phrases.length - 1]
      setSimPartial('')
      setSimFinal(fullQuery)
      setSimState('thinking')
    }, 3400)
    simTimerRef.current.push(tFinal)

    // 3. Thinking → Speaking + Streaming text
    const tStreamStart = setTimeout(() => {
      setSimState('speaking')
      const answer = 'All neural nodes are operational at 99.4% efficiency. CPU load is 12%, memory allocation is steady, and security protocol Delta-7 is active.'
      const words = answer.split(' ')
      let currentText = ''
      words.forEach((word, wIdx) => {
        const tw = setTimeout(() => {
          currentText += (wIdx === 0 ? '' : ' ') + word
          setSimResponse(currentText)
        }, wIdx * 90)
        simTimerRef.current.push(tw)
      })

      // Finish speaking after response ends
      const tEnd = setTimeout(() => {
        setSimState('idle')
      }, words.length * 90 + 1200)
      simTimerRef.current.push(tEnd)
    }, 4800)
    simTimerRef.current.push(tStreamStart)
  }

  // Handle Toggle Mic Button
  const handleMicToggle = async () => {
    if (currentState === 'speaking') {
      // Voice Interruption triggered by mic click
      handleInterrupt()
      return
    }

    if (currentState === 'listening') {
      // Stop listening
      stopCapture()
      if (simulationMode) {
        // Force fast-forward to thinking state in simulation
        clearSimTimers()
        setSimPartial('')
        if (!simFinal) setSimFinal('Analyze system telemetry and report.')
        setSimState('thinking')
        const tStream = setTimeout(() => {
          setSimState('speaking')
          setSimResponse('Neural telemetry verified. All operational parameters within normal range.')
          const tDone = setTimeout(() => setSimState('idle'), 2500)
          simTimerRef.current.push(tDone)
        }, 1200)
        simTimerRef.current.push(tStream)
      } else {
        sendStop()
      }
    } else {
      // Start listening
      await startCapture()
      if (simulationMode) {
        startSimulationCycle()
      } else {
        sendStart()
      }
    }
  }

  // Handle Interrupt action
  const handleInterrupt = () => {
    if (simulationMode) {
      clearSimTimers()
      stopCapture()
      setSimState('idle')
      setSimResponse(prev => prev + ' 🛑 [Interrupted]')
    } else {
      sendInterrupt()
      stopCapture()
    }
  }

  // Display texts
  const displayPartial = simulationMode ? simPartial : partialTranscript
  const displayFinal = simulationMode ? simFinal : finalTranscript
  const displayResponse = simulationMode ? simResponse : responseText

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={S_SPRING as any}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 24,
        background: 'rgba(7, 8, 22, 0.94)',
        backdropFilter: 'blur(36px) saturate(180%)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.8), 0 0 40px rgba(124,58,237,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ─── HEADER BAR ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected || simulationMode ? '#10b981' : '#f59e0b', boxShadow: isConnected || simulationMode ? '0 0 8px #10b981' : 'none' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#c4b5fd', textTransform: 'uppercase' }}>
            Voice Neural Interface
          </span>
        </div>

        {/* Control toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setSimulationMode(!simulationMode)}
            style={{
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 9,
              fontWeight: 600,
              border: '1px solid rgba(139,92,246,0.3)',
              background: simulationMode ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: simulationMode ? '#a78bfa' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {simulationMode ? 'Demo Mode' : 'WebSocket Live'}
          </button>
          <button
            onClick={() => {
              setVoiceMode(false)
              onClose()
            }}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ─── MAIN VOICE INTERACTION AREA ────────────────────────────────── */}
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        
        {/* ─── CENTRAL ANIMATED VOICE ORB / WAVEFORM STAGE ────────────── */}
        <div style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          
          {/* Listening Rings */}
          <AnimatePresence>
            {currentState === 'listening' && (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.8 }}
                  animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0.1, 0.6] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute',
                    inset: -15,
                    borderRadius: '50%',
                    border: '2px solid rgba(167, 139, 250, 0.6)',
                  }}
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0.5 }}
                  animate={{ scale: [1.1, 1.9, 1.1], opacity: [0.4, 0.05, 0.4] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: 0.4, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute',
                    inset: -25,
                    borderRadius: '50%',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                  }}
                />
              </>
            )}
          </AnimatePresence>

          {/* Thinking Neural Particles */}
          <AnimatePresence>
            {currentState === 'thinking' && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                style={{
                  position: 'absolute',
                  inset: -20,
                  borderRadius: '50%',
                  border: '2px dashed rgba(236, 72, 153, 0.6)',
                  filter: 'drop-shadow(0 0 8px rgba(236,72,153,0.5))',
                }}
              />
            )}
          </AnimatePresence>

          {/* Speaking Audio Waves Halo */}
          <AnimatePresence>
            {currentState === 'speaking' && (
              <motion.div
                animate={{ scale: [1, 1.08, 1], rotate: [0, 180, 360] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                style={{
                  position: 'absolute',
                  inset: -12,
                  borderRadius: '50%',
                  background: 'conic-gradient(from 0deg, rgba(59,130,246,0.5), rgba(168,85,247,0.6), rgba(236,72,153,0.5), rgba(59,130,246,0.5))',
                  filter: 'blur(10px)',
                }}
              />
            )}
          </AnimatePresence>

          {/* Core Interactive Mic Orb Button */}
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={handleMicToggle}
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              zIndex: 10,
              background:
                currentState === 'listening'
                  ? 'radial-gradient(circle at 35% 35%, #8b5cf6, #4c1d95)'
                  : currentState === 'thinking'
                  ? 'radial-gradient(circle at 35% 35%, #ec4899, #831843)'
                  : currentState === 'speaking'
                  ? 'radial-gradient(circle at 35% 35%, #3b82f6, #1e3a8a)'
                  : 'radial-gradient(circle at 35% 35%, #334155, #0f172a)',
              boxShadow:
                currentState === 'listening'
                  ? '0 0 35px rgba(139, 92, 246, 0.7)'
                  : currentState === 'thinking'
                  ? '0 0 35px rgba(236, 72, 153, 0.7)'
                  : currentState === 'speaking'
                  ? '0 0 35px rgba(59, 130, 246, 0.7)'
                  : '0 0 15px rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 32,
              transition: 'background 0.3s, box-shadow 0.3s',
            }}
          >
            {currentState === 'listening' ? '🎙️' : currentState === 'thinking' ? '🧠' : currentState === 'speaking' ? '🔊' : '🎙️'}
          </motion.button>
        </div>

        {/* State Label */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: '#94a3b8', textTransform: 'uppercase' }}>
            {currentState === 'idle'
              ? 'Tap microphone to speak'
              : currentState === 'listening'
              ? 'Listening...'
              : currentState === 'thinking'
              ? 'Processing Whisper & Gemini...'
              : 'Speaking (Click mic to interrupt)'}
          </span>
        </div>

        {/* Real-time Frequency Waveform Visualizer */}
        <div style={{ width: '80%', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 20 }}>
          {Array.from({ length: 28 }).map((_, i) => {
            // Pick real frequency sample if available, or generate state-based fallback
            const val = waveformData[i * 2] || 0
            const normVal = Math.min(1, val / 255)
            const height =
              currentState === 'listening'
                ? Math.max(4, isCapturing ? normVal * 28 : Math.sin(Date.now() / 200 + i) * 12 + 14)
                : currentState === 'speaking'
                ? Math.sin(Date.now() / 150 + i * 0.5) * 10 + 14
                : 3

            return (
              <motion.div
                key={i}
                animate={{ height }}
                transition={{ duration: 0.08 }}
                style={{
                  width: 3,
                  borderRadius: 2,
                  background:
                    currentState === 'listening'
                      ? '#a78bfa'
                      : currentState === 'speaking'
                      ? '#60a5fa'
                      : '#334155',
                }}
              />
            );
          })}
        </div>

        {/* ─── TRANSCRIPTION & STREAMING RESPONSE CONTAINER ─────────────── */}
        <div
          style={{
            width: '100%',
            flex: 1,
            borderRadius: 16,
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflowY: 'auto',
            maxHeight: 180,
          }}
        >
          {/* User Partial / Final Transcription */}
          {(displayPartial || displayFinal) && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.15)', padding: '2px 6px', borderRadius: 4 }}>
                USER
              </span>
              <div style={{ fontSize: 12, color: displayPartial ? '#cbd5e1' : '#f8fafc', fontStyle: displayPartial ? 'italic' : 'normal' }}>
                {displayFinal || displayPartial}
                {displayPartial && <span style={{ opacity: 0.6, animation: 'pulse 1s infinite' }}>...</span>}
              </div>
            </div>
          )}

          {/* AI Streaming Response */}
          {displayResponse && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.15)', padding: '2px 6px', borderRadius: 4 }}>
                AI
              </span>
              <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
                {displayResponse}
              </div>
            </div>
          )}

          {/* Empty Prompt State */}
          {!displayPartial && !displayFinal && !displayResponse && (
            <div style={{ margin: 'auto', fontSize: 11, color: '#475569', textAlign: 'center' }}>
              Say something like <span style={{ color: '#94a3b8' }}>"Check CPU load"</span> or <span style={{ color: '#94a3b8' }}>"Summarize emails"</span>
            </div>
          )}
        </div>

        {/* ─── INTERRUPT BUTTON BAR (when speaking) ────────────────────── */}
        <AnimatePresence>
          {currentState === 'speaking' && (
            <motion.button
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
              onClick={handleInterrupt}
              style={{
                marginTop: 12,
                padding: '6px 16px',
                borderRadius: 20,
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              🛑 Tap to Interrupt Voice
            </motion.button>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  )
}
