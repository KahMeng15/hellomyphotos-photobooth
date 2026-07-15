import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { initIpcHandlers } from './ipc'
import { OfflineQueue } from './offlineQueue'
import { DslrManager } from './gphoto2'

let mainWindow: BrowserWindow | null = null
let dslrManager: DslrManager
let offlineQueue: OfflineQueue
let intervals: NodeJS.Timeout[] = []

const isDev = !app.isPackaged
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'
const ROOT = app.getAppPath()

app.on('ready', async () => {
  offlineQueue = new OfflineQueue()
  dslrManager = new DslrManager()

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(screenWidth, 1920),
    height: Math.min(screenHeight, 1080),
    fullscreen: false,
    frame: true,
    kiosk: false,
    webPreferences: {
      preload: path.join(ROOT, 'dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.loadFile(path.join(ROOT, 'src/renderer/index.html'))

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  initIpcHandlers(mainWindow!, dslrManager, offlineQueue, SERVER_URL)

  await dslrManager.detect()

  mainWindow.webContents.on('did-finish-load', () => {
    sendIfAlive('server-config', {
      serverUrl: SERVER_URL,
      dslrConnected: dslrManager.isConnected(),
    })
  })

  intervals.push(setInterval(async () => {
    const online = await checkServerOnline(SERVER_URL)
    sendIfAlive('server-status', { online })
    if (online) {
      fetch(`${SERVER_URL}/api/booth/heartbeat`, { method: 'POST' }).catch(() => {})
    }
  }, 10000))

  intervals.push(setInterval(async () => {
    try {
      const depth = offlineQueue.getDepth()
      sendIfAlive('queue-update', { offline: depth })
    } catch {}
  }, 5000))

  intervals.push(setInterval(async () => {
    try {
      const online = await checkServerOnline(SERVER_URL)
      if (online) {
        const { flushQueuedUploads } = await import('./ipc')
        await flushQueuedUploads()
      }
    } catch {}
  }, 15000))
})

function sendIfAlive(channel: string, data: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

async function checkServerOnline(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

app.on('before-quit', () => {
  intervals.forEach(clearInterval)
  intervals = []
  offlineQueue?.close()
})

app.on('window-all-closed', () => {
  intervals.forEach(clearInterval)
  intervals = []
  offlineQueue?.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    app.emit('ready')
  }
})
