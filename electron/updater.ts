import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateDownloadedEvent } from 'electron-updater'
import { installUnsignedMacUpdate, isAppProperlySigned } from './macUpdate'
import { track } from './analytics'

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

type UpdaterHooks = {
  prepareForQuit?: () => void
  showWindow?: () => void
}

let hooks: UpdaterHooks = {}
let pendingUpdate: UpdateDownloadedEvent | null = null

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

function broadcastUpdateAvailable(info: UpdateDownloadedEvent): void {
  const payload = { version: info.version }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('update-available', payload)
    }
  }
}

function installDownloadedUpdate(info: UpdateDownloadedEvent): void {
  track('update_applied', { from: app.getVersion(), to: info.version })
  prepareAppForUpdateInstall()

  if (process.platform === 'darwin' && !isAppProperlySigned()) {
    installUnsignedMacUpdate(info.downloadedFile)
    return
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true)
  })
}

function handleUpdateDownloaded(info: UpdateDownloadedEvent): void {
  pendingUpdate = info
  broadcastUpdateAvailable(info)
  hooks.showWindow?.()
}

ipcMain.on('install-update', () => {
  if (!pendingUpdate) return
  try {
    installDownloadedUpdate(pendingUpdate)
  } catch (err) {
    console.error('Failed to install update:', err)
    dialog.showErrorBox(
      'Update Failed',
      'GitBar could not install the update automatically. Download the latest DMG from GitHub Releases instead.'
    )
  }
})

ipcMain.handle('get-pending-update', () => {
  return pendingUpdate ? { version: pendingUpdate.version } : null
})

export function setupAutoUpdater(nextHooks: UpdaterHooks = {}): void {
  if (isDev()) return

  hooks = nextHooks
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })

  autoUpdater.on('update-downloaded', (info) => {
    handleUpdateDownloaded(info)
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

  if (pendingUpdate) {
    broadcastUpdateAvailable(pendingUpdate)
    hooks.showWindow?.()
    return
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    const updateVersion = result?.updateInfo?.version
    const currentVersion = String(autoUpdater.currentVersion)

    if (updateVersion && updateVersion !== currentVersion) {
      hooks.showWindow?.()
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
