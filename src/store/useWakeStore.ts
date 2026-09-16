import { create } from 'zustand'

export interface WakeStatus {
  armed: boolean
  available: boolean
  status: string
}

interface WakeStore {
  status: WakeStatus
  setStatus: (status: WakeStatus) => void
}

const INITIAL: WakeStatus = { armed: false, available: false, status: '' }

export const useWakeStore = create<WakeStore>((set) => ({
  status: INITIAL,
  setStatus: (status) => set({ status }),
}))

export function useWakeStatus(): WakeStatus {
  return useWakeStore((s) => s.status)
}