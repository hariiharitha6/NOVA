import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNovaBridge } from '../hooks/useNovaBridge'
import type { Feedback } from '../store/useNovaStore'
import type { NovaConfig, RegistrySnapshot } from '../../electron/core/types'
import { formatAccelerator } from '../lib/accelerator'
import { DEFAULT_HOTKEY } from '../../electron/core/shortcut-policy'
import { NovaLogo } from './NovaLogo'

const PLACEHOLDER = "What do you want to do?"

export function CommandOverlay() {
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)
  const [hotkey, setHotkey] = useState<string>(DEFAULT_HOTKEY)
  const [recents, setRecents] = useState<{ id: string; label: string }[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [websites, setWebsites] = useState<NovaConfig['websites']>([])
  const [appsByName, setAppsByName] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

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
    return () => {
      offConfig()
      offRegistry()
    }
  }, [focusInput])

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') window.nova.hideOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const submit = useCallback(async (value?: string) => {
    const command = (value ?? input).trim()
    if (!command || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const response = await window.nova.runCommand(command)
      setFeedback(response)
      setInput('')
      if (response.kind === 'launched' && response.result.ok) {
        window.setTimeout(() => window.nova.hideOverlay(), 900)
      }
    } finally {
      setBusy(false)
    }
  }, [input, busy])

  function runSuggestion(suggestion: string): void {
    setInput(suggestion)
    void submit(suggestion)
  }

  const feedbackAction = feedback?.kind === 'clarification' || feedback?.kind === 'launched'
    ? feedback.action
    : feedback?.kind === 'result'
      ? { intent: feedback.result.intent, target: '', label: feedback.result.message, risk: 'LOW' as const }
      : null
  const isLaunched = feedback?.kind === 'launched'
  const isOk = isLaunched && feedback.result.ok

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
            placeholder={PLACEHOLDER}
            spellCheck={false}
            autoFocus
            onChange={(e) => {
              setInput(e.target.value)
              if (feedback) setFeedback(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </div>

        <div style={{ padding: '0 22px', flex: 1, overflowY: 'auto' }}>
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
                    color: isOk ? '#4ade80' : feedbackAction.intent === 'CLARIFICATION' ? '#fbbf24' : '#f87171',
                    fontWeight: 500,
                    fontSize: 14,
                  }}
                >
                  <span>{isOk ? '✓' : feedbackAction.intent === 'CLARIFICATION' ? '?' : '✕'}</span>
                  <span>{isOk ? `Launched ${feedback.result.label}` : feedbackAction.label}</span>
                </div>
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
        </div>
      </motion.div>
    </div>
  )
}
