import { CameraManager, DslrPreviewManager } from '../utils/camera.js'
import { AudioManager } from '../utils/audio.js'
import { CountdownUI } from './Countdown.js'
import { FrameCarousel } from './FrameCarousel.js'
import { PhotoPreview } from './PhotoPreview.js'
import { OfflineIndicator } from './OfflineIndicator.js'
import { Settings, connectBoothSocket, boothSocket } from './Settings.js'

type BoothState = 'idle' | 'live' | 'capturing' | 'preview' | 'paused'
type CameraMode = 'webcam' | 'dslr'

export class BoothApp {
  private container: HTMLElement
  private camera: CameraManager
  private dslrPreview: DslrPreviewManager
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
  private dslrSettingsBtn!: HTMLButtonElement
  private dslrSettingsModal!: HTMLDivElement
  private isDslrSettingsOpen = false
  private stateDisplay!: HTMLDivElement
  private landingEl!: HTMLDivElement
  private flashOverlay!: HTMLDivElement
  private postCaptureEl!: HTMLImageElement
  private startBtn!: HTMLButtonElement
  private confirmModal!: HTMLDivElement

  // DSLR disconnect error overlay
  private dslrErrorOverlay!: HTMLDivElement

  private isCapturing = false
  private isLive = false
  private isPaused = false
  private cameraMode: CameraMode = 'webcam'
  private settingsData: {
    photoCount: number
    countdown: number
    captureInterval: number
    postCapturePreview: number
    serverUrl: string
    cameraDeviceId?: string
    audioDeviceId?: string
    otp?: string
    cameraMode?: CameraMode
    dslrIso?: string
    dslrShutterSpeed?: string
    dslrAperture?: string
  } = { photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, serverUrl: 'http://localhost:3000' }
  private serverOnline = true
  private selectedFrame: string | null = null
  private serverUrl = 'http://localhost:3000'
  private _state: BoothState = 'idle'

  constructor() {
    this.container = document.getElementById('app') || document.body
    this.container.innerHTML = ''

    Object.assign(this.container.style, {
      width: '100%', height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#000', color: '#fff', position: 'relative', overflow: 'hidden',
    })

    // ------------------------------------------------------------------
    // Webcam preview element (used in webcam mode)
    // ------------------------------------------------------------------
    this.webcamPreview = document.createElement('video')
    Object.assign(this.webcamPreview.style, {
      width: '100%', height: '100%', display: 'block',
    })
    this.webcamPreview.autoplay = true
    this.webcamPreview.muted = true
    this.webcamPreview.playsInline = true

    // ------------------------------------------------------------------
    // Post-capture still preview (shared between modes)
    // ------------------------------------------------------------------
    this.postCaptureEl = document.createElement('img')
    Object.assign(this.postCaptureEl.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      objectFit: 'contain', background: '#000', display: 'none',
    })

    // ------------------------------------------------------------------
    // Preview box (contains the active preview source + postCaptureEl)
    // ------------------------------------------------------------------
    this.previewBox = document.createElement('div')
    Object.assign(this.previewBox.style, {
      maxWidth: '100%', maxHeight: '100%', width: '100%',
      position: 'relative', overflow: 'hidden',
    })
    this.previewBox.appendChild(this.webcamPreview)
    this.previewBox.appendChild(this.postCaptureEl)

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

