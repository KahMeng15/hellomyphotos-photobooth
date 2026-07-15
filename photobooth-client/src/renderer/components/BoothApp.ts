import { CameraManager } from '../utils/camera.js'
import { AudioManager } from '../utils/audio.js'
import { CountdownUI } from './Countdown.js'
import { FrameCarousel } from './FrameCarousel.js'
import { PhotoPreview } from './PhotoPreview.js'
import { OfflineIndicator } from './OfflineIndicator.js'
import { Settings } from './Settings.js'

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

  private isCapturing = false
  private settingsData = { photoCount: 4, countdown: 5, captureInterval: 1 }
  private serverOnline = true
  private selectedFrame: string | null = null
  private serverUrl = 'http://localhost:3000'

  constructor() {
    this.container = document.getElementById('app') || document.body
    this.container.innerHTML = ''

    Object.assign(this.container.style, {
      width: '100%', height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#000', color: '#fff', position: 'relative', overflow: 'hidden',
    })

    this.webcamPreview = document.createElement('video')
    Object.assign(this.webcamPreview.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover',
    })
    this.webcamPreview.autoplay = true
    this.webcamPreview.muted = true
    this.webcamPreview.playsInline = true
    this.container.appendChild(this.webcamPreview)

    this.overlay = document.createElement('div')
    Object.assign(this.overlay.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    })
    this.container.appendChild(this.overlay)

    this.stateDisplay = document.createElement('div')
    Object.assign(this.stateDisplay.style, {
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      fontSize: '8rem', fontWeight: '900', color: 'rgba(255,255,255,0.15)',
      textAlign: 'center', pointerEvents: 'none', userSelect: 'none',
    })
    this.container.appendChild(this.stateDisplay)

    this.statusBar = document.createElement('div')
    Object.assign(this.statusBar.style, {
      position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: '1rem', alignItems: 'center', zIndex: '10',
    })
    this.container.appendChild(this.statusBar)

    this.captureBtn = document.createElement('button')
    this.captureBtn.textContent = 'Start'
    Object.assign(this.captureBtn.style, {
      padding: '1rem 3rem', fontSize: '1.5rem', fontWeight: '700',
      background: '#fff', color: '#000', border: 'none', borderRadius: '100px',
      cursor: 'pointer', pointerEvents: 'all',
    })
    this.captureBtn.addEventListener('click', () => this.startCapture())
    this.statusBar.appendChild(this.captureBtn)

    this.camera = new CameraManager()
    this.audio = new AudioManager()
    this.countdown = new CountdownUI(this.overlay)
    this.frameCarousel = new FrameCarousel(this.statusBar, (frameId) => { this.selectedFrame = frameId })
    this.photoPreview = new PhotoPreview(this.container, () => this.reset(), () => this.reset())
    this.offlineIndicator = new OfflineIndicator(this.statusBar)
    this.settings = new Settings(this.container, (s) => { this.settingsData = s })

    this.setupKeyboardShortcuts()
    this.setupIpcListeners()
  }

  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !this.isCapturing) {
        this.startCapture()
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
    })
    window.hellomyphoto?.onServerStatus(({ online }) => {
      this.serverOnline = online
      this.offlineIndicator.setOnline(online)
    })
    window.hellomyphoto?.onQueueUpdate(({ offline }) => {
      this.offlineIndicator.setQueueDepth(offline)
    })
    window.hellomyphoto?.onUploadComplete((data) => {
      if (!data.success) {
        this.offlineIndicator.setQueueDepth(1)
      }
    })
  }

  async mount() {
    const settings = await window.hellomyphoto?.getSettings()
    if (settings) this.settingsData = settings

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
    if (this.isCapturing) return
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

      const hw = await window.hellomyphoto?.getHardwareStatus()
      if (hw?.dslrConnected) {
        result = await window.hellomyphoto.capture()
      } else {
        result = await this.camera.captureStill()
      }

      if (result?.success && result.path) {
        paths.push(result.path)
        this.audio.playShutter()
      } else {
        this.stateDisplay.textContent = 'Capture failed — tap to retry'
        this.isCapturing = false
        this.captureBtn.style.display = 'block'
        return
      }

      if (i < photoCount - 1 && this.settingsData.captureInterval > 0) {
        await this.delay(this.settingsData.captureInterval * 1000)
      }
    }

    audioCtx.close()

    if (paths.length > 0) {
      const sessionId = `session_${Date.now()}`
      const uploadResult = await window.hellomyphoto?.uploadPhotos({
        sessionId,
        imagePaths: paths,
        frameName: this.selectedFrame,
        photoCount: paths.length,
      })

      if (uploadResult?.queued) {
        this.offlineIndicator.setOnline(false)
        this.offlineIndicator.setQueueDepth(1)
      }

      this.photoPreview.show(paths)
    }

    this.isCapturing = false
  }

  private reset() {
    this.captureBtn.style.display = 'block'
    this.photoPreview.hide()
    this.stateDisplay.textContent = ''
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
