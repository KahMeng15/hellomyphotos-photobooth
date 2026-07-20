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
  private previewWindow: HTMLDivElement
  private previewBox: HTMLDivElement
  private overlay: HTMLDivElement
  private statusBar: HTMLDivElement
  private captureBtn: HTMLButtonElement
  private stopBtn: HTMLButtonElement
  private stateDisplay: HTMLDivElement
  private landingEl: HTMLDivElement

  private isCapturing = false
  private isLive = false
  private isPaused = false
  private settingsData: { photoCount: number; countdown: number; captureInterval: number; serverUrl: string; cameraDeviceId?: string; audioDeviceId?: string } = { photoCount: 4, countdown: 5, captureInterval: 1, serverUrl: 'http://localhost:3000' }
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
      width: '100%', height: '100%', display: 'block',
    })
    this.webcamPreview.autoplay = true
    this.webcamPreview.muted = true
    this.webcamPreview.playsInline = true

    this.previewBox = document.createElement('div')
    Object.assign(this.previewBox.style, {
      maxWidth: '100%', maxHeight: '100%', width: '100%',
      position: 'relative', overflow: 'hidden',
    })
    this.previewBox.appendChild(this.webcamPreview)

    this.previewWindow = document.createElement('div')
    Object.assign(this.previewWindow.style, {
      flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '0', width: '100%', background: '#000', paddingTop: '2rem',
    })
    this.previewWindow.appendChild(this.previewBox)

    this.overlay = document.createElement('div')
    Object.assign(this.overlay.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    })

    this.stateDisplay = document.createElement('div')
    Object.assign(this.stateDisplay.style, {
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      fontSize: '8rem', fontWeight: '900', color: 'rgba(255,255,255,0.15)',
      textAlign: 'center', pointerEvents: 'none', userSelect: 'none',
    })

    this.stopBtn = document.createElement('button')
    this.stopBtn.textContent = 'Exit'
    Object.assign(this.stopBtn.style, {
      position: 'absolute', top: '1rem', right: '1rem', zIndex: '50',
      padding: '0.5rem 1.25rem', fontSize: '0.9375rem', fontWeight: '600',
      background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '8px', cursor: 'pointer', display: 'none',
    })
    this.stopBtn.addEventListener('mouseenter', () => { this.stopBtn.style.background = 'rgba(255,255,255,0.25)' })
    this.stopBtn.addEventListener('mouseleave', () => { this.stopBtn.style.background = 'rgba(255,255,255,0.15)' })
    this.stopBtn.addEventListener('click', () => this.goHome())

    this.statusBar = document.createElement('div')
    Object.assign(this.statusBar.style, {
      display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', zIndex: '10', width: '100%', boxSizing: 'border-box',
      flexShrink: '0',
    })

    this.captureBtn = document.createElement('button')
    this.captureBtn.textContent = 'Start'
    Object.assign(this.captureBtn.style, {
      padding: '1rem 3rem', fontSize: '1.5rem', fontWeight: '700',
      background: '#fff', color: '#000', border: 'none', borderRadius: '100px',
      cursor: 'pointer', pointerEvents: 'all',
    })
    this.captureBtn.addEventListener('click', () => this.startCapture())

    this.landingEl = document.createElement('div')
    Object.assign(this.landingEl.style, {
      position: 'absolute', inset: '0', zIndex: '20',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', background: '#0f0f0f', gap: '2rem',
    })

    const brand = document.createElement('h1')
    brand.textContent = 'hellomyphoto'
    brand.style.cssText = 'font-size: 3rem; font-weight: 900; letter-spacing: -0.03em; margin: 0;'
    this.landingEl.appendChild(brand)

    const subtitle = document.createElement('p')
    subtitle.textContent = 'Photo Booth'
    subtitle.style.cssText = 'font-size: 1.125rem; color: #666; margin: -1rem 0 0;'
    this.landingEl.appendChild(subtitle)

    const startBtn = document.createElement('button')
    startBtn.textContent = 'Start Taking Photos'
    Object.assign(startBtn.style, {
      padding: '1.25rem 4rem', fontSize: '1.5rem', fontWeight: '700',
      background: '#fff', color: '#000', border: 'none', borderRadius: '100px',
      cursor: 'pointer', marginTop: '1rem',
    })
    startBtn.addEventListener('click', () => this.goLive())
    this.landingEl.appendChild(startBtn)

    const settingsBtn = document.createElement('button')
    settingsBtn.textContent = 'Settings'
    Object.assign(settingsBtn.style, {
      padding: '0.75rem 2.5rem', fontSize: '1rem', fontWeight: '500',
      background: 'transparent', color: '#888', border: '1px solid #333',
      borderRadius: '100px', cursor: 'pointer',
    })
    settingsBtn.addEventListener('click', () => this.settings.toggle())
    this.landingEl.appendChild(settingsBtn)

    this.container.append(this.landingEl, this.previewWindow, this.overlay, this.stateDisplay, this.stopBtn, this.statusBar)

    this.camera = new CameraManager()
    this.audio = new AudioManager()
    this.countdown = new CountdownUI(this.overlay)
    this.frameCarousel = new FrameCarousel(this.statusBar, (frameId) => { this.selectedFrame = frameId })
    this.photoPreview = new PhotoPreview(this.container, () => this.reset(), () => this.goHome(), () => this.goHome())
    this.offlineIndicator = new OfflineIndicator(this.statusBar)
    this.settings = new Settings(this.container, (s) => { this.settingsData = s })

    this.setupKeyboardShortcuts()
    this.setupIpcListeners()
  }

  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && this.isLive && !this.isCapturing) {
        this.startCapture()
      }
      if (e.key === 'Escape' && this.isLive) {
        this.goHome()
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
    window.hellomyphoto?.onBoothCommand((cmd) => {
      if (cmd.type === 'capture') {
        if (this.isPaused) return
        if (!this.isLive) {
          this.goLive().then(() => setTimeout(() => this.startCapture(), 1500))
        } else if (!this.isCapturing) {
          this.startCapture()
        }
      } else if (cmd.type === 'start') {
        if (!this.isLive) this.goLive()
      } else if (cmd.type === 'pause') {
        this.isPaused = true
        this.stateDisplay.textContent = 'PAUSED'
      } else if (cmd.type === 'resume') {
        this.isPaused = false
        this.stateDisplay.textContent = ''
      }
    })
  }

  async mount() {
    const settings = await window.hellomyphoto?.getSettings()
    if (settings) this.settingsData = { ...this.settingsData, ...settings }
    await this.frameCarousel.loadFrames(this.serverUrl)
  }

  private async goLive() {
    this.landingEl.style.display = 'none'
    const stream = await this.camera.startWebcam(this.settingsData.cameraDeviceId)
    if (stream) {
      this.webcamPreview.srcObject = stream
      await this.webcamPreview.play()
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      if (settings.width && settings.height) {
        this.previewBox.style.aspectRatio = `${settings.width} / ${settings.height}`
      }
    }
    if (this.settingsData.audioDeviceId) {
      await this.audio.setSinkId(this.settingsData.audioDeviceId)
    }
    this.isLive = true
    this.stopBtn.style.display = 'block'
    this.captureBtn.style.display = 'block'
    this.captureBtn.style.visibility = 'visible'
    this.statusBar.appendChild(this.captureBtn)
    this.stateDisplay.textContent = 'Touch to Start'
    setTimeout(() => { this.stateDisplay.style.opacity = '0' }, 3000)
  }

  private goHome() {
    this.photoPreview.hide()
    this.camera.stop()
    this.isLive = false
    this.isCapturing = false
    this.stopBtn.style.display = 'none'
    this.captureBtn.style.display = 'none'
    this.stateDisplay.textContent = ''
    this.stateDisplay.style.opacity = '1'
    this.webcamPreview.srcObject = null
    this.landingEl.style.display = 'flex'
  }

  private async startCapture() {
    if (this.isCapturing || !this.isLive) return
    this.isCapturing = true
    this.captureBtn.style.visibility = 'hidden'
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
        this.captureBtn.style.visibility = 'visible'
        return
      }

      if (i < photoCount - 1 && this.settingsData.captureInterval > 0) {
        await this.delay(this.settingsData.captureInterval * 1000)
      }
    }

    audioCtx.close()

    if (paths.length > 0) {
      const sessionId = `session_${Date.now()}`
      const filePaths = paths.filter((p) => !p.startsWith('blob:'))
      const blobBuffers: ArrayBuffer[] = []
      for (const p of paths) {
        if (p.startsWith('blob:')) {
          try {
            const res = await fetch(p)
            blobBuffers.push(await res.arrayBuffer())
          } catch {}
        }
      }
      const uploadResult = await window.hellomyphoto?.uploadPhotos({
        sessionId,
        imagePaths: filePaths,
        imageBuffers: blobBuffers.length > 0 ? blobBuffers : undefined,
        frameName: this.selectedFrame,
        photoCount: paths.length,
      })

      if (uploadResult?.queued) {
        this.offlineIndicator.setOnline(false)
        this.offlineIndicator.setQueueDepth(1)
      }

      this.photoPreview.show(paths)
      this.camera.stop()
      this.webcamPreview.srcObject = null
    } else {
      this.isCapturing = false
    }
  }

  private async reset() {
    this.isCapturing = false
    this.captureBtn.style.visibility = 'visible'
    this.photoPreview.hide()
    this.stateDisplay.textContent = ''
    const stream = await this.camera.startWebcam(this.settingsData.cameraDeviceId)
    if (stream) {
      this.webcamPreview.srcObject = stream
      await this.webcamPreview.play()
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      if (settings.width && settings.height) {
        this.previewBox.style.aspectRatio = `${settings.width} / ${settings.height}`
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}