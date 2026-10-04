import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppEntry,
  DisplayInfo,
  FileFolderEntry,
  NovaConfig,
  RegistrySnapshot,
  WebsiteEntry,
} from '../../electron/core/types'
import { normalizeUrl } from '../../electron/core/url'
import { acceleratorFromKeys, blockedAcceleratorReason, formatAccelerator } from '../lib/accelerator'
import { DEFAULT_HOTKEY, DEFAULT_PTT_HOTKEY } from '../../electron/core/shortcut-policy'
import { WAKE_PHRASE } from '../../electron/core/speech/constants'
import { isValidWakePhrase } from '../../electron/core/speech/wake-phrase'
import {
  DEFAULT_LOCAL_AI_BASE_URL,
  DEFAULT_LOCAL_AI_MODEL,
} from '../../electron/core/ai/constants'
import { isLoopbackHttpUrl } from '../../electron/core/ai/ollama-client'
import { useWakeBridge } from '../hooks/useWakeBridge'
import { useWakeStatus } from '../store/useWakeStore'
import { NovaLogo } from './NovaLogo'

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      className="toggle-track"
      role="switch"
      aria-checked={checked}
      style={{ background: checked ? 'rgba(168,85,247,0.7)' : 'rgba(255,255,255,0.1)' }}
      onClick={onChange}
    >
      <span className="toggle-thumb" style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          color: 'rgba(148,163,184,0.75)',
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="glass-hover"
      aria-label="Remove"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(248,113,113,0.9)',
        borderRadius: 8,
        padding: '4px 10px',
        fontSize: 12,
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onClick={onClick}
    >
      ✕
    </button>
  )
}

