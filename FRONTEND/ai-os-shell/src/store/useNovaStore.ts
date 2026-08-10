import { create } from 'zustand'
import type { CommandResponse, NovaConfig } from '../../electron/core/types'

export type Feedback = CommandResponse | null

interface NovaStore {
  config: NovaConfig | null
  setConfig: (config: NovaConfig) => void
  hydrate: () => Promise<void>
}

export const useNovaStore = create<NovaStore>((set) => ({
  config: null,
  setConfig: (config) => set({ config }),
  hydrate: async () => {
    const config = await window.nova.getConfig()
    set({ config })
  },
}))

export function useConfig(): NovaConfig | null {
  return useNovaStore((s) => s.config)
}
