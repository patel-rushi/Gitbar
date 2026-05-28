import { useEffect } from 'react'
import { useStore } from './store'
import { SetupScreen } from './components/SetupScreen'
import { MainPanel } from './components/MainPanel'
import { SettingsPanel } from './components/SettingsPanel'

export default function App() {
  const { view, setPendingUpdate } = useStore()

  useEffect(() => {
    window.gitbar?.getPendingUpdate().then(info => {
      if (info?.version) setPendingUpdate(info.version)
    })

    const off = window.gitbar?.onUpdateAvailable(({ version }) => {
      setPendingUpdate(version)
    })

    return () => {
      off?.()
    }
  }, [setPendingUpdate])

  return (
    <div className="app-container">
      {view === 'setup' && <SetupScreen />}
      {view === 'main' && <MainPanel />}
      {view === 'settings' && <SettingsPanel />}
    </div>
  )
}
