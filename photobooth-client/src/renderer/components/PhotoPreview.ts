
import QRCode from 'qrcode'

export class PhotoPreview {
  private container: HTMLElement
  private overlay: HTMLDivElement
  private qrOverlay: HTMLDivElement
  private onRetake: (indices: number[]) => void
  private onConfirm: () => void

  private currentPaths: string[] = []
  private lastServerUrl?: string
  private lastOtp?: string
  private lastSessionId?: string
  private shareUrl?: string
  private shareBtn?: HTMLButtonElement
  private isOffline: boolean = false
  private keydownHandler: (e: KeyboardEvent) => void
  private keydownHandlers: {
    toggle: (idx: number) => void,
    confirm: () => void,
    cancel: () => void
  } | null = null

  private progressContainer?: HTMLDivElement
  private progressBar?: HTMLDivElement
  private progressFill?: HTMLDivElement
  private progressText?: HTMLDivElement

  constructor(container: HTMLElement, onRetake: (indices: number[]) => void, onConfirm: () => void) {
    this.container = container
    this.onRetake = onRetake
    this.onConfirm = onConfirm

    this.overlay = document.createElement('div')
    this.overlay.className = 'ui-photo-preview-overlay'
    this.container.appendChild(this.overlay)

    this.qrOverlay = document.createElement('div')
    this.qrOverlay.className = 'ui-qr-overlay'
    this.container.appendChild(this.qrOverlay)

    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.isVisible()) return

