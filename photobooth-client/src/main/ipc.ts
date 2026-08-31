import { BrowserWindow, ipcMain, app, nativeImage } from 'electron'
import { DslrManager, killPtpDaemon } from './gphoto2'
import { OfflineQueue } from './offlineQueue'
import { readFile, writeFile, readdir } from 'fs/promises'
import path from 'path'
import fs from 'fs'

const SETTINGS_FILE = path.join(app.getPath('userData'), 'booth-settings.json')

// ---------------------------------------------------------------------------
// In-memory log buffer (captures console output for the "View Logs" button)
// ---------------------------------------------------------------------------
const MAX_LOG_LINES = 1000
const _logBuffer: string[] = []

function _captureLog(level: string, args: any[]) {
  const line = `[${new Date().toISOString().slice(11, 23)}][${level}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`
  _logBuffer.push(line)
  if (_logBuffer.length > MAX_LOG_LINES) _logBuffer.shift()
}

const _origLog = console.log
const _origWarn = console.warn
const _origError = console.error
console.log = (...args: any[]) => { _captureLog('LOG', args); _origLog.apply(console, args) }
console.warn = (...args: any[]) => { _captureLog('WARN', args); _origWarn.apply(console, args) }
console.error = (...args: any[]) => { _captureLog('ERR', args); _origError.apply(console, args) }
const DEFAULT_SETTINGS = {
  photoCount: 4,
  countdown: 5,
  captureInterval: 1,
  postCapturePreview: 2,
  serverUrl: '',
  cameraMode: 'webcam' as 'webcam' | 'dslr',
  dslrCameraPort: null as string | null,
  dslrIso: 'auto',
  dslrShutterSpeed: 'auto',
  dslrAperture: 'auto',
  dslrFocusMode: 'auto',
  liveviewMode: 'mjpeg',
  autoPreview: false,
  liveviewRetryAttempts: 1,
  shutterOffsetDelay: 0,
  dslrWhiteBalanceKelvin: 5200,
  
  // Advanced Dev Settings (Network Simulation)
  devSimulationEnabled: false,
  devSimulateOffline: false,
  devLatencyMs: 0,
  devUploadThrottleKbps: 0,
  devPacketLossPercent: 0,
  devServerErrorPercent: 0,
  devTimeoutPercent: 0,
}

let _offlineQueue: OfflineQueue
let _serverUrl: string
let _setServerUrl: (url: string) => void
let _dslrManager: DslrManager
let _mainWindow: BrowserWindow

/** Stashed frame callback so save-settings can restart liveview with a new mode. */
let _liveviewFrameCallback: ((jpeg: Buffer) => void) | null = null

function getSettingsSync() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

// ------------------------------------------------------------------
// Advanced Dev Settings: Network Simulation
// ------------------------------------------------------------------
async function applyNetworkSimulation() {
  const s = getSettingsSync()
  if (!s.devSimulationEnabled) return
  
  if (s.devSimulateOffline) {
    throw new Error('fetch failed: Simulated Offline Mode')
  }
  if (s.devLatencyMs > 0) {
    await new Promise(r => setTimeout(r, s.devLatencyMs))
  }
  if (s.devTimeoutPercent > 0 && Math.random() * 100 < s.devTimeoutPercent) {
    throw new Error('fetch failed: timeout simulated')
  }
  if (s.devPacketLossPercent > 0 && Math.random() * 100 < s.devPacketLossPercent) {
    throw new Error('fetch failed: Simulated Packet Loss (ECONNRESET)')
  }
  if (s.devServerErrorPercent > 0 && Math.random() * 100 < s.devServerErrorPercent) {
    const err: any = new Error('Simulated 503 Service Unavailable')
    err.response = { status: 503, data: 'Service Unavailable' }
    err.status = 503
    throw err
  }
}

const _origFetch = global.fetch
global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  await applyNetworkSimulation()
  return _origFetch(input, init)
}

import { Readable } from 'stream'

function createThrottledStream(buffer: Buffer, kbps: number): Readable {
  const stream = new Readable()
  // chunk size in bytes per 100ms
  const chunkSize = kbps > 0 ? Math.max(1024, Math.floor((kbps * 1024) / 10)) : 64 * 1024
  const delayMs = kbps > 0 ? 100 : 0
  let offset = 0

  stream._read = () => {
    if (offset >= buffer.length) {
      stream.push(null)
      return
    }
    const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length))
    offset += chunk.length
    if (delayMs > 0) {
      setTimeout(() => {
        stream.push(chunk)
        if (offset >= buffer.length) stream.push(null)
      }, delayMs)
    } else {
      stream.push(chunk)
      if (offset >= buffer.length) stream.push(null)
    }
  }
  return stream
}


