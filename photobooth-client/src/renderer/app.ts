import { BoothApp } from './components/BoothApp.js'

declare global {
  interface Window {
    hellomyphoto: {
      capture: () => Promise<{ success: boolean; path?: string; error?: string }>
      uploadPhotos: (data: {
        sessionId: string
        imagePaths: string[]
        frameName?: string | null
        photoCount: number
      }) => Promise<{ success: boolean; error?: string; queued?: boolean }>
      uploadQueued: () => Promise<{ flushed: number }>
      getQueueDepth: () => Promise<number>
      getHardwareStatus: () => Promise<{ dslrConnected: boolean }>
      getSettings: () => Promise<{ photoCount: number; countdown: number; captureInterval: number; serverUrl?: string; cameraDeviceId?: string; audioDeviceId?: string }>
      saveSettings: (settings: { photoCount: number; countdown: number; captureInterval: number; serverUrl?: string; cameraDeviceId?: string; audioDeviceId?: string }) => Promise<any>
      getServerConfig: () => Promise<{ serverUrl: string }>
      onUploadComplete: (callback: (data: { sessionId: string; success: boolean }) => void) => void
      onServerStatus: (callback: (status: { online: boolean }) => void) => void
      onServerConfig: (callback: (config: { serverUrl: string; dslrConnected: boolean }) => void) => void
      onQueueUpdate: (callback: (data: { offline: number }) => void) => void
    }
  }
}

const app = new BoothApp()
app.mount()
