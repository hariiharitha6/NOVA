// NOVA core types. Platform-neutral. No Electron imports allowed here.

export type Intent =
  | 'OPEN_APPLICATION'
  | 'OPEN_WEBSITE'
  | 'OPEN_FILE'
  | 'OPEN_FOLDER'
  | 'CLARIFICATION'

export interface StructuredAction {
  intent: Intent
  target: string
  label: string
  description?: string
  suggestions?: string[]
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
}

export interface LaunchResult {
  ok: boolean
  message: string
  label: string
}

export type CommandResponse =
  | { kind: 'launched'; action: StructuredAction; result: LaunchResult }
  | { kind: 'clarification'; action: StructuredAction }

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
    hotkey: 'Control+Space',
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
  }
}
