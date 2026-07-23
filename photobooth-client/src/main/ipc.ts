import { BrowserWindow, ipcMain, app } from 'electron'
import { DslrManager, killPtpDaemon } from './gphoto2'
import { OfflineQueue } from './offlineQueue'
import { readFile, writeFile, readdir } from 'fs/promises'
import path from 'path'
import fs from 'fs'

const SETTINGS_FILE = path.join(app.getPath('userData'), 'booth-settings.json')
const DEFAULT_SETTINGS = {
  photoCount: 4,
  countdown: 5,
  captureInterval: 1,
  postCapturePreview: 2,
  serverUrl: 'http://localhost:3000',
  cameraMode: 'webcam' as 'webcam' | 'dslr',
  dslrCameraPort: null as string | null,
  dslrIso: 'auto',
  dslrShutterSpeed: 'auto',
  dslrAperture: 'auto',
}

let _offlineQueue: OfflineQueue
let _serverUrl: string
let _setServerUrl: (url: string) => void
let _dslrManager: DslrManager
let _mainWindow: BrowserWindow

function getSettingsSync() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function initIpcHandlers(
  mainWindow: BrowserWindow,
  dslrManager: DslrManager,
  offlineQueue: OfflineQueue,
  serverUrl: string,
  setServerUrl: (url: string) => void
) {
  _offlineQueue = offlineQueue
  _serverUrl = serverUrl
  _setServerUrl = setServerUrl
  _dslrManager = dslrManager
  _mainWindow = mainWindow

  const settings = getSettingsSync()
  if (settings.dslrCameraPort) {
    _dslrManager.setCameraPort(settings.dslrCameraPort)
  }

  // ------------------------------------------------------------------
  // DSLR liveview — start
  // ------------------------------------------------------------------
  ipcMain.handle('start-dslr-liveview', async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[IPC] start-dslr-liveview called')
    try {
      console.log('[IPC] Running detect before starting liveview...')
      const { connected } = await dslrManager.detect()
      console.log(`[IPC] detect() result: connected=${connected}, model="${dslrManager.getStatus().model}"`)
      if (!connected) {
        const msg = 'No DSLR camera detected. Check USB connection.'
        console.warn(`[IPC] start-dslr-liveview — ${msg}`)
        return { success: false, error: msg }
      }

      console.log('[IPC] Camera detected — starting liveview stream (will kill PTPCamera on macOS, then wait for first frame)...')
      let framesSent = 0
      const liveviewOk = await dslrManager.startLiveview((jpeg) => {
        if (!mainWindow.isDestroyed()) {
          framesSent++
          if (framesSent === 1) console.log(`[IPC] First dslr-frame sent to renderer (${jpeg.length} bytes base64)`)
          if (framesSent % 150 === 0) console.log(`[IPC] dslr-frame: ${framesSent} frames pushed to renderer`)
          // Send as base64 string; renderer wraps in data:image/jpeg;base64,
          mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
        }
      })

      if (!liveviewOk) {
        const msg = 'Camera found but liveview failed to start. The macOS PTPCamera daemon may still be holding the USB interface. Unplug and re-plug the camera, then try again.'
        console.error(`[IPC] start-dslr-liveview — ${msg}`)
        return { success: false, error: msg }
      }

      console.log('[IPC] start-dslr-liveview — returning success=true')
      return { success: true }
    } catch (err: any) {
      console.error('[IPC] start-dslr-liveview error:', err.message)
      return { success: false, error: err.message }
    }
  })

  // ------------------------------------------------------------------
  // DSLR liveview — stop
  // ------------------------------------------------------------------
  ipcMain.handle('stop-dslr-liveview', async (): Promise<{ success: boolean }> => {
    console.log('[IPC] stop-dslr-liveview called')
    await dslrManager.stopLiveview()
    console.log('[IPC] stop-dslr-liveview done')
    return { success: true }
  })

  // ------------------------------------------------------------------
  // Detect DSLR (on-demand from renderer / settings panel)
  // ------------------------------------------------------------------
  ipcMain.handle('detect-dslr', async (): Promise<{ connected: boolean; model: string; cameras: any[] }> => {
    console.log('[IPC] detect-dslr called')
    const { connected } = await dslrManager.detect()
    const status = dslrManager.getStatus()
    console.log(`[IPC] detect-dslr result: connected=${connected}, model="${status.model}"`)
    // Push updated status to renderer
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dslr-status', status)
    }
    return { connected, model: status.model, cameras: status.cameras }
  })

  // ------------------------------------------------------------------
  // Camera mode persist
  // ------------------------------------------------------------------
  ipcMain.handle('get-camera-mode', (): 'webcam' | 'dslr' => {
    const settings = getSettingsSync()
    return settings.cameraMode || 'webcam'
  })

  ipcMain.handle('set-camera-mode', (_event, mode: 'webcam' | 'dslr'): { success: boolean } => {
    try {
      const settings = getSettingsSync()
      settings.cameraMode = mode
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
      return { success: true }
    } catch (err: any) {
      return { success: false }
    }
  })

  // ------------------------------------------------------------------
  // DSLR Camera Port
  // ------------------------------------------------------------------
  ipcMain.handle('set-dslr-camera-port', (_event, port: string): { success: boolean } => {
    try {
      console.log(`[IPC] set-dslr-camera-port called: ${port}`)
      dslrManager.setCameraPort(port)
      const settings = getSettingsSync()
      settings.dslrCameraPort = port
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
      // Trigger a re-detect so the model name updates and status is pushed
      dslrManager.detect().then(() => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('dslr-status', dslrManager.getStatus())
        }
      })
      return { success: true }
    } catch (err: any) {
      return { success: false }
    }
  })

  // ------------------------------------------------------------------
  // Prep DSLR capture (stop liveview, begin AF during countdown)
  // ------------------------------------------------------------------
  ipcMain.handle('prep-dslr-capture', async (): Promise<{ success: boolean }> => {
    console.log('[IPC] prep-dslr-capture called')
    await dslrManager.prepCapture()
    return { success: true }
  })

  // ------------------------------------------------------------------
  // Capture photo (DSLR or webcam blob — unified endpoint)
  // ------------------------------------------------------------------
  ipcMain.handle('capture-photo', async (_event, options?: { liveviewStopped?: boolean }): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const settings = getSettingsSync()
      const result = await dslrManager.capture({
        iso: settings.dslrIso,
        shutterSpeed: settings.dslrShutterSpeed,
        aperture: settings.dslrAperture,
        liveviewStopped: options?.liveviewStopped,
      })
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ------------------------------------------------------------------
  // Upload photos
  // ------------------------------------------------------------------
  ipcMain.handle('upload-photos', async (event, data: {
    sessionId: string
    imagePaths: string[]
    imageBuffers?: ArrayBuffer[]
    frameName?: string | null
    photoCount: number
  }) => {
    try {
      const formData = new FormData()
      for (const imagePath of data.imagePaths) {
        const buffer = await readFile(imagePath)
        const blob = new Blob([buffer])
        formData.append('photos', blob, path.basename(imagePath))
      }
      if (data.imageBuffers) {
        for (let i = 0; i < data.imageBuffers.length; i++) {
          const blob = new Blob([data.imageBuffers[i]])
          formData.append('photos', blob, `photo_${i}.jpg`)
        }
      }
      formData.append('sessionId', data.sessionId)
      formData.append('photoCount', String(data.photoCount))
      if (data.frameName) formData.append('frameName', data.frameName)

      const settings = getSettingsSync()
      const headers: Record<string, string> = {}
      if (settings.otp) headers['X-Booth-OTP'] = settings.otp

      const response = await fetch(`${_serverUrl}/api/booth/upload`, {
        method: 'POST',
        body: formData,
        headers,
      })
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`)

      mainWindow.webContents.send('upload-complete', { sessionId: data.sessionId, success: true })
      return { success: true }
    } catch (error: any) {
      const paths = data.imagePaths.filter((p) => fs.existsSync(p))
      if (paths.length > 0) {
        offlineQueue.enqueue(data.sessionId, { frameName: data.frameName, photoCount: data.photoCount }, paths)
      }
      return { success: false, error: error.message, queued: true }
    }
  })

  ipcMain.handle('upload-queued', async () => {
    const pending = offlineQueue.getPending()
    const settings = getSettingsSync()
    const headers: Record<string, string> = {}
    if (settings.otp) headers['X-Booth-OTP'] = settings.otp

    for (const job of pending) {
      try {
        const formData = new FormData()
        const imagePaths = JSON.parse(job.imagePaths) as string[]
        for (const imagePath of imagePaths) {
          if (fs.existsSync(imagePath)) {
            const buffer = await readFile(imagePath)
            const blob = new Blob([buffer])
            formData.append('photos', blob, path.basename(imagePath))
          }
        }
        formData.append('sessionId', job.sessionId)
        const metadata = JSON.parse(job.metadata || '{}')
        formData.append('photoCount', String(metadata.photoCount || 1))
        if (metadata.frameName) formData.append('frameName', metadata.frameName)

        const response = await fetch(`${_serverUrl}/api/booth/upload`, {
          method: 'POST',
          body: formData,
          headers,
        })
        if (response.ok) {
          offlineQueue.markCompleted(job.id)
        } else {
          throw new Error('Upload failed')
        }
      } catch {
        offlineQueue.markFailed(job.id)
        offlineQueue.scheduleRetry(job.id, job.retryCount + 1)
      }
    }
    return { flushed: pending.length }
  })

  ipcMain.handle('get-queue-depth', () => {
    return offlineQueue.getDepth()
  })

  ipcMain.handle('get-hardware-status', () => {
    return dslrManager.getStatus()
  })

  ipcMain.handle('get-settings', () => {
    return getSettingsSync()
  })

  ipcMain.handle('save-settings', async (event, settings: {
    photoCount: number
    countdown: number
    captureInterval: number
    postCapturePreview: number
    serverUrl?: string
    otp?: string
    cameraMode?: 'webcam' | 'dslr'
    dslrIso?: string
    dslrShutterSpeed?: string
    dslrAperture?: string
  }) => {
    try {
      const existing = getSettingsSync()
      const merged = { ...existing, ...settings }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2))
      const syncUrl = merged.serverUrl || _serverUrl
      if (merged.serverUrl && merged.serverUrl !== _serverUrl) {
        _serverUrl = merged.serverUrl
        _setServerUrl(merged.serverUrl)
      }
      try {
        const body: Record<string, any> = {
          photoCount: merged.photoCount,
          countdown: merged.countdown,
          captureInterval: merged.captureInterval,
          postCapturePreview: merged.postCapturePreview,
          dslrIso: merged.dslrIso,
          dslrShutterSpeed: merged.dslrShutterSpeed,
          dslrAperture: merged.dslrAperture,
        }
        if (merged.otp) body.otp = merged.otp
        await fetch(`${syncUrl}/api/booth/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch {}
      
      // Apply new DSLR exposure settings to the live view if connected
      if (merged.cameraMode === 'dslr') {
        dslrManager.applyExposure(
          merged.dslrIso || 'auto',
          merged.dslrShutterSpeed || 'auto',
          merged.dslrAperture || 'auto'
        )
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-server-config', () => {
    return { serverUrl }
  })

  // ------------------------------------------------------------------
  // macOS: kill PTPCamera daemon and re-detect
  // ------------------------------------------------------------------
  ipcMain.handle('kill-ptp-daemon', async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[IPC] kill-ptp-daemon called')
    try {
      await killPtpDaemon()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}

export async function flushQueuedUploads() {
  const pending = _offlineQueue.getPending()
  const settings = getSettingsSync()
  const headers: Record<string, string> = {}
  if (settings.otp) headers['X-Booth-OTP'] = settings.otp

  for (const job of pending) {
    try {
      const formData = new FormData()
      const imagePaths = JSON.parse(job.imagePaths) as string[]
      for (const imagePath of imagePaths) {
        if (fs.existsSync(imagePath)) {
          const buffer = await readFile(imagePath)
          const blob = new Blob([buffer])
          formData.append('photos', blob, path.basename(imagePath))
        }
      }
      formData.append('sessionId', job.sessionId)
      const metadata = JSON.parse(job.metadata || '{}')
      formData.append('photoCount', String(metadata.photoCount || 1))
      if (metadata.frameName) formData.append('frameName', metadata.frameName)

      const response = await fetch(`${_serverUrl}/api/booth/upload`, {
        method: 'POST',
        body: formData,
        headers,
      })
      if (response.ok) {
        _offlineQueue.markCompleted(job.id)
      } else {
        throw new Error('Upload failed')
      }
    } catch {
      _offlineQueue.markFailed(job.id)
      _offlineQueue.scheduleRetry(job.id, job.retryCount + 1)
    }
  }
  return { flushed: pending.length }
}
