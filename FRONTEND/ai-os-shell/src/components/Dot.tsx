import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNovaBridge } from '../hooks/useNovaBridge'

const DOT_SIZE = 26
const DRAG_THRESHOLD = 5

export function Dot() {
  const [hovered, setHovered] = useState(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)

  useNovaBridge()

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
        animate={{
          scale: hovered ? 1.25 : 1,
          boxShadow: hovered
            ? '0 0 14px rgba(139, 92, 246, 0.9)'
            : '0 0 8px rgba(139, 92, 246, 0.55)',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #c4b5fd, #8b5cf6 60%, #4c1d95)',
          pointerEvents: 'none',
        }}
        aria-label="NOVA"
      />
    </div>
  )
}
