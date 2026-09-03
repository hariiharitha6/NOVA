import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNovaBridge } from '../hooks/useNovaBridge'
import { useVoiceBridge } from '../hooks/useVoiceBridge'
import { useVoiceMic } from '../hooks/useVoiceMic'
import { useVoiceStore } from '../store/useVoiceStore'
import { VoiceIndicator } from './VoiceIndicator'
import { NovaLogo } from './NovaLogo'

const DOT_SIZE = 26
const DRAG_THRESHOLD = 5

export function Dot() {
  const [hovered, setHovered] = useState(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)
  const voiceActive = useVoiceStore((s) => s.state.phase !== 'idle')

  useNovaBridge()
  useVoiceBridge()
  useVoiceMic()

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
            ? 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.8))'
            : 'drop-shadow(0 0 6px rgba(168, 85, 247, 0.5))',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="NOVA"
      >
        <NovaLogo size={DOT_SIZE} variant="gradient" decorative />
      </motion.div>
    </div>
  )
}
