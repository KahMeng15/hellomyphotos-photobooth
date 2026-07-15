import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { initIpcHandlers } from './ipc'
import { OfflineQueue } from './offlineQueue'
import { DslrManager } from './gphoto2'

let mainWindow: BrowserWindow | null = null
let dslrManager: DslrManager
let offlineQueue: OfflineQueue

const isDev = !app.isPackaged
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'

app.on('ready', async () => {
  offlineQueue = new OfflineQueue()
  dslrManager = new DslrManager()

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(screenWidth, 1920),
    height: Math.min(screenHeight, 1080),
    fullscreen: !isDev,
    frame: isDev,
    kiosk: !isDev,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  initIpcHandlers(mainWindow, dslrManager, offlineQueue, SERVER_URL)

  await dslrManager.detect()

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('server-config', {
      serverUrl: SERVER_URL,
      dslrConnected: dslrManager.isConnected(),
    })
  })

  setInterval(async () => {
    const online = await checkServerOnline(SERVER_URL)
    mainWindow?.webContents.send('server-status', { online })
  }, 10000)

  setInterval(async () => {
    const depth = offlineQueue.getDepth()
    mainWindow?.webContents.send('queue-update', { offline: depth })
  }, 5000)
})

async function checkServerOnline(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

app.on('window-all-closed', () => {
  offlineQueue.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    app.emit('ready')
  }
})
