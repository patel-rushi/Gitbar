import { dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

function isDev(): boolean {
  return !!process.env.VITE_DEV_SERVER_URL
}

export function setupAutoUpdater(): void {
  if (isDev()) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `GitBar ${info.version} is ready to install.`,
        detail: 'Restart the app to apply the update.',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(console.error)
  }, 5000)

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(console.error)
  }, UPDATE_CHECK_INTERVAL_MS)
}

export async function checkForUpdatesManually(): Promise<void> {
  if (isDev()) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'GitBar',
      message: 'Updates are disabled in development mode.'
    })
    return
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    const updateVersion = result?.updateInfo?.version
    const currentVersion = String(autoUpdater.currentVersion)

    if (updateVersion && updateVersion !== currentVersion) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `GitBar ${updateVersion} is downloading.`,
        detail: 'You will be prompted to restart when the download completes.'
      })
      return
    }

    await dialog.showMessageBox({
      type: 'info',
      title: 'GitBar',
      message: 'You are on the latest version.'
    })
  } catch (err) {
    console.error('Manual update check failed:', err)
    await dialog.showMessageBox({
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates. Try again later.'
    })
  }
}
