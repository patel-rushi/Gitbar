import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateDownloadedEvent } from 'electron-updater'
import { installUnsignedMacUpdate, isAppProperlySigned } from './macUpdate'

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

type UpdaterHooks = {
  prepareForQuit?: () => void
}

let hooks: UpdaterHooks = {}

function isDev(): boolean {
  return !!process.env.VITE_DEV_SERVER_URL
}

function prepareAppForUpdateInstall(): void {
  hooks.prepareForQuit?.()
  app.removeAllListeners('window-all-closed')
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.destroy()
  })
}

function installDownloadedUpdate(info: UpdateDownloadedEvent): void {
  prepareAppForUpdateInstall()

  if (process.platform === 'darwin' && !isAppProperlySigned()) {
    installUnsignedMacUpdate(info.downloadedFile)
    return
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true)
  })
}

function promptToInstallUpdate(info: UpdateDownloadedEvent): void {
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
      if (response !== 0) return

      try {
        installDownloadedUpdate(info)
      } catch (err) {
        console.error('Failed to install update:', err)
        dialog.showErrorBox(
          'Update Failed',
          'GitBar could not install the update automatically. Download the latest DMG from GitHub Releases instead.'
        )
      }
    })
}

export function setupAutoUpdater(nextHooks: UpdaterHooks = {}): void {
  if (isDev()) return

  hooks = nextHooks
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })

  autoUpdater.on('update-downloaded', (info) => {
    promptToInstallUpdate(info)
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