// ---------------------------------------------------------------------------
// Gallery thumbnail generation
// Uses Electron's built-in nativeImage — no extra npm deps required.
// Runs async/fire-and-forget after enqueueing so it never blocks the capture flow.
// ---------------------------------------------------------------------------

const THUMB_WIDTH = 420  // px — wide enough for 2-col detail grid, tiny for cards
const THUMB_QUALITY = 72 // JPEG quality 0–100

async function generateGalleryThumbnails(
  sessionId: string,
  imagePaths: string[],
  queue: OfflineQueue
): Promise<void> {
  try {
    const thumbDir = path.join(app.getPath('userData'), 'gallery_thumbs')
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true })

    const thumbPaths: string[] = []

    for (let i = 0; i < imagePaths.length; i++) {
      const srcPath = imagePaths[i]
      if (!fs.existsSync(srcPath)) continue

      const thumbName = `${sessionId}_${i}_thumb.jpg`
      const thumbPath = path.join(thumbDir, thumbName)

      // Skip if thumb already exists (e.g. re-enqueue after retry)
      if (fs.existsSync(thumbPath)) {
        thumbPaths.push(thumbPath)
        continue
      }

      try {
        const ni = nativeImage.createFromPath(srcPath)
        if (ni.isEmpty()) continue

        const resized = ni.resize({ width: THUMB_WIDTH, quality: 'good' })
        const buffer = resized.toJPEG(THUMB_QUALITY)
        await fs.promises.writeFile(thumbPath, buffer)
        thumbPaths.push(thumbPath)
      } catch (err) {
        console.warn(`[Gallery] Thumbnail failed for ${srcPath}:`, err)
      }
    }

    if (thumbPaths.length > 0) {
      queue.setThumbPaths(sessionId, thumbPaths)
      console.log(`[Gallery] Generated ${thumbPaths.length} thumbnail(s) for session ${sessionId}`)
    }
  } catch (err) {
    console.error('[Gallery] Thumbnail generation error:', err)
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
  if (settings.liveviewRetryAttempts) {
    _dslrManager.setLiveviewRetryAttempts(settings.liveviewRetryAttempts)
  }

  // ------------------------------------------------------------------
  // DSLR liveview — start
  // ------------------------------------------------------------------
  ipcMain.handle('start-dslr-liveview', async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[IPC] start-dslr-liveview called')
    try {
      console.log('[IPC] Running detect before starting liveview...')
      const { connected } = await dslrManager.detect(true)
      console.log(`[IPC] detect() result: connected=${connected}, model="${dslrManager.getStatus().model}"`)
      if (!connected) {
        const msg = 'No DSLR camera detected. Check USB connection.'
        console.warn(`[IPC] start-dslr-liveview — ${msg}`)
        return { success: false, error: msg }
      }

      const savedSettings = getSettingsSync()
      const autoPreview = !!savedSettings.autoPreview
      if (!autoPreview && dslrManager.getStatus().model) {
        await syncCameraSettingsFromServer(dslrManager.getStatus().model, true)
      }

      // If autoPreview is on, reset camera to auto exposure before starting liveview
      if (autoPreview) {
        console.log('[IPC] autoPreview — resetting camera to auto exposure')
        await dslrManager.applyAutoExposure()
      }

      console.log('[IPC] Camera detected — starting liveview stream (will kill PTPCamera on macOS, then wait for first frame)...')
      const liveviewMode: 'mjpeg' | 'polling' = savedSettings.liveviewMode || 'mjpeg'
      console.log(`[IPC] start-dslr-liveview — liveviewMode from settings: ${liveviewMode}`)
      let framesSent = 0
      _liveviewFrameCallback = (jpeg) => {
        if (!mainWindow.isDestroyed()) {
          framesSent++
          if (framesSent === 1) console.log(`[IPC] First dslr-frame sent to renderer (${jpeg.length} bytes base64)`)
          if (framesSent % 150 === 0) console.log(`[IPC] dslr-frame: ${framesSent} frames pushed to renderer`)
          // Send as base64 string; renderer wraps in data:image/jpeg;base64,
          mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
        }
      }
      const liveviewOk = await dslrManager.startLiveview(_liveviewFrameCallback, liveviewMode)

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

  async function syncCameraSettingsFromServer(model: string, applyToCamera = true) {
    try {
      const s = getSettingsSync()
      const headers: Record<string, string> = {}
      if (s.otp) headers['x-booth-otp'] = s.otp
      const res = await fetch(`${_serverUrl}/api/booth/camera-settings?model=${encodeURIComponent(model)}`, { headers })
      const data = await res.json()
      
      const hw = await dslrManager.getHardwareSettings()
      let changed = false
      
      const reconcile = (serverVal: string | undefined, hwVal: string, currentAppVal: string) => {
        if (serverVal && serverVal !== 'auto') return serverVal
        if (serverVal === 'auto') return 'auto'
        if (currentAppVal && currentAppVal !== 'auto') return currentAppVal
        if (currentAppVal === 'auto') return 'auto'
        return hwVal
      }

      const newIso = reconcile(data.settings?.dslrIso, hw.iso, s.dslrIso)
      const newShutter = reconcile(data.settings?.dslrShutterSpeed, hw.shutterspeed, s.dslrShutterSpeed)
      const newAperture = reconcile(data.settings?.dslrAperture, hw.aperture, s.dslrAperture)
      const newWB = reconcile(data.settings?.dslrWhiteBalance, hw.whitebalance, s.dslrWhiteBalance)
      
      if (newIso !== s.dslrIso) { s.dslrIso = newIso; changed = true; }
      if (newShutter !== s.dslrShutterSpeed) { s.dslrShutterSpeed = newShutter; changed = true; }
      if (newAperture !== s.dslrAperture) { s.dslrAperture = newAperture; changed = true; }
      if (newWB !== s.dslrWhiteBalance) { s.dslrWhiteBalance = newWB; changed = true; }
      
      if (data.settings?.dslrFocusMode && data.settings.dslrFocusMode !== 'auto' && s.dslrFocusMode !== data.settings.dslrFocusMode) { 
          s.dslrFocusMode = data.settings.dslrFocusMode; 
          changed = true; 
      }

      if (changed) {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2))
        if (applyToCamera) {
          dslrManager.applyExposure(s.dslrIso, s.dslrShutterSpeed, s.dslrAperture, s.dslrWhiteBalance, s.dslrWhiteBalanceKelvin)
          dslrManager.setFocusMode(s.dslrFocusMode as any)
        }
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('booth-command', { type: 'settings-update', settings: s })
        }
        
        // Push adopted settings up to server
        fetch(`${_serverUrl}/api/booth/camera-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-booth-otp': s.otp || '' },
          body: JSON.stringify({
            model: model,
            dslrIso: s.dslrIso,
            dslrShutterSpeed: s.dslrShutterSpeed,
            dslrAperture: s.dslrAperture,
            dslrWhiteBalance: s.dslrWhiteBalance,
            dslrWhiteBalanceKelvin: s.dslrWhiteBalanceKelvin,
            dslrFocusMode: s.dslrFocusMode,
          }),
        }).catch(() => {})

        if (s.otp) {
          fetch(`${_serverUrl}/api/booth/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s),
          }).catch(() => {})
        }
      } else if (applyToCamera) {
        // Ensure camera is aligned with local settings
        dslrManager.applyExposure(s.dslrIso, s.dslrShutterSpeed, s.dslrAperture, s.dslrWhiteBalance, s.dslrWhiteBalanceKelvin)
      }
    } catch (err) {
      console.error('[IPC] Failed to restore camera settings', err)
    }
  }

  // ------------------------------------------------------------------
  // Detect DSLR (on-demand from renderer / settings panel)
  // ------------------------------------------------------------------
  ipcMain.handle('detect-dslr', async (): Promise<{ connected: boolean; model: string; cameras: any[]; whiteBalanceChoices: string[] }> => {
    console.log('[IPC] detect-dslr called')
    const cached = dslrManager.getStatus()

    // If liveview is already active, the camera is connected — skip spawning
    // gphoto2 commands that compete with the liveview stream for the USB interface.
    if (cached.liveviewActive) {
      const choices = dslrManager.getStatus().configChoices?.whitebalance || []
      return { connected: true, model: cached.model, cameras: cached.cameras, whiteBalanceChoices: choices }
    }

    const { connected } = await dslrManager.detect()
    // Wait for config choices so the UI gets the actual camera white balance presets
    if (connected) {
      await dslrManager.fetchConfigChoices()
    }
    const status = dslrManager.getStatus()
    const whiteBalanceChoices = status.configChoices?.whitebalance || []
    console.log(`[IPC] detect-dslr result: connected=${connected}, model="${status.model}", wbChoices=${whiteBalanceChoices.length}`)

    if (connected && status.model) {
      const s = getSettingsSync()
      if (!s.autoPreview) {
        await syncCameraSettingsFromServer(status.model)
      }
    }

    // Push updated status to renderer
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dslr-status', status)
    }
    return { connected, model: status.model, cameras: status.cameras, whiteBalanceChoices }
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
    const settings = getSettingsSync()
    const autoPreview = !!settings.autoPreview
    await dslrManager.prepCapture()
    if (autoPreview) {
      // Liveview stopped, mirror down — USB is free. Apply user's saved settings
      // so the actual photo uses their chosen exposure.
      console.log('[IPC] autoPreview — applying manual exposure settings for capture')
      dslrManager.applyExposure(
        settings.dslrIso || 'auto',
        settings.dslrShutterSpeed || 'auto',
        settings.dslrAperture || 'auto',
        settings.dslrWhiteBalance || 'auto',
        settings.dslrWhiteBalanceKelvin
      )
    }
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
    shareTitle?: string | null
  }) => {
    // Step 1: Reserve a shareId before upload starts (for instant QR)
    let reservedShareId: string | undefined
    let reservedShareUrl: string | undefined
    try {
      const reserveHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      const s = getSettingsSync()
      if (s.otp) reserveHeaders['X-Booth-OTP'] = s.otp
      const reserveRes = await fetch(`${_serverUrl}/api/booth/session/reserve`, {
        method: 'POST',
        headers: reserveHeaders,
        body: JSON.stringify({ sessionId: data.sessionId }),
        signal: AbortSignal.timeout(5000),
      })
      if (reserveRes.ok) {
        const rd = await reserveRes.json()
        reservedShareId = rd.shareId
        reservedShareUrl = rd.shareUrl
        if (reservedShareId && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('share-id-ready', {
            sessionId: data.sessionId,
            shareId: reservedShareId,
            shareUrl: reservedShareUrl
          })
        }
      }
    } catch {
      // Server unreachable — QR will use sessionId fallback
    }

    const finalPaths: string[] = [...data.imagePaths]

    if (data.imageBuffers && data.imageBuffers.length > 0) {
      const tempDir = path.join(app.getPath('userData'), 'temp_photos')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      
      for (let i = 0; i < data.imageBuffers.length; i++) {
        const tempPath = path.join(tempDir, `${data.sessionId}_${i}.jpg`)
        await fs.promises.writeFile(tempPath, Buffer.from(data.imageBuffers[i]))
        finalPaths.push(tempPath)
      }
    }

    // Always queue the job first
    offlineQueue.enqueue(data.sessionId, { frameName: data.frameName, photoCount: data.photoCount, shareTitle: data.shareTitle }, finalPaths, reservedShareId)
    
    // Kick off the queue processor asynchronously
    flushQueuedUploads().catch(() => {})

    return { success: true, shareId: reservedShareId, queued: true }
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
        if (metadata.shareTitle) formData.append('shareTitle', metadata.shareTitle)

        const response = await fetch(`${_serverUrl}/api/booth/upload`, {
          method: 'POST',
          body: formData,
          headers,
        })
        if (response.ok) {
          const resData = await response.json().catch(() => ({}))
          offlineQueue.markCompleted(job.id, resData.shareId)
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
    dslrWhiteBalance?: string
    dslrWhiteBalanceKelvin?: number
    dslrFocusMode?: string
    liveviewMode?: 'mjpeg' | 'polling'
    autoPreview?: boolean
    liveviewRetryAttempts?: number
    shutterOffsetDelay?: number
    settingsPasscode?: string
    devSimulationEnabled?: boolean
    devSimulateOffline?: boolean
    devLatencyMs?: number
    devUploadThrottleKbps?: number
    devPacketLossPercent?: number
    devServerErrorPercent?: number
    devTimeoutPercent?: number
  }) => {
    try {
      const existing = getSettingsSync()
      const merged = { ...existing, ...settings }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2))
      const syncUrl = merged.serverUrl !== undefined ? merged.serverUrl : _serverUrl
      if (merged.serverUrl !== undefined && merged.serverUrl !== _serverUrl) {
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
          dslrWhiteBalance: merged.dslrWhiteBalance,
          dslrWhiteBalanceKelvin: merged.dslrWhiteBalanceKelvin,
          dslrFocusMode: merged.dslrFocusMode,
          settingsPasscode: merged.settingsPasscode,
        }
        if (merged.otp) body.otp = merged.otp
        await fetch(`${syncUrl}/api/booth/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const status = dslrManager.getStatus()
        if (status.connected && status.model) {
          await fetch(`${syncUrl}/api/booth/camera-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-booth-otp': merged.otp || '' },
            body: JSON.stringify({
              model: status.model,
              dslrIso: merged.dslrIso,
              dslrShutterSpeed: merged.dslrShutterSpeed,
              dslrAperture: merged.dslrAperture,
              dslrWhiteBalance: merged.dslrWhiteBalance,
              dslrWhiteBalanceKelvin: merged.dslrWhiteBalanceKelvin,
              dslrFocusMode: merged.dslrFocusMode,
            }),
          })
        }
      } catch {}
      
      // Update liveview retry count on the DslrManager
      if (typeof merged.liveviewRetryAttempts === 'number') {
        _dslrManager.setLiveviewRetryAttempts(merged.liveviewRetryAttempts)
      }

      // Apply new DSLR exposure settings to the live view if connected
      if (merged.cameraMode === 'dslr') {
        const status = dslrManager.getStatus()
        const modeChanged = merged.liveviewMode && merged.liveviewMode !== existing.liveviewMode
        const autoPreviewOn = !!merged.autoPreview
        const autoPreviewChanged = autoPreviewOn !== !!existing.autoPreview

        const exposureChanged = 
          merged.dslrIso !== existing.dslrIso ||
          merged.dslrShutterSpeed !== existing.dslrShutterSpeed ||
          merged.dslrAperture !== existing.dslrAperture ||
          merged.dslrWhiteBalance !== existing.dslrWhiteBalance ||
          merged.dslrWhiteBalanceKelvin !== existing.dslrWhiteBalanceKelvin

        if (modeChanged && status.liveviewActive && _liveviewFrameCallback) {
          // Liveview mode changed — full restart with new mode.
          const newMode = merged.liveviewMode as 'mjpeg' | 'polling'
          console.log(`[IPC] liveviewMode changed: ${existing.liveviewMode} → ${newMode} — full restart`)
          await dslrManager.stopLiveview()
          if (autoPreviewOn) {
            await dslrManager.applyAutoExposure()
          } else if (exposureChanged) {
            dslrManager.applyExposure(
              merged.dslrIso || 'auto',
              merged.dslrShutterSpeed || 'auto',
              merged.dslrAperture || 'auto',
              merged.dslrWhiteBalance || 'auto',
              merged.dslrWhiteBalanceKelvin
            )
          }
          if (settings.dslrFocusMode && settings.dslrFocusMode !== existing.dslrFocusMode) {
            dslrManager.setFocusMode(settings.dslrFocusMode as 'auto' | 'manual')
          }
          await dslrManager.startLiveview(_liveviewFrameCallback, newMode)
        } else {
          const wbChanged = merged.dslrWhiteBalance && merged.dslrWhiteBalance !== existing.dslrWhiteBalance
          if (autoPreviewOn) {
            // Auto preview: don't apply iso/shutter/aperture to camera during preview.
            // If autoPreview was just turned ON, reset camera to auto now.
            if (autoPreviewChanged) {
              dslrManager.applyAutoExposure()
            }
            // White balance is applied regardless of autoPreview.
            if (wbChanged) {
              dslrManager.applyExposure(
                'auto',
                'auto',
                'auto',
                merged.dslrWhiteBalance || 'auto',
                merged.dslrWhiteBalanceKelvin
              )
            }
          } else {
            // Normal path: apply all exposure settings while liveview is running.
            if (exposureChanged) {
              dslrManager.applyExposure(
                merged.dslrIso || 'auto',
                merged.dslrShutterSpeed || 'auto',
                merged.dslrAperture || 'auto',
                merged.dslrWhiteBalance || 'auto',
                merged.dslrWhiteBalanceKelvin
              )
            }
          }
          if (settings.dslrFocusMode && settings.dslrFocusMode !== existing.dslrFocusMode) {
            dslrManager.setFocusMode(settings.dslrFocusMode as 'auto' | 'manual')
          }
        }
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
  // DSLR Focus Controls
  // ------------------------------------------------------------------

  ipcMain.handle('dslr-set-focus-mode', async (_event, mode: 'auto' | 'manual'): Promise<{ success: boolean; error?: string }> => {
    console.log(`[IPC] dslr-set-focus-mode called: ${mode}`)
    return dslrManager.setFocusMode(mode)
  })

  ipcMain.handle('dslr-trigger-autofocus', async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[IPC] dslr-trigger-autofocus called')
    return dslrManager.triggerAutofocus()
  })

  ipcMain.handle('dslr-trigger-focus-near', async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[IPC] dslr-trigger-focus-near called')
    return dslrManager.triggerFocusNear()
  })

  ipcMain.handle('dslr-trigger-focus-far', async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[IPC] dslr-trigger-focus-far called')
    return dslrManager.triggerFocusFar()
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

  // ------------------------------------------------------------------
  // View logs
  // ------------------------------------------------------------------
  ipcMain.handle('get-logs', (): { lines: string[] } => {
    return { lines: [..._logBuffer] }
  })
  // ------------------------------------------------------------------
  // Upload queue management
  // ------------------------------------------------------------------
  ipcMain.handle('get-upload-queue', () => {
    return _offlineQueue.getAll()
  })

  ipcMain.handle('reset-failed-uploads', async () => {
    _offlineQueue.resetFailed()
    await flushQueuedUploads()
    return { ok: true }
  })

  ipcMain.handle('clear-upload-queue', () => {
    _offlineQueue.clearAll()
    return { ok: true }
  })

  ipcMain.handle('clear-history', () => {
    _offlineQueue.clearHistory()
    return { ok: true }
  })

  ipcMain.handle('remove-upload-job', (event, id: number) => {
    _offlineQueue.remove(id)
    cancelUploadJob(id)
    return { ok: true }
  })

  ipcMain.handle('retry-upload-job', (event, id: number) => {
    _offlineQueue.markRetrying(id)
    flushQueuedUploads().catch(() => {})
    return { ok: true }
  })

  ipcMain.handle('update-share-id', (event, id: number, shareId: string) => {
    _offlineQueue.updateShareId(id, shareId)
    return { ok: true }
  })

  ipcMain.handle('pause-queue', () => {
    _offlineQueue.pause()
    return { ok: true }
  })

  ipcMain.handle('resume-queue', () => {
    _offlineQueue.resume()
    flushQueuedUploads().catch(() => {})
    return { ok: true }
  })

  ipcMain.handle('get-recent-uploads', (event, limit?: number) => {
    return _offlineQueue.getRecentUploads(limit || 10)
  })

  ipcMain.handle('is-queue-paused', () => {
    return _offlineQueue.isQueuePaused()
  })

  ipcMain.handle('cancel-upload-job', (event, id: number) => {
    cancelUploadJob(id)
    return { ok: true }
  })

  ipcMain.handle('stop-all-uploads', () => {
    for (const id of Object.keys(activeCancelTokens)) {
      cancelUploadJob(Number(id))
    }
    return { ok: true }
  })

  ipcMain.handle('restart-uploads', () => {
    flushQueuedUploads().catch(() => {})
    return { ok: true }
  })
}

