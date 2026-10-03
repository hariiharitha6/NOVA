// NOVA core types. Platform-neutral. No Electron imports allowed here.

import { DEFAULT_HOTKEY, DEFAULT_PTT_HOTKEY } from './shortcut-policy'
import { DEFAULT_WAKE_PHRASE } from './speech/constants'

export type Intent =
  | 'OPEN_APPLICATION'
  | 'OPEN_WEBSITE'
  | 'OPEN_FILE'
  | 'OPEN_FOLDER'
  | 'SEARCH_WEB'
  | 'SEARCH_YOUTUBE'
  | 'OPEN_SETTINGS'
  | 'FOCUS_APPLICATION'
  | 'SHOW_FAVORITES'
  | 'SHOW_RECENTS'
  | 'CLARIFICATION'
  | 'UNKNOWN'

export interface StructuredAction {
  intent: Intent
  target: string
  label: string
  description?: string
  suggestions?: string[]
  arguments?: Record<string, unknown>
  risk?: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface AppEntry {
  id: string
  name: string
  aliases: string[]
  path: string
}

export interface WebsiteEntry {
  id: string
  name: string
  aliases: string[]
  url: string
}

export interface FileFolderEntry {
  id: string
  name: string
  path: string
  kind: 'file' | 'folder'
}

export interface RegistrySnapshot {
  apps: AppEntry[]
  websites: WebsiteEntry[]
  fileFolders: FileFolderEntry[]
}

export interface RecentItem {
  id: string
  label: string
}

export interface WindowPosition {
  displayId: number
  x: number
  y: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}

export interface NovaConfig {
  version: number
  hotkey: string
  alwaysOnTop: boolean
  startup: boolean
  position: WindowPosition | null
  favorites: string[]
  recents: RecentItem[]
  customApps: AppEntry[]
  websites: WebsiteEntry[]
  fileFolders: FileFolderEntry[]
  /**
   * Whether the default Windows folder shortcuts (Downloads/Documents/Desktop)
   * have been seeded into fileFolders. Guarantees they are added only once.
   */
  defaultsSeeded: boolean
  /**
   * v0.2 — Voice. OFF by default. When false NOVA never accesses the
   * microphone and never registers the PTT shortcut.
   */
  voiceEnabled: boolean
  /** v0.2 — Push-to-talk shortcut (independent of the overlay hotkey). */
  pttHotkey: string
  /** v0.2 — Speech language. Slice 1 ships a single English model ("en-US"). */
  speechLanguage: string
  /**
   * v0.2 Slice 4A — Wake word. OFF by default. Slice 4A-1 only persists the
   * preference; it has NO runtime behavior until Slice 4A-2 wires the local
   * wake-word detector. While OFF (or before 4A-2) NOVA never requests the
   * microphone for wake detection.
   */
  wakeWordEnabled: boolean
  /**
   * v0.2 Slice 4A-2 — The user's custom wake phrase (defaults to "Hey NOVA").
   * Persisted and normalized safely. The currently active local keyword-spotting
   * detector must be configured for (and only claims support for) this exact,
   * normalized phrase.
   */
  wakeWord: string
  /**
   * v0.2 Slice 3A — set once after the legacy Ctrl+Space defaults have been
   * migrated to the Ctrl+J family; guards against re-migrating deliberate
   * user choices.
   */
  shortcutsMigratedV2: boolean
}

export interface LaunchResult {
  ok: boolean
  message: string
  label: string
}

export interface CommandResult {
  success: boolean
  intent: Intent
  message: string
  action?: StructuredAction
}

export type CommandResponse =
  | { kind: 'launched'; action: StructuredAction; result: LaunchResult }
  | { kind: 'clarification'; action: StructuredAction }
  | { kind: 'result'; result: CommandResult }

export interface AppSource {
  readonly id: string
  discover(): Promise<AppEntry[]>
}

export interface ConfigStore {
  get(): NovaConfig
  update(patch: Partial<NovaConfig>): NovaConfig
  recordRecent(item: RecentItem): NovaConfig
}

export function defaultConfig(): NovaConfig {
  return {
    version: 1,
    hotkey: DEFAULT_HOTKEY,
    alwaysOnTop: true,
    startup: false,
    position: null,
    favorites: [],
    recents: [],
    customApps: [],
    websites: [
      { id: 'web-youtube', name: 'YouTube', aliases: ['youtube'], url: 'https://www.youtube.com' },
      { id: 'web-chatgpt', name: 'ChatGPT', aliases: ['chatgpt', 'gpt'], url: 'https://chatgpt.com' },
      { id: 'web-gmail', name: 'Gmail', aliases: ['gmail', 'mail'], url: 'https://mail.google.com' },
      { id: 'web-github', name: 'GitHub', aliases: ['github'], url: 'https://github.com' },
      { id: 'web-drive', name: 'Google Drive', aliases: ['drive', 'google drive'], url: 'https://drive.google.com' },
      { id: 'web-claude', name: 'Claude', aliases: ['claude'], url: 'https://claude.ai' },
      { id: 'web-google', name: 'Google', aliases: ['google', 'search'], url: 'https://www.google.com' },
    ],
    fileFolders: [],
    defaultsSeeded: false,
    voiceEnabled: false,
    pttHotkey: DEFAULT_PTT_HOTKEY,
    speechLanguage: 'en-US',
    wakeWordEnabled: false,
    wakeWord: DEFAULT_WAKE_PHRASE,
    shortcutsMigratedV2: false,
  }
}
