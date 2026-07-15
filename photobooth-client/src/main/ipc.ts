import { BrowserWindow, ipcMain, app } from 'electron'
import { DslrManager } from './gphoto2'
import { OfflineQueue } from './offlineQueue'
import { readFile, writeFile, readdir } from 'fs/promises'
import path from 'path'
import fs from 'fs'

const SETTINGS_FILE = path.join(app.getPath('userData'), 'booth-settings.json')
const DEFAULT_SETTINGS = { photoCount: 4, countdown: 5, captureInterval: 1 }

let _offlineQueue: OfflineQueue
let _serverUrl: string

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
  serverUrl: string
) {
  _offlineQueue = offlineQueue
  _serverUrl = serverUrl
  ipcMain.handle('capture-photo', async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const result = await dslrManager.capture()
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('upload-photos', async (event, data: {
    sessionId: string
    imagePaths: string[]
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
      formData.append('sessionId', data.sessionId)
      formData.append('photoCount', String(data.photoCount))
      if (data.frameName) formData.append('frameName', data.frameName)

      const response = await fetch(`${serverUrl}/api/booth/upload`, {
        method: 'POST',
        body: formData,
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

        const response = await fetch(`${serverUrl}/api/booth/upload`, {
          method: 'POST',
          body: formData,
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
    return { dslrConnected: dslrManager.isConnected() }
  })

  ipcMain.handle('get-settings', () => {
    return getSettingsSync()
  })

  ipcMain.handle('save-settings', (event, settings: { photoCount: number; countdown: number; captureInterval: number }) => {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-server-config', () => {
    return { serverUrl }
  })
}

export async function flushQueuedUploads() {
  const pending = _offlineQueue.getPending()
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
