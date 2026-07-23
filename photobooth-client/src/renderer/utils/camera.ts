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
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export class DslrPreviewManager {
  /** The <img> element to insert into the preview container. */
  readonly element: HTMLImageElement

  private active = false
  private frameCount = 0
  private lastFrameTime = 0
  /** Last error message from startDslrLiveview IPC, if any. */
  lastError: string | undefined = undefined
  private resolveFirstFrame: (() => void) | null = null
  private rejectFirstFrame: ((reason?: unknown) => void) | null = null
  private firstFrameTimeout: ReturnType<typeof setTimeout> | null = null
  /** Max ms to wait for the first liveview frame before treating it as a failure. */
  private static readonly FIRST_FRAME_TIMEOUT = 10_000

  constructor() {
    this.element = document.createElement('img')
    Object.assign(this.element.style, {
      width: '100%',
      height: '100%',
      display: 'block',
      objectFit: 'contain',
    })
    this.element.alt = ''
    // Use a transparent GIF so there is never a broken-image state
    this.element.src = TRANSPARENT_GIF
  }

  /**
   * Start the DSLR liveview stream.
   * Registers the IPC frame listener and tells the main process to begin.
   * Does NOT return until the first liveview frame arrives or a timeout fires,
   * so the caller can keep a "Connecting…" overlay up until actual pixels arrive.
   * @returns true if the camera was successfully detected and at least one frame was received.
   */
  async start(): Promise<boolean> {
    if (this.active) {
      console.warn('[DslrPreviewManager] start() called but already active')
      return true
    }

    const firstFrame = new Promise<void>((resolve, reject) => {
      this.resolveFirstFrame = resolve
      this.rejectFirstFrame = reject
    })

    console.log('[DslrPreviewManager] Registering dslr-frame IPC listener...')
    window.hellomyphoto?.onDslrFrame((base64Jpeg) => {
      if (!this.active) return
      this.element.src = `data:image/jpeg;base64,${base64Jpeg}`
      const wasFirst = this.frameCount === 0
      this.frameCount++
      this.lastFrameTime = Date.now()
      if (wasFirst) {
        console.log(`[DslrPreviewManager] ✅ First frame rendered in <img> element (base64 length=${base64Jpeg.length})`)
        this.resolveFirstFrame?.()
        this.resolveFirstFrame = null
      }
      if (this.frameCount % 150 === 0) {
        console.log(`[DslrPreviewManager] Liveview running — ${this.frameCount} frames rendered`)
      }
    })

    console.log('[DslrPreviewManager] Calling startDslrLiveview IPC...')
    const result = await window.hellomyphoto?.startDslrLiveview()
    console.log('[DslrPreviewManager] startDslrLiveview() response:', JSON.stringify(result))

    if (!result?.success) {
      this.lastError = result?.error
      console.error('[DslrPreviewManager] ❌ Failed to start liveview:', result?.error)
      this.resolveFirstFrame = null
      this.rejectFirstFrame = null
      return false
    }

    this.active = true
    this.lastError = undefined
    console.log('[DslrPreviewManager] ✅ Liveview IPC started — waiting for first frame…')

    // Wait for the first frame or a timeout (whichever comes first)
    this.firstFrameTimeout = setTimeout(() => {
      console.error('[DslrPreviewManager] ⏱ First-frame timeout — no frame within 10 s')
      this.rejectFirstFrame?.('timeout')
      this.rejectFirstFrame = null
    }, DslrPreviewManager.FIRST_FRAME_TIMEOUT)

    try {
      await firstFrame
    } catch {
      this.active = false
      this.lastError = 'Liveview IPC started but no frames received within 10 seconds. Check USB connection.'
      console.error('[DslrPreviewManager] ❌ First frame never arrived')
      return false
    } finally {
      if (this.firstFrameTimeout !== null) {
        clearTimeout(this.firstFrameTimeout)
        this.firstFrameTimeout = null
      }
    }

    return true
  }

  /**
   * Stop the DSLR liveview stream.
   * Clears the preview image and tells the main process to stop pumping frames.
   *
   * Always sends the IPC stop command to the main process, even if the renderer
   * side is not active. This ensures the camera's viewfinder/mirror is properly
   * turned off after a capture session (the main process restarts liveview
   * internally after each capture via DslrManager.capture()).
   */
  async stop(): Promise<void> {
    const wasActive = this.active
    if (!wasActive) {
      console.warn('[DslrPreviewManager] stop() called but was not active — sending IPC stop anyway (liveview may still be active on camera)')
    } else {
      console.log(`[DslrPreviewManager] Stopping liveview (${this.frameCount} frames rendered)`)
    }
    this.active = false
    if (this.firstFrameTimeout !== null) {
      clearTimeout(this.firstFrameTimeout)
      this.firstFrameTimeout = null
    }
    if (this.resolveFirstFrame) {
      this.resolveFirstFrame()
      this.resolveFirstFrame = null
    }
    this.element.src = TRANSPARENT_GIF
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
