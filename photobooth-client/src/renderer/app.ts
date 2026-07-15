import { BoothApp } from './components/BoothApp.js'

declare global {
  interface Window {
    hellomyphoto: {
      capture: () => Promise<{ success: boolean; path?: string; error?: string }>
      queueOfflineUpload: (data: { sessionId: string; metadata: any; imagePaths: string[] }) => Promise<any>
      getQueueDepth: () => Promise<number>
      getHardwareStatus: () => Promise<{ dslrConnected: boolean }>
      getSettings: () => Promise<{ photoCount: number; countdown: number; captureInterval: number }>
      saveSettings: (settings: { photoCount: number; countdown: number; captureInterval: number }) => Promise<any>
      getServerConfig: () => Promise<{ serverUrl: string }>
      triggerUpload: (data: any) => Promise<any>
      onCaptureComplete: (callback: (result: any) => void) => void
      onServerStatus: (callback: (status: { online: boolean }) => void) => void
      onHardwareStatus: (callback: (status: { dslrConnected: boolean }) => void) => void
      onServerConfig: (callback: (config: { serverUrl: string; dslrConnected: boolean }) => void) => void
      onQueueUpdate: (callback: (data: { offline: number }) => void) => void
    }
  }
}

const app = new BoothApp()
app.mount()