export function SettingsPanel() {
  const [config, setConfig] = useState<NovaConfig | null>(null)
  const [registry, setRegistry] = useState<RegistrySnapshot | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [startup, setStartup] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingPtt, setRecordingPtt] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [webName, setWebName] = useState('')
  const [webUrl, setWebUrl] = useState('')
  const [wakePhrase, setWakePhrase] = useState('')
  const [wakeError, setWakeError] = useState<string | null>(null)
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiLoaded, setAiLoaded] = useState(false)
  const statusTimer = useRef<number | null>(null)
  const wakeStatus = useWakeStatus()
  useWakeBridge()

  const toast = useCallback((message: string) => {
    setStatus(message)
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(null), 2500)
  }, [])

  useEffect(() => {
    async function load(): Promise<void> {
      const [cfg, reg, disp, st] = await Promise.all([
        window.nova.getConfig(),
        window.nova.getRegistry(),
        window.nova.getDisplays(),
        window.nova.getStartup(),
      ])
      setConfig(cfg)
      setRegistry(reg)
      setDisplays(disp)
      setStartup(st)
      // Seed the AI inputs once, so the stored provider is shown rather than a
      // blank field (without clobbering an in-progress edit on a later refresh).
      setAiBaseUrl(cfg.aiBaseUrl)
      setAiModel(cfg.aiModel)
      setAiLoaded(true)
    }
    load().catch(() => {})
    const off = window.nova.onConfigChanged((c) => setConfig(c))
    return off
  }, [])

  const save = useCallback(async (patch: Partial<NovaConfig>): Promise<NovaConfig> => {
    const next = await window.nova.updateConfig(patch)
    setConfig(next)
    return next
  }, [])

  useEffect(() => {
    if (!recording) return
    function onKey(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      const reason = blockedAcceleratorReason(e)
      if (reason) {
        toast(reason)
        return
      }
      const acc = acceleratorFromKeys(e)
      if (!acc) return
      setRecording(false)
      void save({ hotkey: acc }).then((next) => {
        if (next.hotkey !== acc) {
          toast(`Conflicts with voice shortcut — keeping ${formatAccelerator(next.hotkey)}`)
        } else {
          toast(`Hotkey set to ${formatAccelerator(acc)}`)
        }
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, save, toast])

  useEffect(() => {
    if (!recordingPtt) return
    function onKey(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      const reason = blockedAcceleratorReason(e)
      if (reason) {
        toast(reason)
        return
      }
      const acc = acceleratorFromKeys(e)
      if (!acc) return
      setRecordingPtt(false)
      void save({ pttHotkey: acc }).then((next) => {
        if (next.pttHotkey !== acc) {
          toast(`Conflicts with NOVA shortcut — keeping ${formatAccelerator(next.pttHotkey)}`)
        } else {
          toast(`PTT hotkey set to ${formatAccelerator(acc)}`)
        }
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recordingPtt, save, toast])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') window.nova.toggleSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!config) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass" style={{ borderRadius: 20, padding: '40px 60px', color: 'rgba(148,163,184,0.8)' }}>
          Loading…
        </div>
      </div>
    )
  }

  const toggleFavorite = (id: string): void => {
    const has = config.favorites.includes(id)
    const favorites = has ? config.favorites.filter((f) => f !== id) : [...config.favorites, id]
    void save({ favorites })
  }

  /**
   * V03-S5 — save the local provider settings.
   *
   * The URL is validated here for an immediate, readable explanation, but the
   * authoritative check is `sanitizeConfigPatch` in the main process: a
   * non-loopback address is refused there too, so the renderer cannot widen what
   * NOVA is allowed to contact.
   */
  const saveAiSettings = async (): Promise<void> => {
    const url = aiBaseUrl.trim()
    const model = aiModel.trim()
    if (!url || !isLoopbackHttpUrl(url)) {
      setAiError(
        'Enter a local address on this machine, e.g. http://127.0.0.1:11434. Remote addresses are not supported.',
      )
      return
    }
    if (!model) {
      setAiError('Enter the name of a model you have already installed locally.')
      return
    }
    setAiError(null)
    await save({ aiBaseUrl: url, aiModel: model })
    toast('Local AI settings saved')
  }

  const addCustomApp = async (): Promise<void> => {
    const picked = await window.nova.pickExe()
    if (!picked) return
    const entry: AppEntry = { id: `custom-${Date.now()}`, name: picked.name, aliases: [], path: picked.path }
    void save({ customApps: [...config.customApps, entry] })
  }

  const removeCustomApp = (id: string): void => {
    void save({ customApps: config.customApps.filter((c) => c.id !== id) })
  }

  const addWebsite = (): void => {
    const url = normalizeUrl(webUrl)
    if (!url) {
      toast('Enter a valid URL (e.g. example.com)')
      return
    }
    const name =
      webName.trim() ||
      url
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .split('.')
        .find(Boolean) ||
      url
    const entry: WebsiteEntry = { id: `web-${Date.now()}`, name, aliases: [name.toLowerCase()], url }
    void save({ websites: [...config.websites, entry] })
    setWebName('')
    setWebUrl('')
  }

  const removeWebsite = (id: string): void => {
    void save({ websites: config.websites.filter((w) => w.id !== id) })
  }

  const addFileFolder = async (kind: 'file' | 'folder'): Promise<void> => {
    const picked = kind === 'folder' ? await window.nova.pickFolder() : await window.nova.pickFile()
    if (!picked) return
    const entry: FileFolderEntry = { id: `ff-${Date.now()}`, name: picked.name, path: picked.path, kind }
    void save({ fileFolders: [...config.fileFolders, entry] })
  }

  const removeFileFolder = (id: string): void => {
    void save({ fileFolders: config.fileFolders.filter((f) => f.id !== id) })
  }

  const moveDot = async (displayId: number): Promise<void> => {
    const ok = await window.nova.placeDotOnDisplay(displayId)
    toast(ok ? 'Dot moved to that display' : 'Could not move the dot')
  }

  const saveWakePhrase = (): void => {
    const raw = wakePhrase.trim()
    if (!isValidWakePhrase(raw)) {
      setWakeError('Enter a valid wake phrase (letters and spaces only).')
      return
    }
    setWakeError(null)
    void save({ wakeWord: raw })
    setWakePhrase('')
    toast('Wake phrase updated')
  }

  const apps = registry?.apps ?? []
  const star = (favorited: boolean): string => (favorited ? '★' : '☆')

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
      <div
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
        <div
          style={{
            padding: '18px 24px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NovaLogo size={16} variant="gradient" decorative />
            <span style={{ color: 'var(--nova-royal, #a855f7)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em' }}>
              NOVA SETTINGS
            </span>
          </span>
          <button
            className="glass-hover"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(148,163,184,0.9)',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={() => window.nova.toggleSettings()}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '4px 24px 24px', flex: 1, overflowY: 'auto' }}>
          <Section title="General">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Always on top</div>
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>Keep the NOVA dot above other windows</div>
                </div>
                <Toggle checked={config.alwaysOnTop} onChange={() => void save({ alwaysOnTop: !config.alwaysOnTop })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Start with Windows</div>
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>Launch NOVA automatically at sign-in</div>
                </div>
                <Toggle
                  checked={startup}
                  onChange={() => {
                    const next = !startup
                    setStartup(next)
                    window.nova.setStartup(next)
                  }}
                />
              </div>
            </div>
          </Section>

          <Section title="Global hotkey">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {recording ? 'Press a new shortcut…' : formatAccelerator(config.hotkey)}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>Opens the command overlay anywhere</div>
              </div>
              <button
                className="quick-action-btn"
                style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999, color: recording ? '#fbbf24' : '#c4b5fd' }}
                onClick={() => setRecording((r) => !r)}
              >
                {recording ? 'Listening…' : 'Change'}
              </button>
            </div>
          </Section>

          <Section title="Voice">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Voice commands</div>
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>
                    Hands-free control. Speech stays on your device.
                  </div>
                </div>
                <Toggle
                  checked={config.voiceEnabled}
                  onChange={() => void save({ voiceEnabled: !config.voiceEnabled })}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {recordingPtt ? 'Press a new shortcut…' : formatAccelerator(config.pttHotkey)}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>Hold to talk (push-to-talk)</div>
                </div>
                <button
                  className="quick-action-btn"
                  style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999, color: recordingPtt ? '#fbbf24' : '#c4b5fd' }}
                  onClick={() => setRecordingPtt((r) => !r)}
                >
                  {recordingPtt ? 'Listening…' : 'Change'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Wake word</div>
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>
                    Current phrase: <span style={{ color: '#e9d5ff' }}>{config.wakeWord || WAKE_PHRASE}</span>
                  </div>
                </div>
                <Toggle checked={config.wakeWordEnabled} onChange={() => void save({ wakeWordEnabled: !config.wakeWordEnabled })} />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 6 }}>
                Wake detection runs locally while NOVA is idle.
              </div>
              {config.wakeWordEnabled && config.voiceEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: wakeStatus.armed
                        ? '#a78bfa'
                        : wakeStatus.available
                          ? 'rgba(148,163,184,0.5)'
                          : '#f87171',
                      boxShadow: wakeStatus.armed ? '0 0 8px rgba(167,139,250,0.9)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>
                    {wakeStatus.armed
                      ? `Listening for "${config.wakeWord || WAKE_PHRASE}"`
                      : wakeStatus.available
                        ? 'Wake detector paused'
                        : wakeStatus.status || 'Wake unsupported'}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="command-input"
                  style={{
                    fontSize: 13,
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 10,
                    flex: 1,
                    borderColor: wakeError ? 'rgba(248,113,113,0.5)' : undefined,
                  }}
                  placeholder={`e.g. ${WAKE_PHRASE}`}
                  value={wakePhrase}
                  onChange={(e) => setWakePhrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveWakePhrase()
                  }}
                />
                <button
                  className="quick-action-btn"
                  style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }}
                  onClick={saveWakePhrase}
                >
                  Set Wake Phrase
                </button>
              </div>
              {wakeError && (
                <div style={{ fontSize: 12, color: 'rgba(248,113,113,0.85)', marginTop: 6 }}>{wakeError}</div>
              )}
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 8 }}>
                Detection requires a local model matching your phrase. “Hey NOVA” is
                built in; other phrases work only when a matching local model is
                enrolled. Unsupported phrases are never armed or falsely detected.
              </div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)', marginTop: 8 }}>
                Audio is processed on this device. NOVA never stores recordings or uploads audio.
              </div>
            </div>
          </Section>

          <Section title="Local AI interpretation">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'rgba(226,232,240,0.85)' }}>
                  Interpret unrecognised commands
                </span>
                <Toggle
                  checked={config.aiInterpretationEnabled}
                  onChange={() => {
                    // Turning the flag on/off is the only switch that matters; the
                    // provider is not contacted until an unknown command arrives.
                    void save({ aiInterpretationEnabled: !config.aiInterpretationEnabled })
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 8 }}>
                Off by default. Known commands are always handled directly by NOVA and never
                sent to a model. When this is off, nothing AI-related runs at all.
              </div>

              {config.aiInterpretationEnabled && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <input
                      className="command-input"
                      aria-label="Local AI service URL"
                      style={{
                        fontSize: 13,
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 10,
                        flex: '1 1 200px',
                      }}
                      placeholder={DEFAULT_LOCAL_AI_BASE_URL}
                      value={aiLoaded ? aiBaseUrl : config.aiBaseUrl}
                      onChange={(e) => setAiBaseUrl(e.target.value)}
                    />
                    <input
                      className="command-input"
                      aria-label="Local AI model name"
                      style={{
                        fontSize: 13,
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 10,
                        flex: '1 1 160px',
                      }}
                      placeholder={DEFAULT_LOCAL_AI_MODEL}
                      value={aiLoaded ? aiModel : config.aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      className="quick-action-btn"
                      style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }}
                      onClick={saveAiSettings}
                    >
                      Save AI settings
                    </button>
                    <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)', alignSelf: 'center' }}>
                      Timeout {Math.round(config.aiTimeoutMs / 1000)}s
                    </span>
                  </div>
                  {aiError && (
                    <div style={{ fontSize: 12, color: 'rgba(248,113,113,0.85)', marginTop: 6 }}>
                      {aiError}
                    </div>
                  )}
                </>
              )}

              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 10 }}>
                Local only: the address must be this machine (127.0.0.1 or localhost). Remote
                addresses are rejected, and there is no cloud fallback.
              </div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)', marginTop: 8 }}>
                Command text is sent only to your local service, which NOVA never downloads or
                starts for you. NOVA still decides what runs: the model can only suggest a name,
                which is resolved from your apps and websites, then classified and confirmed as
                usual. If the service is missing or slow, NOVA falls back to asking for
                clarification.
              </div>
            </div>
          </Section>

          <Section title="Floating dot display">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {displays.map((d) => {
                  const active = config.position?.displayId === d.id
                  return (
                    <button
                      key={d.id}
                      className="quick-action-btn"
                      style={{
                        minWidth: 0,
                        padding: '8px 14px',
                        borderRadius: 999,
                        color: active ? '#a78bfa' : '#94a3b8',
                        borderColor: active ? 'rgba(139,92,246,0.5)' : undefined,
                      }}
                      onClick={() => void moveDot(d.id)}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)', marginTop: 8 }}>
                Click a display to move the dot there.
              </div>
            </div>
          </Section>

          <Section title="Favorites">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {apps.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)' }}>Scanning installed applications…</div>
                ) : (
                  apps.map((a) => {
                    const favorited = config.favorites.includes(a.id)
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                        <span style={{ fontSize: 13 }}>{a.name}</span>
                        <button
                          className="glass-hover"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: 16,
                            color: favorited ? '#fbbf24' : 'rgba(148,163,184,0.6)',
                            cursor: 'pointer',
                          }}
                          onClick={() => toggleFavorite(a.id)}
                          aria-label={`Favorite ${a.name}`}
                        >
                          {star(favorited)}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </Section>

          <Section title="Custom applications">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <button className="quick-action-btn" style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }} onClick={() => void addCustomApp()}>
                + Add application…
              </button>
              <div style={{ marginTop: 8 }}>
                {config.customApps.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ fontSize: 13 }}>{c.name}</span>
                    <RemoveButton onClick={() => removeCustomApp(c.id)} />
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Website shortcuts">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="command-input"
                  style={{ fontSize: 13, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}
                  placeholder="Name (optional)"
                  value={webName}
                  onChange={(e) => setWebName(e.target.value)}
                />
                <input
                  className="command-input"
                  style={{ fontSize: 13, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 10, flex: 1 }}
                  placeholder="URL (e.g. news.ycombinator.com)"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addWebsite()
                  }}
                />
                <button className="quick-action-btn" style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }} onClick={addWebsite}>
                  Add
                </button>
              </div>
              <div>
                {config.websites.map((w) => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ fontSize: 13 }}>{w.name}</span>
                    <RemoveButton onClick={() => removeWebsite(w.id)} />
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Files & folders">
            <div className="glass-light" style={{ borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className="quick-action-btn" style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }} onClick={() => void addFileFolder('folder')}>
                  + Add folder…
                </button>
                <button className="quick-action-btn" style={{ minWidth: 0, padding: '8px 14px', borderRadius: 999 }} onClick={() => void addFileFolder('file')}>
                  + Add file…
                </button>
              </div>
              <div>
                {config.fileFolders.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ fontSize: 13 }}>
                      {f.kind === 'folder' ? '📁' : '📄'} {f.name}
                    </span>
                    <RemoveButton onClick={() => removeFileFolder(f.id)} />
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>

        {status && (
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--nova-surface-glass, rgba(21,16,33,0.9))',
              border: '1px solid var(--nova-border-strong, rgba(168,85,247,0.4))',
              color: 'var(--nova-highlight, #e9d5ff)',
              borderRadius: 999,
              padding: '8px 18px',
              fontSize: 13,
              zIndex: 10,
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  )
}