      if (this.qrOverlay.style.display !== 'none') {
        if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') {
          e.preventDefault()
          this.qrOverlay.style.display = 'none'
        }
        return
      }

      if (this.overlay.dataset.mode === 'retake' && this.keydownHandlers) {
        const num = parseInt(e.key, 10)
        if (!isNaN(num) && num >= 1 && num <= this.currentPaths.length) {
          this.keydownHandlers.toggle(num - 1)
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          this.keydownHandlers.confirm()
        } else if (e.key === 'Escape') {
          this.keydownHandlers.cancel()
        }
      } else if (this.overlay.dataset.mode === 'preview') {
        const buttons = this.overlay.querySelectorAll('button')
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          if (buttons.length > 1) (buttons[1] as HTMLButtonElement).click()
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          this.showRetakeSelection()
        } else if (e.key === 'q' || e.key === 'Q') {
          e.preventDefault()
          if (buttons.length > 2) (buttons[2] as HTMLButtonElement).click()
        }
      }
    }
    window.addEventListener('keydown', this.keydownHandler)
  }

  async show(paths: string[], _frameConfig?: any, serverUrl?: string, otp?: string, sessionId?: string) {
    this.currentPaths = paths
    this.lastServerUrl = serverUrl
    this.lastOtp = otp
    this.lastSessionId = sessionId
    this.shareUrl = sessionId && serverUrl ? `${serverUrl}/share/${sessionId}` : undefined
    this.setOffline(false)
    this.overlay.dataset.mode = 'preview'
    this.overlay.innerHTML = ''
    this.overlay.style.display = 'flex'

    const title = document.createElement('h2')
    title.textContent = 'Your Photos'
    title.className = 'ui-photo-preview-title'
    this.overlay.appendChild(title)

    const grid = document.createElement('div')
    grid.className = 'ui-photo-preview-grid'
    for (const p of paths) {
      const img = document.createElement('img')
      img.className = paths.length === 1 ? 'ui-photo-preview-img ui-photo-preview-img-full' : 'ui-photo-preview-img ui-photo-preview-img-half'
      img.src = p.startsWith('blob:') || p.startsWith('http') ? p : `file://${p}`
      grid.appendChild(img)
    }
    this.overlay.appendChild(grid)

    const actions = document.createElement('div')
    actions.className = 'ui-photo-preview-actions'

    const retakeBtn = document.createElement('button')
    retakeBtn.textContent = 'Retake'
    retakeBtn.className = 'ui-photo-btn-retake'
    retakeBtn.addEventListener('click', () => {
      this.showRetakeSelection()
    })
    actions.appendChild(retakeBtn)

    const confirmBtn = document.createElement('button')
    confirmBtn.textContent = 'Looks Great!'
    confirmBtn.className = 'ui-photo-btn-confirm'
    confirmBtn.addEventListener('click', () => {
      this.hide()
      this.onConfirm()
    })
    actions.appendChild(confirmBtn)

    if (sessionId && serverUrl) {
      this.shareBtn = document.createElement('button')
      this.shareBtn.textContent = 'Share QR'
      this.shareBtn.className = 'ui-photo-btn-share'
      this.shareBtn.addEventListener('click', () => {
        if (this.isOffline) {
          this.showQR('') // Empty URL signals offline message
        } else {
          this.showQR(this.shareUrl || `${serverUrl}/share/${sessionId}`)
        }
      })
      actions.appendChild(this.shareBtn)
    }

    this.overlay.appendChild(actions)

    this.progressContainer = document.createElement('div')
    this.progressContainer.className = 'ui-photo-progress-container'
    
    this.progressBar = document.createElement('div')
    this.progressBar.className = 'ui-photo-progress-bar'
    
    this.progressFill = document.createElement('div')
    this.progressFill.className = 'ui-photo-progress-fill'
    this.progressBar.appendChild(this.progressFill)
    
    this.progressText = document.createElement('div')
    this.progressText.className = 'ui-photo-progress-text'
    
    this.progressContainer.appendChild(this.progressBar)
    this.progressContainer.appendChild(this.progressText)
    this.overlay.appendChild(this.progressContainer)
  }

  updateShareUrl(url: string) {
    this.shareUrl = url
  }

  hasShareUrl(): boolean {
    return !!this.shareUrl
  }

  setOffline(offline: boolean) {
    this.isOffline = offline
    if (this.shareBtn) {
      if (offline) {
        this.shareBtn.textContent = 'Server Offline'
        this.shareBtn.style.background = 'var(--color-error)'
      } else {
        this.shareBtn.textContent = 'Share QR'
        this.shareBtn.style.background = 'var(--color-info)'
        // If the overlay was showing the offline message, hide it so they can click the button again
        if (this.qrOverlay && this.qrOverlay.style.display !== 'none') {
          this.qrOverlay.style.display = 'none'
        }
      }
    }
  }

  updateProgress(percent: number, speed: string, elapsed?: number, eta?: number) {
    if (!this.progressContainer) return
    this.progressContainer.style.display = 'flex'
    
    if (this.progressFill && percent >= 0) {
      this.progressFill.style.width = `${percent}%`
    }

    if (this.progressText) {
      if (percent >= 100) {
        const timeStr = elapsed != null ? ` in ${elapsed}s` : ''
        this.progressText.textContent = `Upload complete${timeStr}!`
      } else if (percent < 0) {
        // Just show the speed text for offline / retry messages without prepending "Uploading... %"
        this.progressText.textContent = speed
      } else {
        const elapsedStr = elapsed != null ? ` · ${elapsed}s elapsed` : ''
        const etaStr = eta ? ` · ETA ${eta}s` : ''
        this.progressText.textContent = `Uploading… ${percent}% at ${speed}${elapsedStr}${etaStr}`
      }
    }
  }

  private showRetakeSelection() {
    this.overlay.dataset.mode = 'retake'
    this.overlay.innerHTML = ''
    
    const title = document.createElement('h2')
    title.textContent = 'Which photo do you want to retake?'
    title.className = 'ui-photo-preview-title'
    this.overlay.appendChild(title)
    
    const subtitle = document.createElement('p')
    subtitle.textContent = 'Click on photos to replace them.'
    subtitle.className = 'ui-photo-retake-subtitle'
    this.overlay.appendChild(subtitle)

    const grid = document.createElement('div')
    grid.className = 'ui-photo-retake-grid'
    grid.style.gridTemplateColumns = `repeat(${Math.min(this.currentPaths.length, 2)}, 1fr)`

    const selectedIndices = new Set<number>()
    const photoWrappers: HTMLDivElement[] = []

    const updateConfirmBtn = () => {
      confirmBtn.disabled = selectedIndices.size === 0
      confirmBtn.style.opacity = selectedIndices.size === 0 ? '0.5' : '1'
      confirmBtn.textContent = selectedIndices.size > 0 ? `Retake ${selectedIndices.size} Photo${selectedIndices.size > 1 ? 's' : ''}` : 'Select Photos'
    }

    this.currentPaths.forEach((p, idx) => {
      const wrapper = document.createElement('div')
      photoWrappers.push(wrapper)
      wrapper.className = 'ui-photo-retake-wrapper'
      
      const img = document.createElement('img')
      img.className = 'ui-photo-retake-img'
      img.src = p.startsWith('blob:') || p.startsWith('http') ? p : `file://${p}`

      wrapper.onmouseover = () => {
        if (!selectedIndices.has(idx)) img.style.borderColor = 'var(--color-text-muted)'
      }
      wrapper.onmouseout = () => {
        if (!selectedIndices.has(idx)) img.style.borderColor = 'transparent'
      }
      wrapper.onclick = () => {
        if (selectedIndices.has(idx)) {
          selectedIndices.delete(idx)
          img.style.borderColor = 'transparent'
          checkMark.style.display = 'none'
        } else {
          selectedIndices.add(idx)
          img.style.borderColor = 'var(--color-info)'
          checkMark.style.display = 'flex'
        }
        updateConfirmBtn()
      }
      
      const checkMark = document.createElement('div')
      checkMark.innerHTML = '✓'
      checkMark.className = 'ui-photo-retake-check'
      
      const numBadge = document.createElement('div')
      numBadge.textContent = String(idx + 1)
      numBadge.className = 'ui-photo-retake-badge'
      
      const innerWrapper = document.createElement('div')
      innerWrapper.className = 'ui-photo-retake-inner'
      
      innerWrapper.appendChild(img)
      innerWrapper.appendChild(numBadge)
      innerWrapper.appendChild(checkMark)
      wrapper.appendChild(innerWrapper)
      grid.appendChild(wrapper)
    })

    this.overlay.appendChild(grid)
    
    const actions = document.createElement('div')
    actions.className = 'ui-photo-retake-actions'

    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.className = 'ui-photo-btn-cancel'
    cancelBtn.addEventListener('click', () => {
      this.keydownHandlers = null
      this.show(this.currentPaths, null, this.lastServerUrl, this.lastOtp, this.lastSessionId)
    })

    const confirmBtn = document.createElement('button')
    confirmBtn.disabled = true
    confirmBtn.className = 'ui-photo-btn-confirm'
    confirmBtn.style.opacity = '0.5'
    confirmBtn.addEventListener('click', () => {
      if (selectedIndices.size > 0) {
        this.keydownHandlers = null
        this.hide()
        this.onRetake(Array.from(selectedIndices).sort((a, b) => a - b))
      }
    })
    
    updateConfirmBtn()
    
    actions.appendChild(cancelBtn)
    actions.appendChild(confirmBtn)
    this.overlay.appendChild(actions)

    this.keydownHandlers = {
      toggle: (idx: number) => {
        const wrapper = photoWrappers[idx]
        if (wrapper) wrapper.click()
      },
      confirm: () => {
        if (!confirmBtn.disabled) confirmBtn.click()
      },
      cancel: () => {
        cancelBtn.click()
      }
    }
  }

  private async showQR(url: string) {
    this.qrOverlay.innerHTML = ''
    this.qrOverlay.style.display = 'flex'

    const box = document.createElement('div')
    box.className = 'ui-qr-box'
    
    if (url === '') {
      // Show offline message
      const title = document.createElement('h3')
      title.textContent = 'Server Offline'
      title.className = 'ui-qr-title-offline'
      box.appendChild(title)

      const msg = document.createElement('p')
      msg.textContent = 'Your photos have been securely saved to the offline queue. They will automatically upload when the internet connection is restored. Please ask the event host for the gallery link later.'
      msg.className = 'ui-qr-msg-offline'
      box.appendChild(msg)
    } else {
      // Show QR code
      const title = document.createElement('h3')
      title.textContent = 'Scan to get photos'
      title.className = 'ui-qr-title'
      box.appendChild(title)

      const img = document.createElement('img')
      img.className = 'ui-qr-img'
      
      try {
        img.src = await QRCode.toDataURL(url, { margin: 1, width: 400 })
      } catch (err) {
        console.error('QR generation failed', err)
      }
      box.appendChild(img)

      const linkText = document.createElement('p')
      linkText.textContent = url
      linkText.className = 'ui-qr-link'
      box.appendChild(linkText)
    }

    const closeBtn = document.createElement('button')
    closeBtn.textContent = 'Close'
    closeBtn.className = 'ui-qr-close-btn'
    closeBtn.addEventListener('click', () => {
      this.qrOverlay.style.display = 'none'
    })
    box.appendChild(closeBtn)
    
    this.qrOverlay.appendChild(box)
  }

  hide() {
    this.overlay.style.display = 'none'
    this.qrOverlay.style.display = 'none'
  }

  isVisible(): boolean {
    return this.overlay.style.display !== 'none'
  }

  destroy() {
    window.removeEventListener('keydown', this.keydownHandler)
    this.overlay.remove()
    this.qrOverlay.remove()
  }
}
