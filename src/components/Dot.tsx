import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNovaBridge } from '../hooks/useNovaBridge'
import { useVoiceBridge } from '../hooks/useVoiceBridge'
import { useVoiceMic } from '../hooks/useVoiceMic'
import { useWakeMic } from '../hooks/useWakeMic'
import { useWakeBridge } from '../hooks/useWakeBridge'
import { useVoiceStore } from '../store/useVoiceStore'
import { useWakeStore } from '../store/useWakeStore'
import { useConfig } from '../store/useNovaStore'
import { VoiceIndicator } from './VoiceIndicator'
import { NovaBubble } from './NovaLogo'

const DOT_SIZE = 26
const DRAG_THRESHOLD = 5

export function Dot() {
  const [hovered, setHovered] = useState(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)
  const voiceActive = useVoiceStore((s) => s.state.phase !== 'idle')
  const wake = useWakeStore((s) => s.status)
  const config = useConfig()
  const wakeEnabled = !!config?.wakeWordEnabled
  const wakePhrase = config?.wakeWord || 'Hey NOVA'

  useNovaBridge()
  useVoiceBridge()
  useVoiceMic()
  useWakeMic()
  useWakeBridge()

  if (voiceActive) {
    return <VoiceIndicator />
  }

  function handlePointerDown(e: React.PointerEvent): void {
    if (e.button !== 0) return
    startRef.current = { x: e.screenX, y: e.screenY }
    movedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent): void {
    const start = startRef.current
    if (!start) return
    const dx = e.screenX - start.x
    const dy = e.screenY - start.y
    if (dx !== 0 || dy !== 0) movedRef.current = true
    window.nova.moveDotBy(dx / window.devicePixelRatio, dy / window.devicePixelRatio)
    startRef.current = { x: e.screenX, y: e.screenY }
  }

  function handlePointerUp(e: React.PointerEvent): void {
    const start = startRef.current
    const moved = movedRef.current
    startRef.current = null
    movedRef.current = false
    window.nova.moveDotEnd()
    if (start && !moved && Math.abs(e.screenX - start.x) + Math.abs(e.screenY - start.y) < DRAG_THRESHOLD) {
      window.nova.toggleOverlay()
    }
  }

  const wakeArmed = wake.armed
  const wakeEnabledButUnavailable = wakeEnabled && !wakeArmed && !wake.available

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: hovered ? 'grab' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <motion.div
      className="nova-anim-breathe"
        animate={{
          scale: hovered ? 1.2 : 1,
          filter: hovered
            ? 'drop-shadow(0 0 10px rgba(185, 45, 50, 0.7))'
            : 'drop-shadow(0 0 6px rgba(185, 45, 50, 0.45))',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
        aria-label="NOVA"
      >
        <NovaBubble size={DOT_SIZE} decorative />
        {wakeArmed ? (
          <span
            className="nova-anim-listen"
            aria-label="Listening for wake word"
            title={`Listening for "${wakePhrase}"`}
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: '1.5px solid rgba(185, 45, 50, 0.55)',
            }}
          />
        ) : null}
        {wakeEnabledButUnavailable ? (
          <span
            aria-label="Wake word unavailable"
            title={wake.status || 'Wake word model unavailable'}
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              right: 0,
              top: 0,
              borderRadius: '50%',
              background: 'rgba(248, 113, 113, 0.8)',
            }}
          />
        ) : null}
      </motion.div>
    </div>
  )
}
