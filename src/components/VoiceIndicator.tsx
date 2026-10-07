import { AnimatePresence, motion } from 'framer-motion'
import { useVoiceState } from '../store/useVoiceStore'

const PULSE = {
  scale: [1, 1.18, 1],
  boxShadow: [
    '0 0 6px rgba(139, 92, 246, 0.5)',
    '0 0 18px rgba(139, 92, 246, 0.95)',
    '0 0 6px rgba(139, 92, 246, 0.5)',
  ],
}

function statusColor(phase: string): string {
  switch (phase) {
    case 'success':
      return '#4ade80'
    case 'error':
      return '#f87171'
    case 'confirming':
      return '#fbbf24'
    default:
      return '#E1D6BE'
  }
}

function statusText(state: {
  phase: string
  message: string
  transcript: string
  partial: string
}): string {
  switch (state.phase) {
    case 'listening':
      return state.partial || 'Listening…'
    case 'processing':
      return 'Processing…'
    case 'confirming':
      return state.message || 'Waiting for confirmation…'
    case 'success':
      return state.message || 'Done'
    case 'error':
      return state.message || 'Voice error'
    default:
      return ''
  }
}

/**
 * Minimal voice indicator rendered inside the floating-dot window. Kept in the
 * same style as the NOVA dot: a small glass bubble with a status glyph and the
 * current transcript. Returns null when idle so the plain dot shows instead.
 */
export function VoiceIndicator() {
  const state = useVoiceState()

  return (
    <AnimatePresence>
      {state.phase !== 'idle' ? (
        <motion.div
          key="voice-indicator"
          initial={{ opacity: 0, scale: 0.92, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 6 }}
          transition={{ duration: 0.16 }}
          className="glass"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            overflow: 'hidden',
          }}
        >
          <div style={{ flexShrink: 0 }}>
            {state.phase === 'listening' ? (
              <motion.div
                animate={PULSE}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #EDE5D2, #B92D32 60%, #4A0F14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ color: '#fff', fontSize: 15 }} aria-hidden>
                  🎙
                </span>
              </motion.div>
            ) : (
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: `2px solid ${statusColor(state.phase)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: statusColor(state.phase),
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {state.phase === 'success' ? '✓' : state.phase === 'error' ? '✕' : state.phase === 'confirming' ? '?' : '…'}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                color: 'rgba(148,163,184,0.85)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {statusText(state)}
            </div>
            {state.phase === 'processing' && state.transcript ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 15,
                  color: '#e9d5ff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                “{state.transcript}”
              </div>
            ) : null}
            {state.phase === 'listening' && state.partial ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 15,
                  color: '#e9d5ff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                “{state.partial}”
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
