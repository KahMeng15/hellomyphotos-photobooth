import { CameraManager } from '../utils/camera.js'
import { AudioManager } from '../utils/audio.js'
import { CountdownUI } from './Countdown.js'
import { FrameCarousel } from './FrameCarousel.js'
import { PhotoPreview } from './PhotoPreview.js'
import { OfflineIndicator } from './OfflineIndicator.js'
import { Settings } from './Settings.js'

interface SessionPhotos {
  paths: string[]
  timestamp: number
}

export class BoothApp {
  private container: HTMLElement
  private camera: CameraManager
  private audio: AudioManager
  private countdown: CountdownUI
  private frameCarousel: FrameCarousel
  private photoPreview: PhotoPreview
  private offlineIndicator: OfflineIndicator
  private settings: Settings

  private webcamPreview: HTMLVideoElement
  private overlay: HTMLDivElement
  private statusBar: HTMLDivElement
  private captureBtn: HTMLButtonElement
  private stateDisplay: HTMLDivElement

  private sessionPhotos: SessionPhotos = { paths: [], timestamp: 0 }
  private isCapturing = false
  private isPaused = false
  private settingsData = { photoCount: 4, countdown: 5, captureInterval: 1 }
  private serverOnline = true
  private selectedFrame: string | null = null
  private serverUrl = 'http://localhost:3000'

  constructor() {
    this.container = document.getElementById('app') || document.body
    this.container.innerHTML = ''

    this.container.style.cssText = `
      width: 100%; height: 100vh; display: flex; flex-direction: column;
      background: #000; color: #fff; position: relative; overflow: hidden;
    `

    this.webcamPreview = document.createElement('video')
    this.webcamPreview.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;'
    this.webcamPreview.autoplay = true
    this.webcamPreview.muted = true
    this.webcamPreview.playsInline = true
    this.container.appendChild(this.webcamPreview)

    this.overlay = document.createElement('div')
    this.overlay.style.cssText = 'position: absolute; inset: 0; pointer-events: none; display: flex; align-items: center; justify-content: center;'
    this.container.appendChild(this.overlay)

    this.stateDisplay = document.createElement('div')
    this.stateDisplay.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 8rem; font-weight: 900; color: rgba(255,255,255,0.15);
      text-align: center; pointer-events: none; user-select: none;
    `
    this.container.appendChild(this.stateDisplay)

    this.statusBar = document.createElement('div')
    this.statusBar.style.cssText = `
      position: absolute; bottom: 2rem; left: 50%; transform: translateX(-50%);
      display: flex; gap: 1rem; align-items: center; z-index: 10;
    `
    this.container.appendChild(this.statusBar)

    this.captureBtn = document.createElement('button')
    this.captureBtn.textContent = 'Start'
    this.captureBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.5rem; font-weight: 700;
      background: #fff; color: #000; border: none; border-radius: 100px;
      cursor: pointer; pointer-events: all; transition: transform 0.15s;
    `
    this.captureBtn.addEventListener('mouseenter', () => { this.captureBtn.style.transform = 'scale(1.05)' })
    this.captureBtn.addEventListener('mouseleave', () => { this.captureBtn.style.transform = 'scale(1)' })
    this.captureBtn.addEventListener('click', () => this.startCapture())
    this.statusBar.appendChild(this.captureBtn)

    this.camera = new CameraManager()
    this.audio = new AudioManager()
    this.countdown = new CountdownUI(this.overlay)
    this.frameCarousel = new FrameCarousel(this.statusBar, (frameId) => { this.selectedFrame = frameId })
    this.photoPreview = new PhotoPreview(this.container, () => this.reset(), () => this.startCapture())
    this.offlineIndicator = new OfflineIndicator(this.statusBar)
    this.settings = new Settings(this.container, (s) => { this.settingsData = s })

    this.setupKeyboardShortcuts()
    this.setupIpcListeners()
  }

  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (!this.isCapturing) this.startCapture()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        this.settings.toggle()
      }
    })
  }

  private setupIpcListeners() {
    window.hellomyphoto?.onServerConfig((config) => {
      this.serverUrl = config.serverUrl
      if (config.dslrConnected) {
        this.stateDisplay.textContent = '📷'
      }
    })

    window.hellomyphoto?.onServerStatus(({ online }) => {
      this.serverOnline = online
      this.offlineIndicator.setOnline(online)
    })

    window.hellomyphoto?.onQueueUpdate(({ offline }) => {
      this.offlineIndicator.setQueueDepth(offline)
    })
  }

  async mount() {
    await this.frameCarousel.loadFrames(this.serverUrl)
    const stream = await this.camera.startWebcam()
    if (stream) {
      this.webcamPreview.srcObject = stream
      await this.webcamPreview.play()
    }
    this.stateDisplay.textContent = 'Touch to Start'
    setTimeout(() => { this.stateDisplay.style.opacity = '0' }, 3000)
  }

  private async startCapture() {
    if (this.isCapturing || this.isPaused) return
    this.isCapturing = true
    this.captureBtn.style.display = 'none'
    this.stateDisplay.textContent = ''

    const photoCount = this.settingsData.photoCount
    const paths: string[] = []

    const audioCtx = new AudioContext()

    for (let i = 0; i < photoCount; i++) {
      this.stateDisplay.textContent = `Shot ${i + 1} of ${photoCount}`

      await this.countdown.play(this.settingsData.countdown, audioCtx)

      let result: { success: boolean; path?: string; error?: string }

      const dslrStatus = await window.hellomyphoto?.getHardwareStatus()
      if (dslrStatus?.dslrConnected) {
        result = await window.hellomyphoto.capture()
      } else {
        result = await this.camera.captureStill()
      }

      if (result.success && result.path) {
        paths.push(result.path)
        this.audio.playShutter()
      }

      if (i < photoCount - 1 && this.settingsData.captureInterval > 0) {
        await this.delay(this.settingsData.captureInterval * 1000)
      }
    }

    audioCtx.close()

    if (paths.length > 0) {
      this.sessionPhotos = { paths, timestamp: Date.now() }

      const sessionId = `session_${Date.now()}`
      const metadata = {
        frameName: this.selectedFrame,
        photoCount: paths.length,
        timestamp: new Date().toISOString(),
      }

      if (this.serverOnline) {
        try {
          await this.uploadSession(sessionId, paths, metadata)
        } catch {
          await window.hellomyphoto?.queueOfflineUpload({
            sessionId,
            metadata,
            imagePaths: paths,
          })
        }
      } else {
        await window.hellomyphoto?.queueOfflineUpload({
          sessionId,
          metadata,
          imagePaths: paths,
        })
      }

      this.photoPreview.show(paths)
    } else {
      this.reset()
    }

    this.isCapturing = false
  }

  private async uploadSession(sessionId: string, paths: string[], metadata: any) {
    const formData = new FormData()
    for (const p of paths) {
      const blob = await fetch(`file://${p}`).then((r) => r.blob())
      formData.append('photos', blob, `photo_${Date.now()}.jpg`)
    }
    formData.append('sessionId', sessionId)
    formData.append('photoCount', String(paths.length))
    if (metadata.frameName) formData.append('frameName', metadata.frameName)

    await fetch(`${this.serverUrl}/api/booth/upload`, {
      method: 'POST',
      body: formData,
    })
  }

  private reset() {
    this.isCapturing = false
    this.captureBtn.style.display = 'block'
    this.photoPreview.hide()
    this.stateDisplay.textContent = ''
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
