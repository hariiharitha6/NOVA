import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useNovaBridge } from '../hooks/useNovaBridge'
import type { Feedback } from '../store/useNovaStore'
import type {
  CommandResponse,
  ConfirmationRequest,
  NovaConfig,
  RegistrySnapshot,
} from '../../electron/core/types'
import { formatAccelerator } from '../lib/accelerator'
import { DEFAULT_HOTKEY } from '../../electron/core/shortcut-policy'
import { NovaLogo } from './NovaLogo'

const PLACEHOLDER = "What do you want to do?"

/**
 * V03-S4: the single place a CommandResponse becomes overlay state. A held
 * confirmation becomes the prompt instead of feedback; everything else is
 * feedback, and a successful launch keeps the existing auto-hide behaviour.
 */
function applyResponse(
  response: CommandResponse,
  setConfirmation: (request: ConfirmationRequest | null) => void,
  setFeedback: (feedback: Feedback) => void,
  setInput: (value: string) => void,
): void {
  setInput('')
  if (response.kind === 'confirmation') {
    setFeedback(null)
    setConfirmation(response.request)
    return
  }
  setConfirmation(null)
  setFeedback(response)
  if (response.kind === 'launched' && response.result.ok) {
    window.setTimeout(() => window.nova.hideOverlay(), 900)
  }
}