    this.dslrSettingsBtn = document.createElement('button')
    this.dslrSettingsBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    `
    Object.assign(this.dslrSettingsBtn.style, {
      padding: '1rem',
      background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', borderRadius: '50%',
      cursor: 'pointer', pointerEvents: 'all', display: 'none',
      alignItems: 'center', justifyContent: 'center'
    })
    this.dslrSettingsBtn.addEventListener('click', () => this.toggleDslrSettingsModal())

    this.createDslrSettingsModal()

    // ------------------------------------------------------------------
    // Landing screen
    // ------------------------------------------------------------------
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

    this.startBtn = document.createElement('button')
    this.startBtn.textContent = 'Start Taking Photos'
    Object.assign(this.startBtn.style, {
      padding: '1.25rem 4rem', fontSize: '1.5rem', fontWeight: '700',
      background: '#fff', color: '#000', border: 'none', borderRadius: '100px',
      cursor: 'pointer', marginTop: '1rem',
    })
    this.startBtn.addEventListener('click', () => {
      if (this.isEventConnected()) {
        this.goLive()
      } else {
        this.showOfflineConfirm()
      }
    })
    this.landingEl.appendChild(this.startBtn)

    // ------------------------------------------------------------------
    // Offline confirm modal
    // ------------------------------------------------------------------
    this.confirmModal = document.createElement('div')
    Object.assign(this.confirmModal.style, {
      position: 'absolute', inset: '0', zIndex: '35',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)',
    })
    const confirmBox = document.createElement('div')
    Object.assign(confirmBox.style, {
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px',
      padding: '1.5rem', maxWidth: '360px', width: '90%', textAlign: 'center',
    })
    confirmBox.innerHTML = `
      <p style="font-size:0.9375rem;color:#ccc;margin:0 0 1.25rem;line-height:1.4;">
        Booth is not linked to an event.<br>Continue in test mode?<br>
        <span style="font-size:0.8125rem;color:#666;">Photos won't be uploaded until linked to an event.</span>
      </p>
      <div style="display:flex;gap:0.5rem;justify-content:center;">
        <button id="offline-confirm-btn" style="padding:0.5rem 1.25rem;background:#4caf50;color:#fff;border:none;border-radius:6px;font-size:0.8125rem;font-weight:600;cursor:pointer;">Continue Offline</button>
        <button id="offline-cancel-btn" style="padding:0.5rem 1.25rem;background:transparent;color:#888;border:1px solid #333;border-radius:6px;font-size:0.8125rem;cursor:pointer;">Cancel</button>
      </div>
    `
    this.confirmModal.appendChild(confirmBox)
    this.container.appendChild(this.confirmModal)

    confirmBox.querySelector('#offline-confirm-btn')!.addEventListener('click', () => {
      this.confirmModal.style.display = 'none'
      this.goLive()
    })
    confirmBox.querySelector('#offline-cancel-btn')!.addEventListener('click', () => {
      this.confirmModal.style.display = 'none'
    })

    const settingsBtn = document.createElement('button')
    settingsBtn.textContent = 'Settings'
    Object.assign(settingsBtn.style, {
      padding: '0.75rem 2.5rem', fontSize: '1rem', fontWeight: '500',
      background: 'transparent', color: '#888', border: '1px solid #333',
      borderRadius: '100px', cursor: 'pointer',
    })
    settingsBtn.addEventListener('click', () => this.settings.toggle())
    this.landingEl.appendChild(settingsBtn)

    // ------------------------------------------------------------------
    // Flash overlay
    // ------------------------------------------------------------------
    this.flashOverlay = document.createElement('div')
    Object.assign(this.flashOverlay.style, {
      position: 'absolute', inset: '0', zIndex: '45',
      background: '#fff', pointerEvents: 'none', opacity: '0',
    })

    // ------------------------------------------------------------------
    // DSLR disconnect error overlay
    // ------------------------------------------------------------------
    this.dslrErrorOverlay = this.buildDslrErrorOverlay()

    this.container.append(
      this.landingEl,
      this.previewWindow,
      this.overlay,
      this.stateDisplay,
      this.stopBtn,
      this.statusBar,
      this.flashOverlay,
      this.dslrErrorOverlay,
    )

    this.camera = new CameraManager()
    this.dslrPreview = new DslrPreviewManager()
    this.audio = new AudioManager()
    this.countdown = new CountdownUI(this.overlay)
    this.frameCarousel = new FrameCarousel(this.statusBar, (frameId) => { this.selectedFrame = frameId })
    this.photoPreview = new PhotoPreview(this.container, () => this.reset(), () => this.goHome(), () => this.goHome())
    this.offlineIndicator = new OfflineIndicator(this.statusBar)
    this.settings = new Settings(this.container, (s) => {
      const prevMode = this.cameraMode
      this.settingsData = s
      this.cameraMode = (s.cameraMode as CameraMode) || 'webcam'
      // If mode changed while live, restart preview in new mode
      if (this.isLive && prevMode !== this.cameraMode) {
        this.restartPreview()
      }
    })

    this.setupKeyboardShortcuts()
    this.setupIpcListeners()
  }

  // -------------------------------------------------------------------------
  // DSLR error overlay builder
  // -------------------------------------------------------------------------

  private buildDslrErrorOverlay(): HTMLDivElement {
    const overlay = document.createElement('div')
    Object.assign(overlay.style, {
      position: 'absolute', inset: '0', zIndex: '60',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)',
    })

    const box = document.createElement('div')
    Object.assign(box.style, {
      background: '#1a1a1a', border: '1px solid #3a1a1a', borderRadius: '16px',
      padding: '2rem', maxWidth: '400px', width: '90%', textAlign: 'center',
    })

    box.innerHTML = `
      <div style="font-size:3rem;margin-bottom:1rem;">📷</div>
      <h2 style="font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;">Camera Disconnected</h2>
      <p id="dslr-error-msg" style="font-size:0.875rem;color:#888;margin:0 0 1.5rem;line-height:1.5;">
        The camera was unplugged. Please reconnect it via USB and press Retry.
      </p>
      <div style="display:flex;gap:0.75rem;justify-content:center;">
        <button id="dslr-retry-btn" style="padding:0.75rem 2rem;background:#fff;color:#000;border:none;border-radius:100px;font-size:1rem;font-weight:700;cursor:pointer;">Retry</button>
        <button id="dslr-go-home-btn" style="padding:0.75rem 2rem;background:transparent;color:#888;border:1px solid #333;border-radius:100px;font-size:1rem;cursor:pointer;">Exit</button>
      </div>
    `

    overlay.appendChild(box)

    box.querySelector('#dslr-retry-btn')!.addEventListener('click', () => this.retryDslrConnection())
    box.querySelector('#dslr-go-home-btn')!.addEventListener('click', () => {
      this.hideDslrError()
      this.goHome()
    })

    return overlay
  }

  private showDslrError(message?: string) {
    // Stop any active capture sequence
    this.isCapturing = false
    this._state = 'idle'

    const msgEl = this.dslrErrorOverlay.querySelector<HTMLParagraphElement>('#dslr-error-msg')
    if (msgEl && message) msgEl.textContent = message

    this.dslrErrorOverlay.style.display = 'flex'
  }

  private hideDslrError() {
    this.dslrErrorOverlay.style.display = 'none'
  }

  private async retryDslrConnection() {
    const retryBtn = this.dslrErrorOverlay.querySelector<HTMLButtonElement>('#dslr-retry-btn')!
    retryBtn.textContent = 'Detecting...'
    retryBtn.disabled = true

    const result = await window.hellomyphoto?.detectDslr()

    retryBtn.disabled = false
    retryBtn.textContent = 'Retry'

    if (result?.connected) {
      this.hideDslrError()
      // Re-start liveview
      const started = await this.dslrPreview.start()
      if (!started) {
        this.showDslrError('Camera detected but liveview failed to start. Try unplugging and reconnecting.')
      }
    } else {
      const msgEl = this.dslrErrorOverlay.querySelector<HTMLParagraphElement>('#dslr-error-msg')
      if (msgEl) msgEl.textContent = 'Camera still not detected. Check the USB cable and try again.'
    }
  }

  private createDslrSettingsModal() {
    this.dslrSettingsModal = document.createElement('div')
    Object.assign(this.dslrSettingsModal.style, {
      position: 'absolute', bottom: '100px', right: '40px',
      background: 'rgba(20,20,20,0.85)', backdropFilter: 'blur(10px)', border: '1px solid #333',
      borderRadius: '12px', padding: '1.5rem', width: '320px', display: 'none', zIndex: '100',
      flexDirection: 'column', gap: '1rem', color: '#fff', fontFamily: 'system-ui, sans-serif'
    })

    const title = document.createElement('div')
    title.textContent = 'Camera Exposure'
    title.style.cssText = 'font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem;'
    this.dslrSettingsModal.appendChild(title)

    const isoChoices = ['auto', '100', '200', '400', '800', '1600', '3200', '6400']
    const shutterChoices = ['auto', '1/30', '1/40', '1/50', '1/60', '1/80', '1/100', '1/125', '1/160', '1/200', '1/250', '1/320', '1/400', '1/500', '1/640', '1/800']
    const apertureChoices = ['auto', '2.8', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11']

    const createSliderRow = (labelStr: string, choices: string[], key: 'dslrIso' | 'dslrShutterSpeed' | 'dslrAperture') => {
      const row = document.createElement('div')
      row.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;'
      const header = document.createElement('div')
      header.style.cssText = 'display: flex; justify-content: space-between; font-size: 0.9rem;'
      const lbl = document.createElement('span')
      lbl.textContent = labelStr; lbl.style.color = '#aaa'
      const valDisp = document.createElement('span')
      valDisp.textContent = this.settingsData[key] || 'auto'
      header.appendChild(lbl); header.appendChild(valDisp)
      
      const input = document.createElement('input')
      input.type = 'range'; input.min = '0'; input.max = String(choices.length - 1)
      const currentIdx = choices.indexOf(this.settingsData[key] || 'auto')
      input.value = String(currentIdx >= 0 ? currentIdx : 0)
      
      input.addEventListener('input', () => {
        const v = choices[parseInt(input.value)]
        valDisp.textContent = v
        this.settingsData[key] = v
      })
      input.addEventListener('change', () => {
        window.hellomyphoto?.saveSettings(this.settingsData)
      })

      row.appendChild(header)
      row.appendChild(input)
      return row
    }

    this.dslrSettingsModal.appendChild(createSliderRow('Shutter', shutterChoices, 'dslrShutterSpeed'))
    this.dslrSettingsModal.appendChild(createSliderRow('ISO', isoChoices, 'dslrIso'))
    this.dslrSettingsModal.appendChild(createSliderRow('Aperture', apertureChoices, 'dslrAperture'))

    // Update modal when global settings are updated remotely
    window.hellomyphoto?.getSettings().then((s) => {
      if (s) {
        this.settingsData = { ...this.settingsData, ...s }
        // We re-render lazily on open, so just close it if it's open to refresh next time
      }
    })

    document.body.appendChild(this.dslrSettingsModal)
  }

  private toggleDslrSettingsModal() {
    this.isDslrSettingsOpen = !this.isDslrSettingsOpen
    if (this.isDslrSettingsOpen) {
      // Rebuild the modal to get fresh values
      this.dslrSettingsModal.remove()
      this.createDslrSettingsModal()
      this.dslrSettingsModal.style.display = 'flex'
      this.dslrSettingsBtn.style.background = 'rgba(255, 255, 255, 0.3)'
    } else {
      this.dslrSettingsModal.style.display = 'none'
      this.dslrSettingsBtn.style.background = 'rgba(255, 255, 255, 0.1)'
    }
  }

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Command handling
  // -------------------------------------------------------------------------

  private handleBoothCommand(cmd: { type: string; settings?: any }) {
    if (cmd.type === 'capture') {
      if (this.isPaused) return
      if (!this.isLive) {
        this.goLive().then(() => setTimeout(() => this.startCapture(), 1500))
      } else if (!this.isCapturing) {
        this.startCapture()
      }
    } else if (cmd.type === 'start') {
      if (!this.isLive) this.goLive()
    } else if (cmd.type === 'booth-pause') {
      // Handle the 'booth-pause' event sent by the operator panel
      const paused = (cmd as any).paused !== false
      this.isPaused = paused
      this.stateDisplay.textContent = paused ? 'PAUSED' : ''
      this.emitBoothState()
    } else if (cmd.type === 'pause') {
      this.isPaused = true
      this.stateDisplay.textContent = 'PAUSED'
      this.emitBoothState()
    } else if (cmd.type === 'resume') {
      this.isPaused = false
      this.stateDisplay.textContent = ''
      this.emitBoothState()
    } else if (cmd.type === 'go-home') {
      this.goHome()
    } else if (cmd.type === 'frame-override') {
      this.selectedFrame = (cmd as any).frameId || null
    } else if (cmd.type === 'reshot') {
      if (this.isLive && !this.isCapturing) this.startCapture()
    } else if (cmd.type === 'settings-update') {
      this.settingsData = { ...this.settingsData, ...cmd.settings }
      window.hellomyphoto?.saveSettings(this.settingsData)
    }
  }

  // -------------------------------------------------------------------------
  // IPC listeners
  // -------------------------------------------------------------------------

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
    // IPC path: commands forwarded from Electron main process (via HTTP polling fallback)
    window.hellomyphoto?.onBoothCommand((cmd) => {
      this.handleBoothCommand(cmd)
    })
    // WebSocket path: commands received in real-time directly from the server socket
    // This fires instantly when the operator clicks Start/Begin Countdown/Exit
    document.addEventListener('booth-ws-command', (e: Event) => {
      const cmd = (e as CustomEvent).detail
      this.handleBoothCommand(cmd)
    })

    // DSLR camera unplugged mid-session
    window.hellomyphoto?.onDslrDisconnected(({ model }) => {
      if (!this.isLive) return
      // Stop liveview gracefully
      this.dslrPreview.stop()
      const modelStr = model ? `"${model}"` : 'The camera'
      this.showDslrError(
        `${modelStr} was unplugged. Please reconnect it via USB and press Retry.`
      )
    })
  }

  // -------------------------------------------------------------------------
  // Misc helpers
  // -------------------------------------------------------------------------

  private isEventConnected(): boolean {
    return !!(boothSocket?.connected)
  }

  private updateStartBtn() {
    if (this.isEventConnected()) {
      this.startBtn.textContent = 'Start Taking Photos'
      Object.assign(this.startBtn.style, {
        background: '#fff', color: '#000', cursor: 'pointer',
      })
    } else {
      this.startBtn.textContent = 'Booth Not Connected'
      Object.assign(this.startBtn.style, {
        background: 'rgba(255,255,255,0.1)', color: '#666', cursor: 'pointer',
      })
    }
  }

  // -------------------------------------------------------------------------
  // Mount
  // -------------------------------------------------------------------------

  async mount() {
    const settings = await window.hellomyphoto?.getSettings()
    if (settings) {
      this.settingsData = { ...this.settingsData, ...settings }
      this.cameraMode = (settings.cameraMode as CameraMode) || 'webcam'
      console.log(`[BoothApp] mount() — cameraMode loaded from settings: "${this.cameraMode}"`)
      const otp = (settings as any).otp
      if (otp) {
        connectBoothSocket(this.settingsData.serverUrl.replace(/\/+$/, ''), otp)
        this.fetchEventSettings()
      }
    } else {
      console.warn('[BoothApp] mount() — getSettings() returned null/undefined, using defaults')
    }
    await this.frameCarousel.loadFrames(this.serverUrl)
    this.updateStartBtn()

    document.addEventListener('booth-socket-connect', () => this.updateStartBtn())
    document.addEventListener('booth-socket-disconnect', () => this.updateStartBtn())
  }

  private async fetchEventSettings() {
    const otp = this.settingsData.otp
    if (!otp) return
    try {
      const url = this.settingsData.serverUrl.replace(/\/+$/, '')
      const res = await fetch(`${url}/api/booth/settings?otp=${otp}`)
      if (res.ok) {
        const data = await res.json()
        this.settingsData = { ...this.settingsData, ...data }
        window.hellomyphoto?.saveSettings(this.settingsData)
      }
    } catch {
      // Server unreachable — keep local settings
    }
  }

  private showOfflineConfirm() {
    this.confirmModal.style.display = 'flex'
  }

  private emitBoothState() {
    const state = this.isPaused ? 'paused' : this._state
    try { boothSocket?.emit('booth-state', { state }) } catch {}
  }

  // -------------------------------------------------------------------------
  // Preview management helpers
  // -------------------------------------------------------------------------

  /**
   * Swap the active preview source in previewBox.
   *
   * DSLR mode: remove <video>, insert <img> (DslrPreviewManager.element)
   * Webcam mode: remove <img>, insert <video>
   */
  private setPreviewSource(mode: CameraMode) {
    const dslrEl = this.dslrPreview.element

    if (mode === 'dslr') {
      if (!this.previewBox.contains(dslrEl)) {
        this.previewBox.insertBefore(dslrEl, this.webcamPreview)
      }
      this.webcamPreview.style.display = 'none'
      dslrEl.style.display = 'block'
    } else {
      if (this.previewBox.contains(dslrEl)) {
        this.previewBox.removeChild(dslrEl)
      }
      this.webcamPreview.style.display = 'block'
    }
  }

  // -------------------------------------------------------------------------
  // goLive
  // -------------------------------------------------------------------------

  private async goLive() {
    console.log(`[BoothApp] goLive() — cameraMode="${this.cameraMode}"`)
    this.landingEl.style.display = 'none'

    if (this.settingsData.audioDeviceId) {
      await this.audio.setSinkId(this.settingsData.audioDeviceId)
    }

    if (this.cameraMode === 'dslr') {
      console.log('[BoothApp] goLive() — branching to DSLR preview')
      await this.startDslrPreview()
    } else {
      console.log('[BoothApp] goLive() — branching to webcam preview')
      await this.startWebcamPreview()
    }

    this.isLive = true
    this._state = 'live'
    this.emitBoothState()
    this.stopBtn.style.display = 'block'
    this.captureBtn.style.display = 'block'
    this.captureBtn.style.visibility = 'visible'
    this.statusBar.appendChild(this.captureBtn)
    
    if (this.cameraMode === 'dslr') {
      this.dslrSettingsBtn.style.display = 'flex'
      this.statusBar.appendChild(this.dslrSettingsBtn)
    } else {
      this.dslrSettingsBtn.style.display = 'none'
    }
    
    this.stateDisplay.textContent = 'Touch to Start'
    setTimeout(() => { this.stateDisplay.style.opacity = '0' }, 3000)
  }

  private async startDslrPreview() {
    console.log('[BoothApp] startDslrPreview() — swapping to DSLR <img> element')
    this.setPreviewSource('dslr')

    // Show a connecting state so the user doesn't see a blank screen
    const connectingOverlay = this.showConnectingOverlay()

    console.log('[BoothApp] startDslrPreview() — calling dslrPreview.start()...')
    const started = await this.dslrPreview.start()
    console.log(`[BoothApp] startDslrPreview() — dslrPreview.start() returned: ${started}`)

    connectingOverlay.remove()

    if (!started) {
      const errMsg = this.dslrPreview.lastError ||
        'Camera liveview failed. Unplug and re-plug the USB cable, then try again.\n\n' +
        'If the problem persists, run in a terminal:\nkillall PTPCamera'
      console.error('[BoothApp] DSLR liveview failed — showing error overlay')
      this.showDslrError(errMsg)
    }
  }

  /**
   * Show a "Connecting camera…" overlay on the preview box while liveview starts.
   * Returns the overlay element so the caller can remove it when done.
   */
  private showConnectingOverlay(): HTMLDivElement {
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #000; color: #fff; font-family: sans-serif; z-index: 20;
    `
    overlay.innerHTML = `
      <div style="font-size: 3rem; animation: spin 1.5s linear infinite;">&#128247;</div>
      <div style="margin-top: 1rem; font-size: 1rem; opacity: 0.7;">Connecting camera…</div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; opacity: 0.4;">Releasing USB interface</div>
      <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
    `
    // Insert into previewBox (needs position: relative)
    this.previewBox.style.position = 'relative'
    this.previewBox.appendChild(overlay)
    return overlay
  }

  private async startWebcamPreview() {
    console.log(`[BoothApp] startWebcamPreview() — deviceId="${this.settingsData.cameraDeviceId || 'default'}"`)
    this.setPreviewSource('webcam')
    const stream = await this.camera.startWebcam(this.settingsData.cameraDeviceId)
    if (stream) {
      this.webcamPreview.srcObject = stream
      await this.webcamPreview.play()
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      if (settings.width && settings.height) {
        this.previewBox.style.aspectRatio = `${settings.width} / ${settings.height}`
      }
      console.log(`[BoothApp] startWebcamPreview() — stream active (${settings.width}x${settings.height})`)
    } else {
      console.error('[BoothApp] startWebcamPreview() — getUserMedia returned null stream')
    }
  }

  /** Called when camera mode changes while live — restart in new mode. */
  private async restartPreview() {
    // Stop current source
    if (this.cameraMode === 'webcam') {
      // Was DSLR, now webcam
      await this.dslrPreview.stop()
      await this.startWebcamPreview()
    } else {
      // Was webcam, now DSLR
      this.camera.stop()
      this.webcamPreview.srcObject = null
      await this.startDslrPreview()
    }
  }

  // -------------------------------------------------------------------------
  // goHome
  // -------------------------------------------------------------------------

  private async goHome() {
    this.photoPreview.hide()

    // Stop whichever preview source is active.
    // Always send the IPC stop — the camera may have liveview/mirror up even
    // if the renderer-side DslrPreviewManager is not active.
    if (this.cameraMode === 'dslr') {
      await this.dslrPreview.stop()
    }
    this.camera.stop()

    this.isLive = false
    this.isCapturing = false
    this._state = 'idle'
    this.emitBoothState()
    
    if (this.isDslrSettingsOpen) {
      this.toggleDslrSettingsModal()
    }
    this.stopBtn.style.display = 'none'
    this.captureBtn.style.display = 'none'
    this.stateDisplay.textContent = ''
    this.stateDisplay.style.opacity = '1'
    this.webcamPreview.srcObject = null
    this.landingEl.style.display = 'flex'
    this.confirmModal.style.display = 'none'
    this.hideDslrError()
    this.updateStartBtn()
  }

  // -------------------------------------------------------------------------
  // startCapture
  // -------------------------------------------------------------------------

  private async startCapture() {
    if (this.isCapturing || !this.isLive) return
    this.isCapturing = true
    this._state = 'capturing'
    this.emitBoothState()
    this.captureBtn.style.visibility = 'hidden'
    this.stateDisplay.textContent = ''

    const photoCount = this.settingsData.photoCount
    const paths: string[] = []
    const audioCtx = new AudioContext()

    for (let i = 0; i < photoCount; i++) {
      this.stateDisplay.textContent = `Shot ${i + 1} of ${photoCount}`
      await this.countdown.play(this.settingsData.countdown, audioCtx)

      let result: { success: boolean; path?: string; error?: string }

      if (this.cameraMode === 'dslr') {
        result = await this.captureDslrShot()
      } else {
        result = await this.camera.captureStill()
      }

      if (result?.success && result.path) {
        paths.push(result.path)
        this.audio.playShutter()
        await this.flashWhite()
        this.stateDisplay.textContent = ''

        if (this.settingsData.postCapturePreview > 0) {
          await this.showPostCapture(result.path, this.settingsData.postCapturePreview)
        }

        // Resume DSLR liveview after each shot (done inside captureDslrShot but
        // resume after post-capture display so the preview is ready for next shot)
        if (this.cameraMode === 'dslr' && i < photoCount - 1) {
          // Liveview is resumed by gphoto2.ts capture() after the shot,
          // but we still need to restart the renderer's frame listener
          if (!this.dslrPreview.isActive()) {
            await this.dslrPreview.start()
          }
        }

        if (i < photoCount - 1 && this.settingsData.captureInterval > 0) {
          await this.delay(this.settingsData.captureInterval * 1000)
        }
      } else {
        const errMsg = result?.error || 'Unknown error'
        console.error(`[BoothApp] Capture failed: ${errMsg}`)
        this.stateDisplay.innerHTML = `<span style="color: #ff4444; font-size: 1.5rem;">Capture failed</span><br/><span style="font-size: 1rem; color: #fff;">${errMsg}</span><br/><br/><span style="font-size: 1rem;">Tap to retry</span>`
        this.isCapturing = false
        this.captureBtn.style.visibility = 'visible'
        audioCtx.close()
        return
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

      // Stop liveview before switching to preview screen.
      // Always send the IPC stop — DslrManager.capture() restarts liveview on
      // the camera after each shot, so the camera may still have the mirror up
      // even though the renderer-side preview was not restarted for the last shot.
      if (this.cameraMode === 'dslr') {
        await this.dslrPreview.stop()
      }

      this._state = 'preview'
      this.emitBoothState()
      this.photoPreview.show(paths)
      this.camera.stop()
      this.webcamPreview.srcObject = null
    } else {
      this.isCapturing = false
      this._state = 'live'
      this.emitBoothState()
    }
  }

  /**
   * Fire the DSLR shutter for one shot.
   *
   * Sequence:
   *  1. Pause liveview renderer (stop frame listener)
   *  2. Call capture-photo IPC → main stops liveview, fires shutter, resumes liveview
   *  3. Show "Processing…" overlay while waiting
   *  4. Return result
   */
  private async captureDslrShot(): Promise<{ success: boolean; path?: string; error?: string }> {
    console.log('[BoothApp] captureDslrShot() — stopping liveview renderer before capture')
    // Stop receiving frames so the img element doesn't update during capture
    await this.dslrPreview.stop()

    // Show processing state
    this.showProcessingOverlay()

    console.log('[BoothApp] captureDslrShot() — calling capture-photo IPC...')
    const result = await window.hellomyphoto?.capture()
    console.log('[BoothApp] captureDslrShot() — capture result:', JSON.stringify(result))

    this.hideProcessingOverlay()

    return result ?? { success: false, error: 'IPC unavailable' }
  }

  private processingOverlay: HTMLDivElement | null = null

  private showProcessingOverlay() {
    if (!this.processingOverlay) {
      this.processingOverlay = document.createElement('div')
      Object.assign(this.processingOverlay.style, {
        position: 'absolute', inset: '0', zIndex: '55',
        background: 'rgba(0,0,0,0.85)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '1rem',
      })
      this.processingOverlay.innerHTML = `
        <div style="font-size:2rem;">📷</div>
        <p style="color:#fff;font-size:1rem;font-weight:600;margin:0;">Processing…</p>
      `
      this.container.appendChild(this.processingOverlay)
    }
    this.processingOverlay.style.display = 'flex'
  }

  private hideProcessingOverlay() {
    if (this.processingOverlay) {
      this.processingOverlay.style.display = 'none'
    }
  }

  // -------------------------------------------------------------------------
  // reset (retake)
  // -------------------------------------------------------------------------

  private async reset() {
    this.isCapturing = false
    this._state = 'live'
    this.emitBoothState()
    this.captureBtn.style.visibility = 'visible'
    this.photoPreview.hide()
    this.stateDisplay.textContent = ''

    if (this.cameraMode === 'dslr') {
      await this.startDslrPreview()
    } else {
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
  }

  // -------------------------------------------------------------------------
  // Visual effects
  // -------------------------------------------------------------------------

  private async flashWhite() {
    this.flashOverlay.style.transition = 'none'
    this.flashOverlay.style.opacity = '1'
    void this.flashOverlay.offsetHeight
    this.flashOverlay.style.transition = 'opacity 200ms ease-out'
    this.flashOverlay.style.opacity = '0'
    await this.delay(250)
  }

  private async showPostCapture(path: string, duration: number) {
    this.postCaptureEl.src = path
    this.postCaptureEl.style.display = 'block'

    if (this.cameraMode === 'dslr') {
      // In DSLR mode the live preview is already paused — just show the still
      await this.delay(duration * 1000)
    } else {
      this.webcamPreview.style.opacity = '0'
      await this.delay(duration * 1000)
      this.webcamPreview.style.opacity = '1'
    }

    this.postCaptureEl.style.display = 'none'
    this.postCaptureEl.src = ''
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}