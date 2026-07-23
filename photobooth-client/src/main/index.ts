import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { initIpcHandlers } from './ipc'
import { OfflineQueue } from './offlineQueue'
import { DslrManager } from './gphoto2'

let mainWindow: BrowserWindow | null = null
let dslrManager: DslrManager
let offlineQueue: OfflineQueue
let intervals: NodeJS.Timeout[] = []

const isDev = !app.isPackaged
const ROOT = app.getAppPath()
const SETTINGS_FILE = path.join(app.getPath('userData'), 'booth-settings.json')

function loadServerUrl(): string {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
    if (settings.serverUrl) return settings.serverUrl
  } catch {}
  return process.env.SERVER_URL || 'http://localhost:3000'
}

let activeServerUrl = loadServerUrl()

function setActiveServerUrl(url: string) {
  activeServerUrl = url
  sendIfAlive('server-config', {
    serverUrl: url,
    dslrConnected: dslrManager?.isConnected() ?? false,
  })
}

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

  // Give DslrManager a reference to the window so it can push liveview frames
  // and status events (dslr-frame, dslr-status, dslr-disconnected) to the renderer.
  dslrManager.setWindow(mainWindow!)

  initIpcHandlers(mainWindow!, dslrManager, offlineQueue, activeServerUrl, setActiveServerUrl)

  await dslrManager.detect()

  mainWindow.webContents.on('did-finish-load', () => {
    sendIfAlive('server-config', {
      serverUrl: activeServerUrl,
      dslrConnected: dslrManager.isConnected(),
    })
    fetch(`${activeServerUrl}/api/booth/heartbeat`, { method: 'POST' }).catch(() => {})
  })

  intervals.push(setInterval(async () => {
    const online = await checkServerOnline(activeServerUrl)
    sendIfAlive('server-status', { online })

    fetch(`${activeServerUrl}/api/booth/heartbeat`, { method: 'POST' }).catch(() => {})

    if (!online) return

    // HTTP command polling is a fallback for environments where WebSocket is unavailable.
    // Commands are primarily delivered in real-time via the booth's WebSocket connection.
    try {
      const res = await fetch(`${activeServerUrl}/api/booth/commands`)
      if (res.ok) {
        const { commands } = await res.json()
        for (const cmd of commands) {
          sendIfAlive('booth-command', cmd)
        }
      }
    } catch {}
  }, 30000))

  intervals.push(setInterval(async () => {
    try {
      const depth = offlineQueue.getDepth()
      sendIfAlive('queue-update', { offline: depth })
    } catch {}
  }, 5000))

  intervals.push(setInterval(async () => {
    try {
      const online = await checkServerOnline(activeServerUrl)
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

function cleanupAndQuit() {
  intervals.forEach(clearInterval)
  intervals = []
  offlineQueue?.close()
  // Kill all tracked gphoto2 child processes so the USB interface is released
  // before the process exits. Without this, Ctrl+C or window-close leaves
  // orphaned gphoto2 subprocesses holding the camera, causing "Could not claim
  // the USB device" errors on the next launch.
  dslrManager?.shutdown().catch(() => {})
}

app.on('before-quit', cleanupAndQuit)

// Handle Ctrl+C (SIGINT from terminal) and kill signals from the OS.
// Electron doesn't forward these to 'before-quit' automatically when the
// process is launched from a terminal with electron-forge start.
process.on('SIGINT', () => {
  console.log('[App] SIGINT received — shutting down')
  cleanupAndQuit()
  setTimeout(() => process.exit(0), 1500)
})
process.on('SIGTERM', () => {
  console.log('[App] SIGTERM received — shutting down')
  cleanupAndQuit()
  setTimeout(() => process.exit(0), 1500)
})

app.on('window-all-closed', () => {
  cleanupAndQuit()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    app.emit('ready')
  }
})
