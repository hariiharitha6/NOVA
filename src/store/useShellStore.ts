import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShellMode = 'collapsed' | 'expanded' | 'command' | 'settings'
export type OrbState = 'idle' | 'listening' | 'thinking' | 'responding'

export interface SystemInfo {
  cpu: number
  memory: number
  time: string
  date: string
  battery: number | null
  isCharging: boolean
}

export interface Display {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  timestamp: number
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ShellStore {
  // Shell state
  mode: ShellMode
  setMode: (mode: ShellMode) => void

  // Orb state
  orbState: OrbState
  setOrbState: (state: OrbState) => void

  // Command bar
  commandInput: string
  setCommandInput: (input: string) => void
  commandHistory: string[]
  addToHistory: (cmd: string) => void

  // System info
  systemInfo: SystemInfo
  setSystemInfo: (info: Partial<SystemInfo>) => void

  // Displays
  displays: Display[]
  setDisplays: (displays: Display[]) => void
  activeDisplayId: number | null
  setActiveDisplayId: (id: number) => void

  // Startup
  startupEnabled: boolean
  setStartupEnabled: (enabled: boolean) => void

  // Notifications
  notifications: Notification[]
  addNotification: (n: Omit<Notification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void

  // Taskbar info
  taskbarHeight: number
  setTaskbarHeight: (h: number) => void

  // Voice mode
  voiceMode: boolean
  setVoiceMode: (v: boolean) => void

  // AI Studio Mode
  studioOpen: boolean
  setStudioOpen: (open: boolean) => void
  activeStudioTab: string
  setActiveStudioTab: (tab: string) => void
  dockedPanels: string[]
  toggleDockPanel: (panelId: string) => void
}

export const useShellStore = create<ShellStore>((set) => ({
  // Shell
  mode: 'collapsed',
  setMode: (mode) => set({ mode }),

  // Orb
  orbState: 'idle',
  setOrbState: (orbState) => set({ orbState }),

  // Command
  commandInput: '',
  setCommandInput: (commandInput) => set({ commandInput }),
  commandHistory: [],
  addToHistory: (cmd) =>
    set((state) => ({
      commandHistory: [cmd, ...state.commandHistory].slice(0, 50),
    })),

  // System
  systemInfo: {
    cpu: 0,
    memory: 0,
    time: '',
    date: '',
    battery: null,
    isCharging: false,
  },
  setSystemInfo: (info) =>
    set((state) => ({ systemInfo: { ...state.systemInfo, ...info } })),

  // Displays
  displays: [],
  setDisplays: (displays) => set({ displays }),
  activeDisplayId: null,
  setActiveDisplayId: (activeDisplayId) => set({ activeDisplayId }),

  // Startup
  startupEnabled: false,
  setStartupEnabled: (startupEnabled) => set({ startupEnabled }),

  // Notifications
  notifications: [],
  addNotification: (n) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          ...n,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ].slice(-8),
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // Taskbar
  taskbarHeight: 40,
  setTaskbarHeight: (taskbarHeight) => set({ taskbarHeight }),

  // Voice mode
  voiceMode: false,
  setVoiceMode: (voiceMode) => set({ voiceMode }),

  // Studio Mode
  studioOpen: false,
  setStudioOpen: (studioOpen) => set({ studioOpen }),
  activeStudioTab: 'terminal',
  setActiveStudioTab: (activeStudioTab) => set({ activeStudioTab }),
  dockedPanels: ['conversation', 'artifacts', 'tasks'],
  toggleDockPanel: (panelId) =>
    set((state) => ({
      dockedPanels: state.dockedPanels.includes(panelId)
        ? state.dockedPanels.filter((p) => p !== panelId)
        : [...state.dockedPanels, panelId],
    })),
}))
