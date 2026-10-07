/// <reference types="vite/client" />

import type {
  CommandResponse,
  ConfirmationRequest,
  DisplayInfo,
  NovaConfig,
  RegistrySnapshot,
} from '../electron/core/types'
import type { VoiceState } from '../electron/core/speech/types'

interface ImportMetaEnv {
  readonly ELECTRON_RENDERER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface PickedPath {
  path: string
  name: string
}

interface WakeStatus {
  armed: boolean
  available: boolean
  status: string
}

declare global {
  interface Window {
    nova: {
      getConfig(): Promise<NovaConfig>
      updateConfig(patch: Partial<NovaConfig>): Promise<NovaConfig>
      runCommand(input: string): Promise<CommandResponse>
      getConfirmationState(): Promise<ConfirmationRequest | null>
      confirmCommand(token: string): Promise<CommandResponse>
      cancelCommand(token: string): Promise<CommandResponse>
      getRegistry(): Promise<RegistrySnapshot>
      getStartup(): Promise<boolean>
      setStartup(enable: boolean): void
      getDisplays(): Promise<DisplayInfo[]>
      placeDotOnDisplay(displayId: number): Promise<boolean>
      pickExe(): Promise<PickedPath | null>
      pickFolder(): Promise<PickedPath | null>
      pickFile(): Promise<PickedPath | null>
      hideOverlay(): void
      toggleOverlay(): void
      toggleSettings(): void
      moveDotBy(dx: number, dy: number): void
      moveDotEnd(): void
      quit(): void
      voiceStatus(): Promise<VoiceState>
      voiceSendAudio(samples: Float32Array): void
      voiceMicError(message: string): void
      wakeSendAudio(samples: Float32Array): void
      wakeStatus(): Promise<WakeStatus>
      onOverlayShown(cb: () => void): () => void
      onConfigChanged(cb: (config: NovaConfig) => void): () => void
      onVoiceState(cb: (state: VoiceState) => void): () => void
      onConfirmationState(cb: (request: ConfirmationRequest | null) => void): () => void
      onCommandResult(cb: (response: CommandResponse) => void): () => void
      getLastVoiceListResult(): Promise<CommandResponse | null>
      onWakeStatus(cb: (status: WakeStatus) => void): () => void
    }
  }
}
