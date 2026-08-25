import { CameraManager, DslrPreviewManager } from '../utils/camera.js'
import { AudioManager } from '../utils/audio.js'
import { CountdownUI } from './Countdown.js'
import { PhotoPreview } from './PhotoPreview.js'
import { OfflineIndicator } from './OfflineIndicator.js'
import { Settings, connectBoothSocket, boothSocket } from './Settings.js'
import { Gallery } from './Gallery.js'
import { createButton, createModal, createInput, createSpinner } from '../utils/UIKit.js'


type BoothState = 'idle' | 'live' | 'capturing' | 'preview' | 'paused'
type CameraMode = 'webcam' | 'dslr'

export class BoothApp {
  private container: HTMLElement
  private camera: CameraManager
  private dslrPreview: DslrPreviewManager
  private audio: AudioManager
  private countdown: CountdownUI
  private photoPreview: PhotoPreview
  private offlineIndicator: OfflineIndicator
  private gallery: Gallery
  private uploadStatusBar!: HTMLDivElement
  private settings: Settings

  private webcamPreview: HTMLVideoElement
  private previewWindow: HTMLDivElement
  private previewBox: HTMLDivElement
  private overlay: HTMLDivElement
  private statusBar: HTMLDivElement
  private captureBtn: HTMLButtonElement
  private settingsBtn!: HTMLButtonElement
  private exitBtn!: HTMLButtonElement
  private pauseBtn!: HTMLButtonElement
  private statusActions!: HTMLDivElement
  private isPauseActive = false
  private pauseResume: (() => void) | null = null
  private stateDisplay!: HTMLDivElement
  private landingEl!: HTMLDivElement
  private flashOverlay!: HTMLDivElement
  private postCaptureEl!: HTMLImageElement
  private startBtn!: HTMLButtonElement
  private confirmModal!: HTMLDivElement

  // DSLR disconnect error overlay
  private dslrErrorOverlay!: HTMLDivElement
  private captureErrorOverlay!: HTMLDivElement

  private captureProgress!: HTMLDivElement
  private captureProgressText!: HTMLDivElement
  private captureProgressBars!: HTMLDivElement