let activeCancelTokens: Record<number, any> = {}

export async function flushQueuedUploads() {
  if (_offlineQueue.isQueuePaused()) return { flushed: 0 }
  
  const pending = _offlineQueue.getPending()
  if (pending.length === 0) return { flushed: 0 }
  
  const settings = getSettingsSync()
  const headers: Record<string, string> = {}
  if (settings.otp) headers['X-Booth-OTP'] = settings.otp

  const axios = require('axios')

  for (const job of pending) {
    if (_offlineQueue.isQueuePaused()) break

    try {
      const formData = new FormData()
      const imagePaths = JSON.parse(job.imagePaths) as string[]
      let hasFiles = false
      let totalFileSize = 0
      for (const imagePath of imagePaths) {
        if (fs.existsSync(imagePath)) {
          const buffer = await readFile(imagePath)
          const blob = new Blob([buffer])
          totalFileSize += buffer.length
          formData.append('photos', blob, path.basename(imagePath))
          hasFiles = true
        }
      }
      if (!hasFiles) { _offlineQueue.markCompleted(job.id); continue }

      formData.append('sessionId', job.sessionId)
      const metadata = JSON.parse(job.metadata || '{}')
      formData.append('photoCount', String(metadata.photoCount || 1))
      if (metadata.frameName) formData.append('frameName', metadata.frameName)
      if (metadata.shareTitle) formData.append('shareTitle', metadata.shareTitle)
      if (job.shareId) formData.append('shareId', job.shareId)

      const startTime = Date.now()
      _offlineQueue.markUploading(job.id, startTime)
      
      let lastTime = startTime
      let lastLoaded = 0
      let finalSpeed = 0

      const source = axios.CancelToken.source()
      activeCancelTokens[job.id] = source

      await applyNetworkSimulation()

      const formResponse = new Response(formData as any)
      const formBuffer = Buffer.from(await formResponse.arrayBuffer())
      const contentType = formResponse.headers.get('content-type') || 'multipart/form-data'
      const finalHeaders = { ...headers, 'Content-Type': contentType, 'Content-Length': formBuffer.length.toString() }
      
      const uploadData = (settings.devSimulationEnabled && settings.devUploadThrottleKbps > 0) ? createThrottledStream(formBuffer, settings.devUploadThrottleKbps) : formBuffer

      const response = await axios.post(`${_serverUrl}/api/booth/upload`, uploadData, {
        headers: finalHeaders,
        cancelToken: source.token,
        onUploadProgress: (progressEvent: any) => {
          const { loaded, total } = progressEvent
          const now = Date.now()
          const timeDiff = (now - lastTime) / 1000
          
          if (timeDiff > 0.2 || loaded === total) {
            const bytesDiff = loaded - lastLoaded
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0
            finalSpeed = speed
            lastTime = now
            lastLoaded = loaded
            
            let speedStr = ''
            if (speed > 1024 * 1024) speedStr = (speed / (1024 * 1024)).toFixed(1) + ' MB/s'
            else speedStr = (speed / 1024).toFixed(0) + ' KB/s'

            const elapsedSeconds = Math.round((now - startTime) / 1000)
            const remainingBytes = total ? total - loaded : 0
            const etaSeconds = speed > 0 ? Math.round(remainingBytes / speed) : 0
            const percent = total ? Math.round((loaded / total) * 100) : 0
            
            _offlineQueue.updateStats(job.id, loaded, speed / 1024)
            
            if (_mainWindow && !_mainWindow.isDestroyed()) {
              _mainWindow.webContents.send('upload-progress', { 
                sessionId: job.sessionId, percent, speed: speedStr, elapsed: elapsedSeconds, eta: etaSeconds
              })
            }
          }
        }
      })
      
      delete activeCancelTokens[job.id]

      if (response.status === 200) {
        _offlineQueue.updateStats(job.id, totalFileSize, finalSpeed / 1024)
        const shareId = response.data?.shareId
        _offlineQueue.markCompleted(job.id, shareId)
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        if (_mainWindow && !_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send('upload-complete', { sessionId: job.sessionId, success: true, elapsed })
        }
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (err: any) {
      if (activeCancelTokens[job.id]) delete activeCancelTokens[job.id]
      if (axios.isCancel(err)) {
        _offlineQueue.markRetrying(job.id) // keep pending
      } else {
        _offlineQueue.markFailed(job.id)
        _offlineQueue.scheduleRetry(job.id, job.retryCount + 1)
        console.warn(`[Upload] Queue job ${job.id} failed:`, err.message)
        if (_mainWindow && !_mainWindow.isDestroyed()) {
          const delay = _offlineQueue.getBackoffDelay(job.retryCount + 1)
          _mainWindow.webContents.send('upload-complete', { 
            sessionId: job.sessionId, 
            success: false,
            retryCount: job.retryCount + 1,
            nextRetryMs: delay
          })
        }
      }
    }
  }
  return { flushed: pending.length }
}

export function cancelUploadJob(id: number) {
  if (activeCancelTokens[id]) {
    activeCancelTokens[id].cancel('Cancelled by user')
    delete activeCancelTokens[id]
  }
}

ipcMain.handle('persist-msg-seq-index', async (event, seqIndex) => {
  const settings = getSettingsSync()
  settings.msgSeqIndex = seqIndex
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
})
