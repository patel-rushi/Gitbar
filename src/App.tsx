import { useStore } from './store'
import { SetupScreen } from './components/SetupScreen'
import { MainPanel } from './components/MainPanel'
import { SettingsPanel } from './components/SettingsPanel'

export default function App() {
  const { view } = useStore()

  return (
    <div className="app-container">
      {view === 'setup' && <SetupScreen />}
      {view === 'main' && <MainPanel />}
      {view === 'settings' && <SettingsPanel />}
    </div>
  )
}
