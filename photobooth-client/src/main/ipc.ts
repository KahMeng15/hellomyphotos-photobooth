import { BrowserWindow, ipcMain } from 'electron'
import { DslrManager } from './gphoto2'
import { OfflineQueue } from './offlineQueue'

export function initIpcHandlers(
  mainWindow: BrowserWindow,
  dslrManager: DslrManager,
  offlineQueue: OfflineQueue,
  serverUrl: string
) {
  ipcMain.handle('capture-photo', async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const result = await dslrManager.capture()
      mainWindow.webContents.send('capture-complete', result)
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(
    'queue-offline-upload',
    async (event, sessionData: { sessionId: string; metadata: any; imagePaths: string[] }) => {
      try {
        offlineQueue.enqueue(sessionData.sessionId, sessionData.metadata, sessionData.imagePaths)
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle('get-queue-depth', () => {
    return offlineQueue.getDepth()
  })

  ipcMain.handle('get-hardware-status', () => {
    return {
      dslrConnected: dslrManager.isConnected(),
    }
  })

  ipcMain.handle('get-settings', () => {
    const stored = localStorage.getItem('booth-settings')
    return stored ? JSON.parse(stored) : getDefaultSettings()
  })

  ipcMain.handle(
    'save-settings',
    (event, settings: { photoCount: number; countdown: number; captureInterval: number }) => {
      localStorage.setItem('booth-settings', JSON.stringify(settings))
      return { success: true }
    }
  )

  ipcMain.handle('get-server-config', () => {
    return { serverUrl }
  })

  ipcMain.handle('trigger-upload', async (event, sessionData: any) => {
    try {
      const response = await fetch(`${serverUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      })
      if (!response.ok) throw new Error('Upload failed')
      return { success: true }
    } catch (error: any) {
      offlineQueue.enqueue(sessionData.sessionId, sessionData.metadata, sessionData.imagePaths)
      return { success: false, error: error.message, queued: true }
    }
  })
}

function getDefaultSettings() {
  return {
    photoCount: 4,
    countdown: 5,
    captureInterval: 1,
  }
}
