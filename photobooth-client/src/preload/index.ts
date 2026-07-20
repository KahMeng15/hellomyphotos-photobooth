import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hellomyphoto', {
  capture: () => ipcRenderer.invoke('capture-photo'),

  uploadPhotos: (data: {
    sessionId: string
    imagePaths: string[]
    imageBuffers?: ArrayBuffer[]
    frameName?: string | null
    photoCount: number
  }) => ipcRenderer.invoke('upload-photos', data),

  uploadQueued: () => ipcRenderer.invoke('upload-queued'),

  getQueueDepth: () => ipcRenderer.invoke('get-queue-depth'),

  getHardwareStatus: () => ipcRenderer.invoke('get-hardware-status'),

  getSettings: () => ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: {
    photoCount: number
    countdown: number
    captureInterval: number
    serverUrl?: string
  }) => ipcRenderer.invoke('save-settings', settings),

  getServerConfig: () => ipcRenderer.invoke('get-server-config'),

  onUploadComplete: (callback: (data: { sessionId: string; success: boolean }) => void) => {
    ipcRenderer.on('upload-complete', (_event, data) => callback(data))
  },

  onServerStatus: (callback: (status: { online: boolean }) => void) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status))
  },

  onServerConfig: (callback: (config: { serverUrl: string; dslrConnected: boolean }) => void) => {
    ipcRenderer.on('server-config', (_event, config) => callback(config))
  },

  onQueueUpdate: (callback: (data: { offline: number }) => void) => {
    ipcRenderer.on('queue-update', (_event, data) => callback(data))
  },

  onBoothCommand: (callback: (command: { id: string; type: string; settings?: any }) => void) => {
    ipcRenderer.on('booth-command', (_event, command) => callback(command))
  },
})
