import { BoothApp } from './components/BoothApp.js'

declare global {
  interface Window {
    hellomyphoto: {
      // ----------------------------------------------------------------
      // Capture
      // ----------------------------------------------------------------
      capture: (options?: { liveviewStopped?: boolean }) => Promise<{ success: boolean; path?: string; error?: string }>
      prepDslrCapture: () => Promise<{ success: boolean }>

      // ----------------------------------------------------------------
      // DSLR liveview
      // ----------------------------------------------------------------
      startDslrLiveview: () => Promise<{ success: boolean; error?: string }>
      stopDslrLiveview: () => Promise<{ success: boolean }>
      detectDslr: () => Promise<{ connected: boolean; model: string; cameras?: any[]; whiteBalanceChoices?: string[] }>
      setDslrCameraPort: (port: string) => Promise<{ success: boolean }>

      // ----------------------------------------------------------------
      // Camera mode persistence
      // ----------------------------------------------------------------
      getCameraMode: () => Promise<'webcam' | 'dslr'>
      setCameraMode: (mode: 'webcam' | 'dslr') => Promise<{ success: boolean }>

      // ----------------------------------------------------------------
      // Upload
      // ----------------------------------------------------------------
      uploadPhotos: (data: {
        sessionId: string
        imagePaths: string[]
        imageBuffers?: ArrayBuffer[]
        frameName?: string | null
        photoCount: number
      }) => Promise<{ success: boolean; error?: string; queued?: boolean }>
      uploadQueued: () => Promise<{ flushed: number }>
      getQueueDepth: () => Promise<number>

      // ----------------------------------------------------------------
      // DSLR Focus Controls
      // ----------------------------------------------------------------
      dslrSetFocusMode: (mode: 'auto' | 'manual') => Promise<{ success: boolean; error?: string }>
      dslrTriggerAutofocus: () => Promise<{ success: boolean; error?: string }>
      dslrTriggerFocusNear: () => Promise<{ success: boolean; error?: string }>
      dslrTriggerFocusFar: () => Promise<{ success: boolean; error?: string }>

      // ----------------------------------------------------------------
      // Hardware / settings
      // ----------------------------------------------------------------
      getHardwareStatus: () => Promise<{ connected: boolean; model: string; liveviewActive: boolean; configChoices?: Record<string, string[]> }>
      getSettings: () => Promise<{
        photoCount: number
        countdown: number
        captureInterval: number
        postCapturePreview: number
        serverUrl?: string
        cameraDeviceId?: string
        audioDeviceId?: string
        otp?: string
        cameraMode?: 'webcam' | 'dslr'
        dslrFocusMode?: string
        dslrWhiteBalance?: string
        dslrWhiteBalanceKelvin?: number
      }>
      saveSettings: (settings: {
        photoCount: number
        countdown: number
        captureInterval: number
        postCapturePreview: number
        serverUrl?: string
        cameraDeviceId?: string
        audioDeviceId?: string
        otp?: string
        cameraMode?: 'webcam' | 'dslr'
        dslrFocusMode?: string
        dslrWhiteBalance?: string
        dslrWhiteBalanceKelvin?: number
        autoPreview?: boolean
        liveviewRetryAttempts?: number
        shutterOffsetDelay?: number
      }) => Promise<any>
      getServerConfig: () => Promise<{ serverUrl: string }>
      killPtpDaemon: () => Promise<{ success: boolean; error?: string }>
      getLogs: () => Promise<{ lines: string[] }>

      // ----------------------------------------------------------------
      // Push listeners (main → renderer)
      // ----------------------------------------------------------------
      onUploadComplete: (callback: (data: { sessionId: string; success: boolean }) => void) => void
      onServerStatus: (callback: (status: { online: boolean }) => void) => void
      onServerConfig: (callback: (config: { serverUrl: string; dslrConnected: boolean }) => void) => void
      onQueueUpdate: (callback: (data: { offline: number }) => void) => void
      onBoothCommand: (callback: (command: { id: string; type: string; settings?: any }) => void) => void

      /** Receive a DSLR liveview JPEG frame as a base64 string. */
      onDslrFrame: (callback: (base64Jpeg: string) => void) => void
      /** Receive DSLR status updates (detect, liveview start/stop, disconnect poll). */
      onDslrStatus: (callback: (status: { connected: boolean; model: string; liveviewActive: boolean }) => void) => void
      /** Fired when the camera is unplugged mid-session. */
      onDslrDisconnected: (callback: (info: { model: string }) => void) => void
    }
  }
}


const app = new BoothApp()
app.mount()
