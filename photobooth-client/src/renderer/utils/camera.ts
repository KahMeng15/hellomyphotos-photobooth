/**
 * camera.ts — Webcam and DSLR preview utilities for the renderer process.
 *
 * CameraManager   — getUserMedia webcam: startWebcam, captureStill, stop
 * DslrPreviewManager — DSLR liveview: start (IPC), stop (IPC), .element (<img>)
 */

// ---------------------------------------------------------------------------
// CameraManager — Webcam (getUserMedia)
// ---------------------------------------------------------------------------

export class CameraManager {
  private stream: MediaStream | null = null

  async startWebcam(deviceId?: string): Promise<MediaStream | null> {
    try {
      const video: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      }
      if (deviceId) {
        video.deviceId = { exact: deviceId }
      } else {
        video.facingMode = 'user'
      }
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      return this.stream
    } catch (err) {
      console.error('Webcam start failed:', err)
      return null
    }
  }

  async captureStill(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.stream) {
      return { success: false, error: 'No webcam stream' }
    }

    try {
      const originalTrack = this.stream.getVideoTracks()[0]
      const settings = originalTrack.getSettings()
      const canvas = document.createElement('canvas')
      canvas.width = settings.width || 1280
      canvas.height = settings.height || 720

      const clone = originalTrack.clone()
      const vid = document.createElement('video')
      vid.srcObject = new MediaStream([clone])
      vid.autoplay = true
      vid.muted = true
      await vid.play()

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
      clone.stop()
      vid.srcObject = null

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92)
      })
      const path = URL.createObjectURL(blob)
      return { success: true, path }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
  }
}

// ---------------------------------------------------------------------------
// DslrPreviewManager — DSLR liveview via IPC
// ---------------------------------------------------------------------------

/**
 * Manages the DSLR live preview in the renderer.
 *
 * The main process pushes base64-encoded JPEG frames over the 'dslr-frame'
 * IPC channel. This class decodes them into an <img> element's src attribute,
 * providing a drop-in visual replacement for the webcam <video> element.
 *
 * Usage:
 *   const preview = new DslrPreviewManager()
 *   previewBox.appendChild(preview.element)
 *   const ok = await preview.start()
 *   // ... later ...
 *   await preview.stop()
 *   previewBox.removeChild(preview.element)
 */
export class DslrPreviewManager {
  /** The <img> element to insert into the preview container. */
  readonly element: HTMLImageElement

  private active = false
  private frameCount = 0
  private lastFrameTime = 0
  /** Last error message from startDslrLiveview IPC, if any. */
  lastError: string | undefined = undefined

  constructor() {
    this.element = document.createElement('img')
    Object.assign(this.element.style, {
      width: '100%',
      height: '100%',
      display: 'block',
      objectFit: 'contain',
      background: '#000',
    })
    this.element.alt = 'DSLR live preview'
  }

  /**
   * Start the DSLR liveview stream.
   * Registers the IPC frame listener and tells the main process to begin.
   * @returns true if the camera was successfully detected and streaming started.
   */
  async start(): Promise<boolean> {
    if (this.active) {
      console.warn('[DslrPreviewManager] start() called but already active')
      return true
    }

    console.log('[DslrPreviewManager] Registering dslr-frame IPC listener...')
    // Register frame listener before calling start so no frames are dropped
    window.hellomyphoto?.onDslrFrame((base64Jpeg) => {
      if (!this.active) return
      this.element.src = `data:image/jpeg;base64,${base64Jpeg}`
      this.frameCount++
      this.lastFrameTime = Date.now()
      if (this.frameCount === 1) {
        console.log(`[DslrPreviewManager] ✅ First frame rendered in <img> element (base64 length=${base64Jpeg.length})`)
      }
      if (this.frameCount % 150 === 0) {
        console.log(`[DslrPreviewManager] Liveview running — ${this.frameCount} frames rendered`)
      }
    })

    console.log('[DslrPreviewManager] Calling startDslrLiveview IPC...')
    const result = await window.hellomyphoto?.startDslrLiveview()
    console.log('[DslrPreviewManager] startDslrLiveview() response:', JSON.stringify(result))

    if (result?.success) {
      this.active = true
      this.lastError = undefined
      console.log('[DslrPreviewManager] ✅ Liveview started successfully')
      return true
    }

    this.lastError = result?.error
    console.error('[DslrPreviewManager] ❌ Failed to start liveview:', result?.error)
    return false
  }

  /**
   * Stop the DSLR liveview stream.
   * Clears the preview image and tells the main process to stop pumping frames.
   */
  async stop(): Promise<void> {
    if (!this.active) {
      console.warn('[DslrPreviewManager] stop() called but was not active')
      return
    }
    console.log(`[DslrPreviewManager] Stopping liveview (${this.frameCount} frames rendered)`)
    this.active = false
    this.element.src = ''
    await window.hellomyphoto?.stopDslrLiveview()
    console.log('[DslrPreviewManager] Liveview stopped')
  }

  isActive(): boolean {
    return this.active
  }

  /** Diagnostic: frames received since start() */
  getFrameCount(): number {
    return this.frameCount
  }

  /** Diagnostic: ms since last frame was received (0 if not started) */
  getMsSinceLastFrame(): number {
    return this.lastFrameTime > 0 ? Date.now() - this.lastFrameTime : 0
  }
}
