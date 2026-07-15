import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hellomyphoto', {
  capture: () => ipcRenderer.invoke('capture-photo'),

  queueOfflineUpload: (sessionData: {
    sessionId: string
    metadata: any
    imagePaths: string[]
  }) => ipcRenderer.invoke('queue-offline-upload', sessionData),

  getQueueDepth: () => ipcRenderer.invoke('get-queue-depth'),

  getHardwareStatus: () => ipcRenderer.invoke('get-hardware-status'),

  getSettings: () => ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: {
    photoCount: number
    countdown: number
    captureInterval: number
  }) => ipcRenderer.invoke('save-settings', settings),

  getServerConfig: () => ipcRenderer.invoke('get-server-config'),

  triggerUpload: (sessionData: any) => ipcRenderer.invoke('trigger-upload', sessionData),

  onCaptureComplete: (callback: (result: any) => void) => {
    ipcRenderer.on('capture-complete', (event, result) => callback(result))
  },

  onServerStatus: (callback: (status: { online: boolean }) => void) => {
    ipcRenderer.on('server-status', (event, status) => callback(status))
  },

  onHardwareStatus: (callback: (status: { dslrConnected: boolean }) => void) => {
    ipcRenderer.on('hardware-status', (event, status) => callback(status))
  },

  onServerConfig: (callback: (config: { serverUrl: string; dslrConnected: boolean }) => void) => {
    ipcRenderer.on('server-config', (event, config) => callback(config))
  },

  onQueueUpdate: (callback: (data: { offline: number }) => void) => {
    ipcRenderer.on('queue-update', (event, data) => callback(data))
  },
})
