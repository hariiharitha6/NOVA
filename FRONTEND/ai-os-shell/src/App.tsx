import { CommandOverlay } from './components/CommandOverlay'
import { Dot } from './components/Dot'
import { SettingsPanel } from './components/SettingsPanel'

export function App() {
  const view = new URLSearchParams(window.location.search).get('view') ?? 'dot'

  return (
    <div
      id="app-root"
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      {view === 'overlay' ? (
        <CommandOverlay />
      ) : view === 'settings' ? (
        <SettingsPanel />
      ) : (
        <Dot />
      )}
    </div>
  )
}
