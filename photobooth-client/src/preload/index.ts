import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hellomyphoto', {
  // ------------------------------------------------------------------
  // Capture (DSLR or webcam blob path — same endpoint for both modes)
  // ------------------------------------------------------------------
  capture: (options?: { liveviewStopped?: boolean }) => ipcRenderer.invoke('capture-photo', options),

  /** Prep the camera during the last second of countdown (stop liveview, begin AF). */
  prepDslrCapture: () => ipcRenderer.invoke('prep-dslr-capture'),

  // ------------------------------------------------------------------
  // DSLR liveview controls
  // ------------------------------------------------------------------

  /** Begin streaming JPEG preview frames from the connected DSLR. */
  startDslrLiveview: () => ipcRenderer.invoke('start-dslr-liveview'),

  /** Stop the DSLR liveview stream. */
  stopDslrLiveview: () => ipcRenderer.invoke('stop-dslr-liveview'),

  /**
   * On-demand camera detect — used by the Settings panel Retry button.
   * Returns { connected: boolean, model: string }.
   */
  detectDslr: () => ipcRenderer.invoke('detect-dslr'),
  setDslrCameraPort: (port: string) => ipcRenderer.invoke('set-dslr-camera-port', port),

  // ------------------------------------------------------------------
  // Camera mode persistence
  // ------------------------------------------------------------------

  /** Returns the saved camera mode: 'webcam' | 'dslr'. */
  getCameraMode: () => ipcRenderer.invoke('get-camera-mode'),

  /** Persists the user's chosen camera mode. */
  setCameraMode: (mode: 'webcam' | 'dslr') => ipcRenderer.invoke('set-camera-mode', mode),

  // ------------------------------------------------------------------
  // Upload
  // ------------------------------------------------------------------
  uploadPhotos: (data: {
    sessionId: string
    imagePaths: string[]
    imageBuffers?: ArrayBuffer[]
    frameName?: string | null
    photoCount: number
  }) => ipcRenderer.invoke('upload-photos', data),

  uploadQueued: () => ipcRenderer.invoke('upload-queued'),

  getQueueDepth: () => ipcRenderer.invoke('get-queue-depth'),

  // ------------------------------------------------------------------
  // Hardware / settings
  // ------------------------------------------------------------------

  /**
   * Returns the full DSLR status object:
   *   { connected: boolean, model: string, liveviewActive: boolean }
   */
  getHardwareStatus: () => ipcRenderer.invoke('get-hardware-status'),

  getSettings: () => ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: {
    photoCount: number
    countdown: number
    captureInterval: number
    postCapturePreview: number
    serverUrl?: string
    otp?: string
    cameraMode?: 'webcam' | 'dslr'
    liveviewMode?: 'mjpeg' | 'polling'
    autoPreview?: boolean
    liveviewRetryAttempts?: number
    shutterOffsetDelay?: number
  }) => ipcRenderer.invoke('save-settings', settings),

  getServerConfig: () => ipcRenderer.invoke('get-server-config'),

  // ------------------------------------------------------------------
  // DSLR Focus Controls
  // ------------------------------------------------------------------

  /** Set focus mode: 'auto' (AF) or 'manual' (MF). */
  dslrSetFocusMode: (mode: 'auto' | 'manual') => ipcRenderer.invoke('dslr-set-focus-mode', mode),

  /** Trigger autofocus drive. */
  dslrTriggerAutofocus: () => ipcRenderer.invoke('dslr-trigger-autofocus'),

  /** Step focus toward the camera. */
  dslrTriggerFocusNear: () => ipcRenderer.invoke('dslr-trigger-focus-near'),

  /** Step focus away from the camera. */
  dslrTriggerFocusFar: () => ipcRenderer.invoke('dslr-trigger-focus-far'),

  /** macOS: kill PTPCamera daemon that steals the USB interface. */
  killPtpDaemon: () => ipcRenderer.invoke('kill-ptp-daemon'),

  // ------------------------------------------------------------------
  // Push listeners (main → renderer)
  // ------------------------------------------------------------------

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

  /**
   * Receive a single DSLR liveview JPEG frame as a base64 string.
   * The renderer converts it to: `data:image/jpeg;base64,${frame}`.
   */
  onDslrFrame: (callback: (base64Jpeg: string) => void) => {
    ipcRenderer.on('dslr-frame', (_event, frame) => callback(frame))
  },

  /**
   * Receive DSLR status updates pushed from the main process.
   * Fired on detect, liveview start/stop, and the 5-second disconnect poll.
   */
  onDslrStatus: (callback: (status: { connected: boolean; model: string; liveviewActive: boolean }) => void) => {
    ipcRenderer.on('dslr-status', (_event, status) => callback(status))
  },

  /**
   * Fired when the main process detects that the camera was unplugged.
   * Payload: { model: string }
   */
  onDslrDisconnected: (callback: (info: { model: string }) => void) => {
    ipcRenderer.on('dslr-disconnected', (_event, info) => callback(info))
  },

  getLogs: () => ipcRenderer.invoke('get-logs'),
})
