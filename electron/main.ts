import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, Notification, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { setupAutoUpdater, checkForUpdatesManually, maybeCheckForUpdates } from './updater'
import { initAnalytics, track } from './analytics'

initAnalytics()

const STORE_PATH = path.join(app.getPath('userData'), 'gitbar-data.json')

function readStore(): Record<string, any> {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
    }
  } catch {}
  return {}
}

function writeStore(data: Record<string, any>) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data), 'utf-8')
  } catch {}
}

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let normalTrayIcon: Electron.NativeImage | null = null
let activeTrayIcon: Electron.NativeImage | null = null
let isPanelOpen = false
let lastHideAt = 0

const WINDOW_WIDTH = 380
const WINDOW_HEIGHT = 560

function getAssetPath(...segments: string[]): string {
  const devPath = path.join(__dirname, '..', 'build', ...segments)
  if (fs.existsSync(devPath)) return devPath
  return path.join(process.resourcesPath!, 'build', ...segments)
}

function loadTrayIcon(): Electron.NativeImage {
  const icon2xPath = getAssetPath('trayTemplate@2x.png')
  const icon1xPath = getAssetPath('trayTemplate.png')

  if (fs.existsSync(icon2xPath)) {
    const buf = fs.readFileSync(icon2xPath)
    const img = nativeImage.createFromBuffer(buf, { scaleFactor: 2.0 })
    img.setTemplateImage(true)
    return img
  }

  if (fs.existsSync(icon1xPath)) {
    const img = nativeImage.createFromPath(icon1xPath)
    img.setTemplateImage(true)
    return img
  }

  // Fallback: 16x16 simple dot icon
  const fallback = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARklEQVQ4T2NkoBAwUqifAacB////Z2BgYGBkxKEBWSkmJFcwMjIyYjUApwG4XIXTC/gMwOkCfAbgdAFOA/C5AK8BeA0AACT4GBG1jQNDAAAAAElFTkSuQmCC'
  )
  fallback.setTemplateImage(true)
  return fallback
}

// "Active" highlighted icon shown while the panel is open. Non-template so the
// accent background renders as-is. Falls back to the normal icon if missing.
function loadActiveTrayIcon(): Electron.NativeImage {
  const icon2xPath = getAssetPath('trayActive@2x.png')
  const icon1xPath = getAssetPath('trayActive.png')

  if (fs.existsSync(icon2xPath)) {
    return nativeImage.createFromBuffer(fs.readFileSync(icon2xPath), { scaleFactor: 2.0 })
  }
  if (fs.existsSync(icon1xPath)) {
    return nativeImage.createFromPath(icon1xPath)
  }
  return loadTrayIcon()
}

function setPanelOpenState(open: boolean): void {
  isPanelOpen = open
  if (!open) lastHideAt = Date.now()
  if (tray && normalTrayIcon && activeTrayIcon) {
    tray.setImage(open ? activeTrayIcon : normalTrayIcon)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: true,
    vibrancy: 'menu',
    visualEffectState: 'active',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('blur', () => {
    hideWindow()
  })
}

function hideWindow(): void {
  if (!mainWindow) return
  mainWindow.hide()
  setPanelOpenState(false)
}

function showWindow() {
  if (!mainWindow) return

  // Re-assert cross-Space visibility on every show so the panel appears on the
  // CURRENT space/display rather than being pulled to where it was first opened
  // (e.g. a fullscreen app's Space). skipTransformProcessType avoids a process
  // type flip that itself can trigger a Space switch.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  const trayBounds = tray?.getBounds()
  const hasTrayBounds = !!trayBounds && trayBounds.width > 0

  // Pick the display under the tray icon, falling back to the cursor's display
  // when tray bounds are stale/zero (common right after wake or display changes).
  const anchor = hasTrayBounds
    ? { x: trayBounds!.x + trayBounds!.width / 2, y: trayBounds!.y }
    : screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(anchor).workArea

  let x = Math.round(anchor.x - WINDOW_WIDTH / 2)
  x = Math.min(Math.max(x, area.x + 8), area.x + area.width - WINDOW_WIDTH - 8)

  let y = hasTrayBounds ? trayBounds!.y + trayBounds!.height + 4 : area.y + 4
  y = Math.min(Math.max(y, area.y + 4), area.y + area.height - WINDOW_HEIGHT - 8)

  mainWindow.setPosition(x, y)
  mainWindow.show()
  mainWindow.focus()
  setPanelOpenState(true)
  maybeCheckForUpdates()
}

function toggleWindow() {
  if (!mainWindow) return
  if (isPanelOpen) {
    hideWindow()
    return
  }
  // If a blur from this same click just hid the panel, don't immediately
  // reopen it — that race is what caused the double-click / stuck behavior.
  if (Date.now() - lastHideAt < 250) return
  showWindow()
}

app.dock?.hide()

app.whenReady().then(() => {
  normalTrayIcon = loadTrayIcon()
  activeTrayIcon = loadActiveTrayIcon()
  tray = new Tray(normalTrayIcon)
  tray.setToolTip(`GitBar v${app.getVersion()}`)
  tray.on('click', toggleWindow)

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show GitBar', click: showWindow },
      { type: 'separator' },
      { label: 'Check for Updates…', click: () => checkForUpdatesManually() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
    tray?.popUpContextMenu(contextMenu)
  })

  createWindow()
  setupAutoUpdater({
    prepareForQuit: () => {
      tray?.destroy()
      tray = null
      mainWindow?.destroy()
      mainWindow = null
    },
    showWindow
  })

  track('app_started')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('update-badge', (_event, count: number) => {
  if (!tray) return
  tray.setTitle(count > 0 ? String(count) : '')
})

ipcMain.on('show-notification', (_event, data: { title: string; body: string; url?: string }) => {
  const notification = new Notification({
    title: data.title,
    body: data.body,
    sound: 'default',
    silent: false
  })

  notification.on('click', () => {
    if (data.url) {
      shell.openExternal(data.url)
    }
  })

  notification.show()
})

ipcMain.on('open-external', (_event, url: string) => {
  shell.openExternal(url)
})

ipcMain.on('hide-window', () => {
  hideWindow()
})

ipcMain.handle('store-get', (_event, key: string) => {
  const store = readStore()
  return store[key] ?? null
})

ipcMain.handle('store-set', (_event, key: string, value: any) => {
  const store = readStore()
  store[key] = value
  writeStore(store)
})

ipcMain.handle('store-remove', (_event, key: string) => {
  const store = readStore()
  delete store[key]
  writeStore(store)
})