export function CommandOverlay() {
  const reduceMotion = useReducedMotion()
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)
  const [hotkey, setHotkey] = useState<string>(DEFAULT_HOTKEY)
  const [recents, setRecents] = useState<{ id: string; label: string }[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [websites, setWebsites] = useState<NovaConfig['websites']>([])
  const [appsByName, setAppsByName] = useState<Record<string, string>>({})
  // V03-S4: the confirmation currently held by the main process, if any.
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const focusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const resetSession = useCallback(() => {
    // Each launcher invocation must start from a fresh, useful state: clear any
    // previous result/error/query/loading so it never leaks into the next open.
    // Persistent data (recents/favorites/settings) is NOT cleared here.
    setFeedback(null)
    setBusy(false)
    setInput('')
  }, [])

  useNovaBridge(
    useCallback(() => {
      resetSession()
      focusInput()
      // Re-sync with the authoritative pending confirmation so a prompt opened
      // from voice (or before this window reloaded) is never invisible.
      window.nova
        .getConfirmationState()
        .then(setConfirmation)
        .catch(() => {})
      // Re-fetch so suggestions (recents/favorites) are current on every open.
      window.nova
        .getConfig()
        .then(applyConfig)
        .catch(() => {})
      window.nova
        .getRegistry()
        .then(applyRegistry)
        .catch(() => {})
    }, [resetSession, focusInput]),
  )

  useEffect(() => {
    focusInput()
    async function load(): Promise<void> {
      const config = await window.nova.getConfig()
      applyConfig(config)
      const reg = await window.nova.getRegistry()
      applyRegistry(reg)
    }
    load().catch(() => {})
    const offConfig = window.nova.onConfigChanged(applyConfig)
    const offRegistry = window.nova.onConfigChanged(() => {
      window.nova
        .getRegistry()
        .then(applyRegistry)
        .catch(() => {})
    })
    // V03-S4: the prompt may be answered from any surface (overlay buttons,
    // spoken yes/no, timeout), so the overlay follows the main process.
    const offConfirmation = window.nova.onConfirmationState(setConfirmation)
    return () => {
      offConfig()
      offRegistry()
      offConfirmation()
    }
  }, [focusInput])

  // V03-S4: move focus into the prompt so it is announced, while landing on the
  // dialog itself rather than a button. Enter therefore never confirms by
  // accident — only an explicit focus on Confirm does.
  useEffect(() => {
    if (confirmation) dialogRef.current?.focus()
  }, [confirmation])

  function applyConfig(config: NovaConfig): void {
    setRecents(config.recents)
    setFavorites(config.favorites)
    setWebsites(config.websites)
    setHotkey(config.hotkey && config.hotkey.trim() ? config.hotkey : DEFAULT_HOTKEY)
  }

  function applyRegistry(reg: RegistrySnapshot): void {
    const byName: Record<string, string> = {}
    for (const app of reg.apps) byName[app.id] = app.name
    setAppsByName(byName)
  }

  const submit = useCallback(async (value?: string) => {
    const command = (value ?? input).trim()
    // While a confirmation is pending the prompt owns the keyboard; a queued
    // command must not silently supersede what the user is being asked.
    if (!command || busy || confirmation) return
    setBusy(true)
    setFeedback(null)
    try {
      const response = await window.nova.runCommand(command)
      applyResponse(response, setConfirmation, setFeedback, setInput)
    } finally {
      setBusy(false)
    }
  }, [input, busy, confirmation])

  // V03-S4: approve the exact command the prompt is bound to.
  const confirmNow = useCallback(async () => {
    if (!confirmation || busy) return
    const token = confirmation.token
    setConfirmation(null)
    setBusy(true)
    setFeedback(null)
    try {
      const response = await window.nova.confirmCommand(token)
      applyResponse(response, setConfirmation, setFeedback, setInput)
    } finally {
      setBusy(false)
    }
  }, [confirmation, busy])

  // V03-S4: reject. Never executes, and the token dies with the prompt.
  const cancelNow = useCallback(async () => {
    if (!confirmation) return
    const token = confirmation.token
    setConfirmation(null)
    const response = await window.nova.cancelCommand(token)
    if (response.kind === 'cancelled') setFeedback(response)
  }, [confirmation])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      // A pending prompt is cancelled, not dismissed: Escape never confirms.
      if (confirmation) {
        e.preventDefault()
        void cancelNow()
        return
      }
      window.nova.hideOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmation, cancelNow])

  function runSuggestion(suggestion: string): void {
    setInput(suggestion)
    void submit(suggestion)
  }

  const feedbackAction = feedback?.kind === 'clarification' || feedback?.kind === 'launched'
    ? feedback.action
    : feedback?.kind === 'result'
      ? { intent: feedback.result.intent, target: '', label: feedback.result.message, risk: 'LOW' as const }
      : // V03-S4: a rejected / expired confirmation is reported, not a failure.
        feedback?.kind === 'cancelled'
        ? {
            intent: feedback.action?.intent ?? 'UNKNOWN',
            target: '',
            label: feedback.message,
            risk: feedback.action?.risk ?? 'LOW',
          }
        : null
  const isLaunched = feedback?.kind === 'launched'
  const isResult = feedback?.kind === 'result'
  const isCancelled = feedback?.kind === 'cancelled'
  const isOk = isLaunched ? feedback.result.ok : isResult && feedback.result.success
  // Prefer the executor's own message (e.g. "Chrome is now focused.") over a
  // generic "Launched <label>", which would be wrong for non-launch intents.
  const statusText = feedback?.kind === 'launched'
    ? feedback.result.message || `Launched ${feedback.result.label}`
    : feedback?.kind === 'result'
      ? feedback.result.message
      : feedback?.kind === 'cancelled'
        ? feedback.message
        : feedbackAction?.label ?? ''
  // V03-S3: real favorites / recents returned by the command pipeline.
  const listData =
    feedback?.kind === 'result' && feedback.result.data &&
    (feedback.result.data.kind === 'favorites' || feedback.result.data.kind === 'recents')
      ? feedback.result.data
      : null
  const listTitle = listData?.kind === 'favorites' ? 'FAVORITES' : 'RECENT'
  const statusGlyph = isOk ? '✓' : isCancelled ? '⊘' : feedbackAction?.intent === 'CLARIFICATION' ? '?' : '✕'
  const statusColor = isOk
    ? '#4ade80'
    : isCancelled
      ? 'rgba(148,163,184,0.95)'
      : feedbackAction?.intent === 'CLARIFICATION'
        ? '#fbbf24'
        : '#f87171'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="glass"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 20,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 22px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NovaLogo size={18} variant="gradient" decorative />
              <span style={{ color: 'var(--nova-royal, #a855f7)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em' }}>
                NOVA
              </span>
              <span style={{ color: 'rgba(148,163,184,0.6)', fontSize: 12 }}>{formatAccelerator(hotkey)} to toggle</span>
            </div>
            <button
              className="glass-hover"
              aria-label="Open settings"
              title="Settings"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(148,163,184,0.9)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 14,
                cursor: 'pointer',
              }}
              onClick={() => {
                window.nova.hideOverlay()
                window.nova.toggleSettings()
              }}
            >
              ⚙
            </button>
          </div>
        </div>

        <div style={{ padding: '0 22px', flexShrink: 0 }}>
          <input
            ref={inputRef}
            className="command-input"
            style={{ fontSize: 20, padding: '8px 0' }}
            value={input}
            placeholder={confirmation ? 'Waiting for your confirmation…' : PLACEHOLDER}
            spellCheck={false}
            autoFocus
            // V03-S4: while a prompt is pending the command box is read-only, so
            // a stray keystroke cannot supersede what the user is being asked.
            readOnly={confirmation !== null}
            aria-hidden={confirmation !== null}
            onChange={(e) => {
              setInput(e.target.value)
              if (feedback) setFeedback(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !confirmation) void submit()
            }}
          />
        </div>

        <div style={{ padding: '0 22px', flex: 1, overflowY: 'auto' }}>
          {confirmation ? (
            <ConfirmationPrompt
              request={confirmation}
              busy={busy}
              reduceMotion={reduceMotion === true}
              dialogRef={dialogRef}
              onConfirm={() => void confirmNow()}
              onCancel={() => void cancelNow()}
            />
          ) : (
            <AnimatePresence mode="wait">
              {feedbackAction ? (
                <motion.div
                  key={`fb-${feedbackAction.label}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  style={{ paddingTop: 14 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: statusColor,
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    <span>{statusGlyph}</span>
                    <span>{statusText}</span>
                  </div>
                  {listData && listData.items.length > 0 ? (
                    <div style={{ marginTop: 12 }} role="list" aria-label={listTitle === 'FAVORITES' ? 'Favorites' : 'Recent apps'}>
                      <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: 11, letterSpacing: '0.1em' }}>
                        {listTitle}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {listData.items.map((item) => (
                          <button
                            key={item.id}
                            role="listitem"
                            className="quick-action-btn"
                            style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }}
                            onClick={() => runSuggestion(`Open ${item.label}`)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {feedbackAction.description ? (
                    <div style={{ color: 'rgba(148,163,184,0.85)', fontSize: 13, marginTop: 6 }}>
                      {feedbackAction.description}
                    </div>
                  ) : null}
                  {feedbackAction.suggestions && feedbackAction.suggestions.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      {feedbackAction.suggestions.map((s: string) => (
                        <button
                          key={s}
                          className="quick-action-btn"
                          style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }}
                          onClick={() => runSuggestion(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </motion.div>
              ) : input.trim() === '' ? (
                <motion.div
                  key="quick-links"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ paddingTop: 16 }}
                >
                  {favorites.length > 0 ? (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: 11, letterSpacing: '0.1em' }}>
                        FAVORITES
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {favorites.map((id) => {
                          const name = appsByName[id]
                          if (!name) return null
                          return (
                            <button
                              key={id}
                              className="quick-action-btn"
                              style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }}
                              onClick={() => runSuggestion(`Open ${name}`)}
                            >
                              {name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                  {websites.length > 0 ? (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: 11, letterSpacing: '0.1em' }}>
                        WEBSITES
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {websites.map((w) => (
                          <button
                            key={w.id}
                            className="quick-action-btn"
                            style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }}
                            onClick={() => runSuggestion(`Open ${w.name}`)}
                          >
                            {w.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {recents.length > 0 ? (
                    <div>
                      <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: 11, letterSpacing: '0.1em' }}>
                        RECENT
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {recents.map((r) => (
                          <button
                            key={r.id}
                            className="quick-action-btn"
                            style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }}
                            onClick={() => runSuggestion(r.label)}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              ) : (
                <motion.div
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ paddingTop: 16, color: 'rgba(148,163,184,0.55)', fontSize: 13 }}
                >
                  Try “Open Chrome”, “Open YouTube”, or “Open &lt;file or folder&gt;”.
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  )
}

/**
 * V03-S4 — minimal confirmation prompt inside the EXISTING overlay. No redesign:
 * same glass surface, same typography, same chips.
 *
 * Accessibility contract:
 *   - `role="dialog"` + `aria-modal`, labelled by the prompt and described by the
 *     target detail, so a screen reader announces what NOVA is about to do.
 *   - Focus moves to the dialog itself when it opens, never straight onto
 *     Confirm, so Enter cannot confirm by accident. Enter activates whichever
 *     button the user has explicitly focused.
 *   - Escape cancels (handled by the overlay, never confirms).
 *   - Buttons reuse `.quick-action-btn`, which already provides a visible
 *     `:focus-visible` ring.
 *   - Movement is dropped when the OS asks for reduced motion.
 */
function ConfirmationPrompt({
  request,
  busy,
  reduceMotion,
  dialogRef,
  onConfirm,
  onCancel,
}: {
  request: ConfirmationRequest
  busy: boolean
  reduceMotion: boolean
  dialogRef: React.RefObject<HTMLDivElement>
  onConfirm: () => void
  onCancel: () => void
}) {
  const seconds = Math.max(1, Math.round(request.expiresInMs / 1000))
  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nova-confirm-prompt"
      aria-describedby={request.detail ? 'nova-confirm-detail' : undefined}
      tabIndex={-1}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{ paddingTop: 14, outline: 'none' }}
    >
      <div
        style={{
          color: 'rgba(148,163,184,0.6)',
          fontSize: 11,
          letterSpacing: '0.1em',
        }}
      >
        CONFIRM ACTION
      </div>
      <div
        id="nova-confirm-prompt"
        style={{ color: 'var(--nova-text, #f5f3ff)', fontSize: 15, fontWeight: 600, marginTop: 6 }}
      >
        {request.prompt}
      </div>
      {request.detail ? (
        <div
          id="nova-confirm-detail"
          style={{
            color: 'rgba(148,163,184,0.85)',
            fontSize: 13,
            marginTop: 4,
            wordBreak: 'break-all',
          }}
        >
          {request.detail}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button
          className="quick-action-btn"
          style={{ minWidth: 0, padding: '8px 16px', borderRadius: 999 }}
          disabled={busy}
          onClick={onConfirm}
        >
          Confirm
        </button>
        <button
          className="quick-action-btn"
          style={{ minWidth: 0, padding: '8px 16px', borderRadius: 999 }}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div style={{ color: 'rgba(148,163,184,0.55)', fontSize: 12, marginTop: 10 }}>
        Expires in {seconds}s · Enter confirms only from the Confirm button · Esc cancels
      </div>
    </motion.div>
  )
}
