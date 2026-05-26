import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, Notification, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { setupAutoUpdater, checkForUpdatesManually } from './updater'

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
    mainWindow?.hide()
  })
}

function showWindow() {
  if (!mainWindow) return

  const trayBounds = tray?.getBounds()
  if (!trayBounds) return

  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - WINDOW_WIDTH / 2)
  const y = trayBounds.y + trayBounds.height + 4

  const maxX = display.bounds.x + display.bounds.width - WINDOW_WIDTH - 8
  const adjustedX = Math.min(Math.max(x, display.bounds.x + 8), maxX)

  mainWindow.setPosition(adjustedX, y)
  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    showWindow()
  }
}

app.dock?.hide()

app.whenReady().then(() => {
  const icon = loadTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('GitBar')
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
  setupAutoUpdater()
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
  mainWindow?.hide()
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