  private isCapturing = false
  private isLive = false
  private isTransitioning = false
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
    dslrWhiteBalance?: string
    dslrWhiteBalanceKelvin?: number
    dslrFocusMode?: string
    liveviewMode?: 'mjpeg' | 'polling'
    autoPreview?: boolean
    liveviewRetryAttempts?: number
    shutterOffsetDelay?: number
    settingsPasscode?: string
  } = { photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, serverUrl: '', liveviewMode: 'mjpeg', autoPreview: false, liveviewRetryAttempts: 1, shutterOffsetDelay: 0, dslrWhiteBalance: 'auto', dslrWhiteBalanceKelvin: 5200 }
  private serverOnline = true
  private serverUrl = ''
  private _state: BoothState = 'idle'
  private currentSessionId: string | null = null
  private currentSessionUploaded = false
  private currentPaths: string[] = []

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
      maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%',
      position: 'relative', overflow: 'hidden', background: '#222',
    })
    this.previewBox.appendChild(this.webcamPreview)
    this.previewBox.appendChild(this.postCaptureEl)

    this.previewWindow = document.createElement('div')
    Object.assign(this.previewWindow.style, {
      flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '0', width: '100%', background: '#000', paddingTop: '2rem',
    })
    this.previewWindow.appendChild(this.previewBox)
    this.previewWindow.addEventListener('click', (e) => {
      if (this.isLive && !this.isCapturing && e.target !== this.captureBtn && !this.statusActions.contains(e.target as Node)) {
        this.startCapture()
      }
    })

    this.overlay = document.createElement('div')
    Object.assign(this.overlay.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    })
    
    this.previewWindow.appendChild(this.overlay)

    this.stateDisplay = document.createElement('div')
    Object.assign(this.stateDisplay.style, {
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      fontSize: '8rem', fontWeight: '900', color: 'rgba(255,255,255,0.15)',
      textAlign: 'center', pointerEvents: 'none', userSelect: 'none',
    })

    this.statusBar = document.createElement('div')
    Object.assign(this.statusBar.style, {
      display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', zIndex: '10', width: '100%', boxSizing: 'border-box',
      flexShrink: '0', position: 'relative'
    })

    this.captureBtn = document.createElement('button')
    this.captureBtn.textContent = 'Start'
    Object.assign(this.captureBtn.style, {
      padding: '1rem 3rem', fontSize: '1.5rem', fontWeight: '700',
      background: '#fff', color: '#000', border: 'none', borderRadius: '100px',
      cursor: 'pointer', pointerEvents: 'all',
    })
    this.captureBtn.addEventListener('click', () => this.startCapture())

    // Right-side action buttons container
    this.statusActions = document.createElement('div')
    Object.assign(this.statusActions.style, {
      display: 'flex', gap: '0.5rem', alignItems: 'center',
      position: 'absolute', right: '2rem',
    })

    
    this.settingsBtn = document.createElement('button')
    this.settingsBtn.className = 'booth-icon-btn'
    this.settingsBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
    this.settingsBtn.addEventListener('click', () => this.openSettings('exposure'))

    this.pauseBtn = document.createElement('button')
    this.pauseBtn.className = 'booth-icon-btn'
    this.pauseBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
    this.pauseBtn.addEventListener('click', () => this.togglePause())

    this.exitBtn = document.createElement('button')
    this.exitBtn.className = 'booth-icon-btn'
    this.exitBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
    this.exitBtn.addEventListener('click', () => this.goHome())

    this.statusActions.appendChild(this.settingsBtn)
    this.statusActions.appendChild(this.pauseBtn)
    this.statusActions.appendChild(this.exitBtn)
    this.statusBar.appendChild(this.statusActions)

    // ------------------------------------------------------------------
    // Landing screen
    // ------------------------------------------------------------------
    this.landingEl = document.createElement('div')
    this.landingEl.className = 'booth-landing'

    const brand = document.createElement('h1')
    brand.textContent = 'hellomyphoto'
    brand.className = 'booth-landing-brand'
    this.landingEl.appendChild(brand)

    const subtitle = document.createElement('p')
    subtitle.textContent = 'Photo Booth'
    subtitle.className = 'booth-landing-subtitle'
    this.landingEl.appendChild(subtitle)

    this.startBtn = document.createElement('button')
    this.startBtn.textContent = 'Start'
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

    // Past Sessions button
    const pastSessionsBtn = document.createElement('button')
    pastSessionsBtn.textContent = 'Past Sessions'
    Object.assign(pastSessionsBtn.style, {
      padding: '0.5rem 1.25rem',
      background: 'transparent', color: '#888', border: '1px solid #333',
      borderRadius: '8px', cursor: 'pointer',
      fontSize: '0.8125rem', fontWeight: '500',
      transition: 'color 150ms, border-color 150ms',
    })
    pastSessionsBtn.addEventListener('mouseenter', () => {
      pastSessionsBtn.style.color = '#ccc'
      pastSessionsBtn.style.borderColor = '#555'
    })
    pastSessionsBtn.addEventListener('mouseleave', () => {
      pastSessionsBtn.style.color = '#888'
      pastSessionsBtn.style.borderColor = '#333'
    })
    pastSessionsBtn.addEventListener('click', () => this.gallery.show())
    this.landingEl.appendChild(pastSessionsBtn)

    // Settings as hyperlink text
    const settingsLink = document.createElement('button')
    settingsLink.textContent = 'Settings'
    Object.assign(settingsLink.style, {
      background: 'none', border: 'none', cursor: 'pointer',
      fontSize: '0.8125rem', color: '#444',
      padding: '0.25rem 0', textDecoration: 'none',
      transition: 'color 150ms',
    })
    settingsLink.addEventListener('mouseenter', () => { settingsLink.style.color = '#888' })
    settingsLink.addEventListener('mouseleave', () => { settingsLink.style.color = '#444' })
    settingsLink.addEventListener('click', () => this.openSettings('full'))
    this.landingEl.appendChild(settingsLink)

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

    // ------------------------------------------------------------------
    // Flash overlay
    // ------------------------------------------------------------------
    this.flashOverlay = document.createElement('div')
    this.flashOverlay.className = 'booth-flash-overlay'

    // ------------------------------------------------------------------
    // DSLR disconnect error overlay
    // ------------------------------------------------------------------
    this.dslrErrorOverlay = this.buildDslrErrorOverlay()
    this.captureErrorOverlay = this.buildCaptureErrorOverlay()
    this.createCaptureProgress()

    const style = document.createElement('style')
    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`
    document.head.appendChild(style)

    this.previewWindow.appendChild(this.stateDisplay)

    this.container.append(
      this.landingEl,
      this.previewWindow,
      this.statusBar,
      this.flashOverlay,
      this.dslrErrorOverlay,
      this.captureErrorOverlay,
      this.captureProgress,
    )

    this.camera = new CameraManager()
    this.dslrPreview = new DslrPreviewManager()
    this.audio = new AudioManager()
    this.countdown = new CountdownUI(this.overlay)
    this.photoPreview = new PhotoPreview(
      this.container,
      (indices) => {
        this.retakePhotos(indices)
      },
      () => this.goHome()
    )
    this.offlineIndicator = new OfflineIndicator(this.container)
    this.gallery = new Gallery(this.container)

    // Upload status bar
    this.uploadStatusBar = document.createElement('div')
    this.uploadStatusBar.className = 'booth-upload-status-bar'
    this.container.appendChild(this.uploadStatusBar)
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
      <div style="margin-bottom:1rem;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="2" y1="2" x2="22" y2="22"/>
          <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/>
          <path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/>
          <path d="M14.12 15.12A3 3 0 1 1 9.88 10.88"/>
        </svg>
      </div>
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

  private buildCaptureErrorOverlay(): HTMLDivElement {
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
      <div style="margin-bottom:1rem;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h2 style="font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;">Capture Failed</h2>
      <p id="capture-error-msg" style="font-size:0.875rem;color:#888;margin:0 0 1.5rem;line-height:1.5;word-break:break-word;">
        Unknown error occurred.
      </p>
      <div style="display:flex;gap:0.75rem;justify-content:center;">
        <button id="capture-error-ok-btn" style="padding:0.75rem 2rem;background:#fff;color:#000;border:none;border-radius:100px;font-size:1rem;font-weight:700;cursor:pointer;">OK</button>
      </div>
    `

    overlay.appendChild(box)

    box.querySelector('#capture-error-ok-btn')!.addEventListener('click', () => {
      overlay.style.display = 'none'
      try { boothSocket?.emit('resolve-booth-error', { errorId: 'capture-error', action: 'dismiss' }) } catch {}
    })

    return overlay
  }

  private formatCaptureError(rawError: string): string {
    if (!rawError) return 'Unknown error occurred.'
    
    const lines = rawError.split('\n').map(l => l.trim()).filter(Boolean)
    const cleanedLines = lines.filter(l => {
      const lower = l.toLowerCase()
      if (lower === '*** error ***') return false
      if (lower === 'error: could not capture image.') return false
      if (lower === 'error: could not capture.') return false
      return true
    })
    
    const uniqueLines = [...new Set(cleanedLines)]
    
    if (uniqueLines.length === 0) {
      return 'Camera failed to capture. Please check if the lens cap is on or if it failed to focus.'
    }
    
    // Escape HTML to prevent XSS, then replace newlines with <br/>
    const escapeHtml = (unsafe: string) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
    }
    
    return uniqueLines.map(escapeHtml).join('<br/><br/>')
  }

  private createCaptureProgress() {
    this.captureProgress = document.createElement('div')
    this.captureProgress.className = 'booth-capture-progress'

    this.captureProgressText = document.createElement('div')
    Object.assign(this.captureProgressText.style, {
      fontSize: '0.875rem', fontWeight: '600', color: '#fff',
    })
    this.captureProgress.appendChild(this.captureProgressText)

    this.captureProgressBars = document.createElement('div')
    this.captureProgressBars.className = 'booth-capture-progress-bars'
    this.captureProgress.appendChild(this.captureProgressBars)
  }

  private showCaptureProgress(total: number, completed: number) {
    this.captureProgressText.textContent = `Shot ${completed + 1} of ${total}`
    this.captureProgressBars.innerHTML = ''
    for (let i = 0; i < total; i++) {
      const bar = document.createElement('div')
      Object.assign(bar.style, {
        width: '2rem', height: '4px', borderRadius: '2px',
        background: i < completed ? '#fff' : 'rgba(255,255,255,0.2)',
        transition: 'background 200ms',
      })
      this.captureProgressBars.appendChild(bar)
    }
    this.captureProgress.style.display = 'flex'
  }

  private updateCaptureProgress(completed: number) {
    const bars = this.captureProgressBars.children
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i] as HTMLDivElement
      bar.style.background = i < completed ? '#fff' : 'rgba(255,255,255,0.2)'
    }
  }

  private hideCaptureProgress() {
    this.captureProgress.style.display = 'none'
  }

  private showDslrError(message?: string) {
    // Stop any active capture sequence
    this.isCapturing = false
    this._state = 'idle'

    const msgEl = this.dslrErrorOverlay.querySelector<HTMLParagraphElement>('#dslr-error-msg')
    if (msgEl && message) msgEl.textContent = message

    this.dslrErrorOverlay.style.display = 'flex'
    try {
      boothSocket?.emit('booth-error', { errorId: 'dslr-error', type: 'dslr', message: message || 'Unknown DSLR error' })
    } catch {}
  }

  private hideDslrError() {
    this.dslrErrorOverlay.style.display = 'none'
  }

  private async retryDslrConnection() {
    try { boothSocket?.emit('resolve-booth-error', { errorId: 'dslr-error', action: 'retry' }) } catch {}
    
    const retryBtn = this.dslrErrorOverlay.querySelector<HTMLButtonElement>('#dslr-retry-btn')!
    retryBtn.textContent = 'Detecting...'
    retryBtn.disabled = true

    const result = await window.hellomyphoto?.detectDslr()

    retryBtn.disabled = false
    retryBtn.textContent = 'Retry'

    if (result?.connected) {
      this.hideDslrError()
      const retryOverlay = this.showConnectingOverlay()
      const started = await this.dslrPreview.start()
      retryOverlay.remove()
      if (!started) {
        this.showDslrError('Camera detected but liveview failed to start. Try unplugging and reconnecting.')
      }
    } else {
      const msgEl = this.dslrErrorOverlay.querySelector<HTMLParagraphElement>('#dslr-error-msg')
      if (msgEl) msgEl.textContent = 'Camera still not detected. Check the USB cable and try again.'
    }
  }



  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ignore if PhotoPreview or settings is open
      if (this.photoPreview && this.photoPreview.isVisible()) return
      if (this.settings && this.settings.isVisible) return
      
      if (e.key === ' ' || e.key === 'Enter') {
        if (this.isLive && !this.isCapturing) {
          this.startCapture()
        } else if (!this.isLive && this.landingEl.style.display !== 'none') {
          this.startBtn.click()
        }
      }
      if (e.key === 'Escape' && this.isLive) {
        this.goHome()
      }
      if ((e.key === 'p' || e.key === 'P') && this.isCapturing) {
        this.togglePause()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        this.openSettings()
      }
    })
  }

  private async openSettings(mode: 'exposure' | 'full' = 'full') {
    if (this.settingsData.settingsPasscode && this.isEventConnected()) {
      const entered = await this.promptPasscode()
      if (entered !== this.settingsData.settingsPasscode) {
        return
      }
    }
    this.settings.toggle(mode)
  }

  private promptPasscode(): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      Object.assign(overlay.style, {
        position: 'absolute', inset: '0', zIndex: '100',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      })
      
      const box = document.createElement('div')
      Object.assign(box.style, {
        background: '#1a1a1a', padding: '2rem', borderRadius: '12px',
        border: '1px solid #333', textAlign: 'center', width: '300px'
      })
      
      const title = document.createElement('h3')
      title.textContent = 'Settings Locked'
      title.style.cssText = 'margin: 0 0 1rem; font-size: 1.25rem; font-weight: 600;'
      
      const input = document.createElement('input')
      input.type = 'password'
      input.placeholder = 'Enter Passcode'
      input.style.cssText = 'width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 6px; border: 1px solid #333; background: #0f0f0f; color: #fff; font-size: 1rem; margin-bottom: 1rem; text-align: center; outline: none;'
      
      const errText = document.createElement('div')
      errText.style.cssText = 'color: #ff4444; font-size: 0.875rem; margin-bottom: 1rem; display: none;'
      errText.textContent = 'Incorrect passcode'
      
      const actions = document.createElement('div')
      actions.style.cssText = 'display: flex; gap: 0.5rem; justify-content: center;'
      
      const cancelBtn = document.createElement('button')
      cancelBtn.textContent = 'Cancel'
      cancelBtn.style.cssText = 'padding: 0.75rem 1.5rem; background: transparent; border: 1px solid #333; color: #888; border-radius: 6px; cursor: pointer;'
      
      const submitBtn = document.createElement('button')
      submitBtn.textContent = 'Unlock'
      submitBtn.style.cssText = 'padding: 0.75rem 1.5rem; background: #fff; color: #000; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;'
      
      box.appendChild(title)
      box.appendChild(input)
      box.appendChild(errText)
      actions.appendChild(cancelBtn)
      actions.appendChild(submitBtn)
      box.appendChild(actions)
      overlay.appendChild(box)
      this.container.appendChild(overlay)
      
      input.focus()
      
      const submit = () => {
        const val = input.value.trim()
        if (val === this.settingsData.settingsPasscode) {
          overlay.remove()
          resolve(val)
        } else {
          errText.style.display = 'block'
          input.value = ''
          input.focus()
        }
      }
      
      submitBtn.addEventListener('click', submit)
      cancelBtn.addEventListener('click', () => {
        overlay.remove()
        resolve(null)
      })
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') {
          overlay.remove()
          resolve(null)
        }
      })
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
    } else if (cmd.type === 'reshot') {
      if (this.isLive && !this.isCapturing) this.startCapture()
    } else if (cmd.type === 'resolve-error') {
      const errorId = (cmd as any).errorId
      const action = (cmd as any).action
      if (errorId === 'dslr-error') {
        if (action === 'retry') {
          this.retryDslrConnection()
        } else {
          this.hideDslrError()
        }
      } else if (errorId === 'capture-error') {
        this.captureErrorOverlay.style.display = 'none'
      }
    } else if (cmd.type === 'settings-update') {
      this.settingsData = { ...this.settingsData, ...cmd.settings }
      window.hellomyphoto?.saveSettings(this.settingsData)
      if (cmd.settings?.dslrFocusMode) {
        window.hellomyphoto?.dslrSetFocusMode(cmd.settings.dslrFocusMode)
      }
    }
  }

  // -------------------------------------------------------------------------
  // IPC listeners
  // -------------------------------------------------------------------------

  private setupIpcListeners() {
    window.hellomyphoto?.onServerConfig((config) => {
      this.serverUrl = config.serverUrl
    })
    window.hellomyphoto?.onServerStatus((status) => {
      this.serverOnline = status.online
      this.offlineIndicator.setOnline(status.online)

      // Only force "Server Offline" on the button if we don't even have a QR code yet
      if (status.online || !this.photoPreview.hasShareUrl()) {
        this.photoPreview.setOffline(!status.online)
      }
      
      if (!status.online && status.nextRetryMs !== undefined) {
        if (status.nextRetryMs > 0) {
          const remaining = Math.round(status.nextRetryMs / 1000)
          this.offlineIndicator.setRetryMessage(`Retrying in ${remaining}s`)
          if (this.currentSessionId && !this.currentSessionUploaded) {
            this.photoPreview.updateProgress(-1, `Offline / Retry ${status.retryCount} in ${remaining}s`)
          }
        } else {
          this.offlineIndicator.setRetryMessage('Retrying...')
          if (this.currentSessionId && !this.currentSessionUploaded) {
            this.photoPreview.updateProgress(-1, 'Retrying...')
          }
        }
      }
    })
    window.hellomyphoto?.onQueueUpdate(({ offline }) => {
      this.offlineIndicator.setQueueDepth(offline)
    })
    
    // The individual upload complete event now only handles photo progress, not the main countdown!
    window.hellomyphoto?.onUploadComplete((data: any) => {
      if (data.success) {
        this.offlineIndicator.setOnline(true)
        if (this.currentSessionId === data.sessionId) {
          this.currentSessionUploaded = true
          this.photoPreview.setOffline(false)
          this.photoPreview.updateProgress(100, '', data.elapsed)
        }
      } else {
        this.offlineIndicator.setQueueDepth(1)
        if (this.currentSessionId === data.sessionId && !this.currentSessionUploaded) {
          this.photoPreview.updateProgress(-1, 'Offline / Retrying...')
          // Only lock the button if we failed before getting a share URL
          if (!this.photoPreview.hasShareUrl()) {
            this.photoPreview.setOffline(true)
          }
        }
      }
    })
    window.hellomyphoto?.onUploadProgress((data) => {
      if (this.currentSessionId === data.sessionId) {
        this.photoPreview.updateProgress(data.percent, data.speed, data.elapsed, data.eta)
      }
    })
    window.hellomyphoto?.onShareIdReady((data) => {
      if (this.currentSessionId === data.sessionId) {
        this.photoPreview.updateShareUrl(data.shareUrl)
      }
    })
    window.hellomyphoto?.onUploadQueueUpdate((data) => {
      this.updateUploadStatusBar(data)
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
      this.startBtn.textContent = 'Start'
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
    if (this.isTransitioning) return
    this.isTransitioning = true
    try {
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
      this.captureBtn.style.display = 'block'
      this.captureBtn.style.visibility = 'visible'
      this.statusBar.appendChild(this.captureBtn)
      this.previewBox.style.background = '#000'
      this.statusActions.style.display = 'flex'
      this.pauseBtn.style.display = 'none'

      this.stateDisplay.textContent = 'Start'
      this.stateDisplay.style.opacity = '1'
      this.showCaptureProgress(this.settingsData.photoCount, 0)
      this.captureProgressText.textContent = `Shot 1 of ${this.settingsData.photoCount}`
    } finally {
      this.isTransitioning = false
    }
  }

  private async startDslrPreview() {
    console.log('[BoothApp] startDslrPreview() — swapping to DSLR <img> element')
    // Show overlay BEFORE adding DSLR img to DOM so alt text is never visible
    const connectingOverlay = this.showConnectingOverlay()
    this.setPreviewSource('dslr')

    console.log('[BoothApp] startDslrPreview() — calling dslrPreview.start()...')
    const started = await this.dslrPreview.start()
    this.dslrPreview.element.style.filter = 'none'
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
      background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      color: #fff; font-family: sans-serif; z-index: 20;
    `
    overlay.innerHTML = `
      <div style="width: 28px; height: 28px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; box-sizing: border-box;"></div>
      <div style="margin-top: 1rem; font-size: 1rem; opacity: 0.8;">Connecting camera…</div>
    `
    // Insert into previewBox (needs position: relative)
    this.previewBox.style.position = 'relative'
    this.previewBox.appendChild(overlay)
    return overlay
  }

  private async startWebcamPreview() {
    console.log(`[BoothApp] startWebcamPreview() — deviceId="${this.settingsData.cameraDeviceId || 'default'}"`)
    // Show overlay before making the video element visible
    const connectingOverlay = this.showConnectingOverlay()
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
    connectingOverlay.remove()
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
    if (this.isTransitioning) return
    this.isTransitioning = true
    try {
      this.photoPreview.hide()
      this.previewWindow.style.display = 'flex'
      this.statusBar.style.display = 'flex'
      this.landingEl.style.display = 'flex'

      this.postCaptureEl.style.display = 'none'
      this.postCaptureEl.src = ''
      this.hideCaptureProgress()

      this.isLive = false
      this.isCapturing = false
      this.pendingRetakes = null
      this._state = 'idle'
      this.emitBoothState()
      
      this.isPauseActive = false
      if (this.pauseResume) {
        this.pauseResume()
        this.pauseResume = null
      }
      this.statusActions.style.display = 'none'
      this.captureBtn.style.display = 'none'
      this.stateDisplay.textContent = ''
      this.stateDisplay.style.opacity = '1'
      this.webcamPreview.srcObject = null
      this.previewBox.style.background = '#222'
      this.confirmModal.style.display = 'none'
      this.hideDslrError()
      this.updateStartBtn()
      this.currentSessionId = null
      this.currentSessionUploaded = false
      this.currentPaths = []

      if (this.cameraMode === 'dslr') {
        await this.dslrPreview.stop()
      }
      this.camera.stop()
    } finally {
      this.isTransitioning = false
    }
  }

  private togglePause() {
    if (this.isPauseActive) {
      this.isPauseActive = false
      this.pauseBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
      this.pauseBtn.style.background = 'rgba(255,255,255,0.1)'
      if (this.pauseResume) {
        this.pauseResume()
        this.pauseResume = null
      }
    } else {
      this.isPauseActive = true
      this.pauseBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
      this.pauseBtn.style.background = 'rgba(255,255,255,0.25)'
    }
  }

  private async waitIfPaused(): Promise<void> {
    if (!this.isPauseActive) return
    return new Promise((resolve) => {
      this.pauseResume = resolve
    })
  }

  // -------------------------------------------------------------------------
  // startCapture
  // -------------------------------------------------------------------------

  private async startCapture() {
    if (this.isCapturing || !this.isLive) return
    
    if (this.pendingRetakes && this.pendingRetakes.length > 0) {
      const indices = this.pendingRetakes
      this.pendingRetakes = null
      this.captureBtn.textContent = 'Start'
      await this.executeRetakePhotos(indices)
      return
    }

    this.isCapturing = true
    this._state = 'capturing'
    this.emitBoothState()
    this.captureBtn.style.visibility = 'hidden'
    this.pauseBtn.style.display = 'flex'
    this.stateDisplay.textContent = ''

    const photoCount = this.settingsData.photoCount
    const paths: string[] = []
    this.currentSessionId = `session_${Date.now()}`
    this.currentSessionUploaded = false
    this.currentPaths = paths
    const audioCtx = new AudioContext()

    for (let i = 0; i < photoCount; i++) {
      this.captureProgressText.textContent = `Shot ${i + 1} of ${photoCount}`

      let prepDone = false
      let prepPromise: Promise<void> | null = null
      const tCountdownStart = Date.now()

      const offset = this.settingsData.shutterOffsetDelay || 0
      const onPrep = offset > 0 ? () => {
        if (!prepDone) {
          prepDone = true
          console.log(`[BoothApp] ⏱ Shutter offset: starting prep ${offset}s before 0 at t+${Date.now() - tCountdownStart} ms`)
          prepPromise = this.prepDslrCapture()
          prepPromise.catch((err) => console.error('[BoothApp] prepDslrCapture failed:', err))
        }
      } : undefined

      await this.countdown.play(this.settingsData.countdown, audioCtx, onPrep, () => this.waitIfPaused(), offset)
      if (!this.isCapturing) { audioCtx.close(); return }
      const tCountdownEnd = Date.now()
      console.log(`[BoothApp] ⏱ COUNTDOWN = 0 at t+${tCountdownEnd - tCountdownStart} ms`)

      let result: { success: boolean; path?: string; error?: string }

      if (this.cameraMode === 'dslr') {
        // If offset is 0, prep wasn't fired during countdown — do it now
        if (offset === 0) {
          console.log(`[BoothApp] ⏱ Starting prepDslrCapture at t+${Date.now() - tCountdownStart} ms`)
          prepPromise = this.prepDslrCapture()
          prepDone = true
        }
        // Await prep completion before firing shutter
        if (prepPromise !== null) {
          await prepPromise.catch(() => {})
          prepPromise = null
          console.log(`[BoothApp] ⏱ prepDslrCapture DONE at t+${Date.now() - tCountdownStart} ms`)
        }
        console.log(`[BoothApp] ⏱ Calling captureDslrShot() at t+${Date.now() - tCountdownStart} ms`)
        result = await this.captureDslrShot(prepDone)
        console.log(`[BoothApp] ⏱ captureDslrShot() returned at t+${Date.now() - tCountdownStart} ms`)
      } else {
        result = await this.camera.captureStill()
      }

      if (result?.success && result.path) {
        paths.push(result.path)
        // Webcam capture is instant so sound+flash happens here;
        // DSLR captureDslrShot already played it optimistically before download.
        if (this.cameraMode !== 'dslr') {
          this.audio.playShutter()
          await this.flashWhite()
        }
        this.stateDisplay.textContent = ''

        if (this.settingsData.postCapturePreview > 0) {
          await this.showPostCapture(result.path, this.settingsData.postCapturePreview)
        }
        await this.waitIfPaused()
        if (!this.isCapturing) { audioCtx.close(); return }

        this.updateCaptureProgress(i + 1)

        // Resume DSLR liveview between shots.
        // Show a connecting overlay so the broken-image / placeholder is never
        // visible while waiting for the first frame after a capture cycle.
        if (this.cameraMode === 'dslr' && i < photoCount - 1) {
          if (!this.dslrPreview.isActive()) {
            const resumeOverlay = this.showConnectingOverlay()
            await this.dslrPreview.start()
            this.dslrPreview.element.style.filter = 'none'
            // Hide the frozen taken photo now that live preview is back
            this.postCaptureEl.style.display = 'none'
            this.postCaptureEl.src = ''
            resumeOverlay.remove()
          }
        }

        if (i < photoCount - 1 && this.settingsData.captureInterval > 0) {
          await this.delay(this.settingsData.captureInterval * 1000)
          await this.waitIfPaused()
          if (!this.isCapturing) { audioCtx.close(); return }
        }
      } else {
        const errMsg = result?.error || 'Unknown error'
        console.error(`[BoothApp] Capture failed: ${errMsg}`)

        // Reset camera state on failure:
        // - For DSLR: ensure mirror is down (gphoto2.ts resetCameraAfterFailure already
        //   fires asynchronously, but we also explicitly stop liveview here to make
        //   sure the renderer state is consistent)
        if (this.cameraMode === 'dslr') {
          // Stop any lingering liveview stream (no-op if already stopped)
          this.dslrPreview.stop().catch(() => {})
          // Restart liveview after a short pause so the user can see the camera
          // preview again while deciding to retry
          setTimeout(async () => {
            if (this.isLive) {
              await this.dslrPreview.start()
              this.dslrPreview.element.style.filter = 'none'
            }
          }, 1500)
        }

        this.hideCaptureProgress()
        this.pauseBtn.style.display = 'none'
        
        // Show popout box instead of inline state display
        this.stateDisplay.innerHTML = ''
        const msgEl = this.captureErrorOverlay.querySelector<HTMLParagraphElement>('#capture-error-msg')
        if (msgEl) msgEl.innerHTML = this.formatCaptureError(errMsg)
        this.captureErrorOverlay.style.display = 'flex'
        try {
          boothSocket?.emit('booth-error', { errorId: 'capture-error', type: 'capture', message: errMsg })
        } catch {}
        
        this.isCapturing = false
        this.captureBtn.style.visibility = 'visible'
        audioCtx.close()
        return
      }
    }

    audioCtx.close()

    if (paths.length > 0) {
      await this.uploadAndPreview()
    } else {
      this.hideCaptureProgress()
      this.pauseBtn.style.display = 'none'
      this.isCapturing = false
      this._state = 'live'
      this.emitBoothState()
    }
  }

  private pendingRetakes: number[] | null = null

  private async retakePhotos(indices: number[]) {
    if (this.isCapturing || indices.length === 0) return
    this.pendingRetakes = indices
    
    this.postCaptureEl.style.display = 'none'
    this.postCaptureEl.src = ''
    
    this.stateDisplay.textContent = ''
    this.captureBtn.style.visibility = 'hidden'
    
    this.previewWindow.style.display = 'flex'
    this.statusBar.style.display = 'flex'
    
    this.isLive = false

    // Start camera preview (this shows the loading spinner on top of previewWindow)
    if (this.cameraMode === 'dslr') {
      await this.startDslrPreview()
    } else {
      await this.startWebcamPreview()
    }

    this.isLive = true
    this._state = 'live'
    this.emitBoothState()
    
    this.captureBtn.style.display = 'block'
    this.captureBtn.style.visibility = 'visible'
    this.captureBtn.textContent = 'Retake'
    this.stateDisplay.textContent = 'Tap to Retake'
    this.stateDisplay.style.opacity = '1'
  }

  private async executeRetakePhotos(indices: number[]) {
    if (this.isCapturing || indices.length === 0) return
    this.isCapturing = true
    this._state = 'capturing'
    this.emitBoothState()
    this.captureBtn.style.visibility = 'hidden'
    this.pauseBtn.style.display = 'flex'
    this.stateDisplay.textContent = ''

    const audioCtx = new AudioContext()
    const totalRetakes = indices.length

    for (let i = 0; i < totalRetakes; i++) {
      const targetIndex = indices[i]
      this.showCaptureProgress(i + 1, totalRetakes)
      this.captureProgressText.textContent = `Retake Photo ${targetIndex + 1}`

      let prepDone = false
      let prepPromise: Promise<void> | null = null
      const offset = this.settingsData.shutterOffsetDelay || 0
      const onPrep = offset > 0 ? () => {
        if (!prepDone) {
          prepDone = true
          prepPromise = this.prepDslrCapture()
          prepPromise.catch(() => {})
        }
      } : undefined

      await this.countdown.play(this.settingsData.countdown, audioCtx, onPrep, () => this.waitIfPaused(), offset)
      if (!this.isCapturing) { audioCtx.close(); return }

      let result: { success: boolean; path?: string; error?: string }

      if (this.cameraMode === 'dslr') {
        if (offset === 0) {
          prepPromise = this.prepDslrCapture()
          prepDone = true
        }
        if (prepPromise !== null) await prepPromise.catch(() => {})
        result = await this.captureDslrShot(prepDone)
      } else {
        result = await this.camera.captureStill()
      }

      this.updateCaptureProgress(i + 1)

      if (!result.success) {
        if (this.cameraMode === 'dslr' && (result.error?.includes('not found') || result.error?.includes('disconnect'))) {
          this.showDslrError()
          this.isCapturing = false
          audioCtx.close()
          return
        } else {
          const errMsg = result.error || 'Unknown error'
          if (this.cameraMode === 'dslr') {
            this.dslrPreview.stop().catch(() => {})
            setTimeout(async () => {
              if (this.isLive) await this.dslrPreview.start()
            }, 1500)
          }
          this.hideCaptureProgress()
          this.pauseBtn.style.display = 'none'
          this.stateDisplay.innerHTML = ''
          const msgEl = this.captureErrorOverlay.querySelector<HTMLParagraphElement>('#capture-error-msg')
          if (msgEl) msgEl.innerHTML = this.formatCaptureError(errMsg)
          this.captureErrorOverlay.style.display = 'flex'
          try { boothSocket?.emit('booth-error', { errorId: 'capture-error', type: 'capture', message: errMsg }) } catch {}
          this.isCapturing = false
          audioCtx.close()
          return
        }
      }

      if (result.path) {
        this.currentPaths[targetIndex] = result.path
        
        if (this.cameraMode !== 'dslr') {
          this.audio.playShutter()
          this.flashWhite().catch(() => {})
        }

        if (this.settingsData.postCapturePreview > 0) {
          await this.showPostCapture(result.path, this.settingsData.postCapturePreview)
        }
      }

      if (i < totalRetakes - 1) {
        if (this.cameraMode === 'dslr') {
          if (!this.dslrPreview.isActive()) {
            const resumeOverlay = this.showConnectingOverlay()
            await this.dslrPreview.start()
            this.dslrPreview.element.style.filter = 'none'
            this.postCaptureEl.style.display = 'none'
            this.postCaptureEl.src = ''
            resumeOverlay.remove()
          }
        }
        
        await new Promise((r) => setTimeout(r, this.settingsData.captureInterval * 1000))
        if (!this.isCapturing) { audioCtx.close(); return }
      }
    }

    audioCtx.close()
    await this.uploadAndPreview()
  }

  private async uploadAndPreview() {
    const paths = this.currentPaths
    if (!this.currentSessionId) {
      this.currentSessionId = `session_${Date.now()}`
      this.currentSessionUploaded = false
    }
    const sessionId = this.currentSessionId
    
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

    // Stop liveview before switching to preview screen.
    if (this.cameraMode === 'dslr') {
      await this.dslrPreview.stop()
    }

    this.hideCaptureProgress()
    this.pauseBtn.style.display = 'none'
    this.isCapturing = false
    this._state = 'preview'
    this.emitBoothState()
    this.photoPreview.show(paths, null, this.settingsData.serverUrl, this.settingsData.otp, sessionId)
    this.photoPreview.updateProgress(0, 'Preparing...')
    this.previewWindow.style.display = 'none'
    this.statusBar.style.display = 'none'
    this.camera.stop()
    this.webcamPreview.srcObject = null

    // Background upload
    const uploadResult = await window.hellomyphoto?.uploadPhotos({
      sessionId,
      imagePaths: filePaths,
      imageBuffers: blobBuffers.length > 0 ? blobBuffers : undefined,
      photoCount: paths.length,
    })

    if (uploadResult?.queued) {
      this.offlineIndicator.setQueueDepth(1)
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
  private async prepDslrCapture(): Promise<void> {
    console.log('[BoothApp] prepDslrCapture() — stopping liveview (keep last frame frozen) + camera liveview early')
    this.dslrPreview.element.style.filter = 'blur(8px)'
    this.dslrPreview.element.style.transition = 'filter 0.3s ease'
    await this.dslrPreview.stop(true)
    await window.hellomyphoto?.prepDslrCapture()
  }

  private async captureDslrShot(prepDone = false): Promise<{ success: boolean; path?: string; error?: string }> {
    this.showProcessingOverlay()

    if (!prepDone) {
      console.log('[BoothApp] captureDslrShot() — stopping liveview renderer before capture')
      await this.dslrPreview.stop(true)
    }

    console.log('[BoothApp] captureDslrShot() — calling capture-photo IPC...')
    const capturePromise = window.hellomyphoto?.capture({ liveviewStopped: prepDone })

    // If the IPC bridge is unavailable, bail immediately — no false flash/sound.
    if (!capturePromise) {
      console.error('[BoothApp] captureDslrShot() — IPC bridge unavailable')
      this.hideProcessingOverlay()
      return { success: false, error: 'IPC bridge unavailable' }
    }

    // Play shutter sound + flash 1 s after the processing overlay appears
    // (gives the camera time to begin the capture before we cue the user)
    await this.delay(1000)
    this.audio.playShutter()
    this.flashWhite().catch(() => {})

    const result = await capturePromise
    console.log('[BoothApp] captureDslrShot() — capture result:', JSON.stringify(result))

    this.hideProcessingOverlay()

    if (!result) return { success: false, error: 'Capture returned no result' }

    return result
  }

  private processingOverlay: HTMLDivElement | null = null

  private showProcessingOverlay() {
    if (!this.processingOverlay) {
      this.processingOverlay = document.createElement('div')
      Object.assign(this.processingOverlay.style, {
        position: 'absolute', inset: '0', zIndex: '55',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      })
      this.processingOverlay.innerHTML = `
        <div style="width: 28px; height: 28px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; box-sizing: border-box;"></div>
        <div style="margin-top: 1rem; font-size: 1rem; opacity: 0.8;">Processing…</div>
      `
    }
    // Ensure it's parented to previewBox (handles stale refs from hot-reloads)
    if (this.processingOverlay.parentElement !== this.previewBox) {
      this.previewBox.appendChild(this.processingOverlay)
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
    this.previewWindow.style.display = 'flex'
    this.statusBar.style.display = 'flex'
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
    await new Promise(r => requestAnimationFrame(r))
    this.flashOverlay.style.transition = 'opacity 200ms ease-out'
    this.flashOverlay.style.opacity = '0'
    await this.delay(250)
  }

  private async showPostCapture(path: string, duration: number) {
    this.postCaptureEl.src = path
    this.postCaptureEl.style.display = 'block'

    if (this.cameraMode === 'dslr') {
      await this.delay(duration * 1000)
      // Keep the taken photo frozen until the live preview stream resumes
      // (the between-shots code hides postCaptureEl when the first frame arrives)
      return
    }

    this.webcamPreview.style.opacity = '0'
    await this.delay(duration * 1000)
    this.webcamPreview.style.opacity = '1'
    this.postCaptureEl.style.display = 'none'
    this.postCaptureEl.src = ''
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private updateUploadStatusBar(data: { pending: number; failed: number; jobs?: any[] }) {
    if (!this.uploadStatusBar) return
    const total = data.pending + data.failed
    if (total === 0) {
      this.uploadStatusBar.style.display = 'none'
      return
    }
    this.uploadStatusBar.style.display = 'flex'
    const parts: string[] = []
    if (data.pending > 0) parts.push(`↑ ${data.pending} uploading`)
    if (data.failed > 0) parts.push(`⚠ ${data.failed} failed — open Settings to retry`)
    this.uploadStatusBar.textContent = parts.join('  ·  ')
  }
}