import { renderFrame, FrameConfig } from '../utils/frameRenderer.js'
import QRCode from 'qrcode'

export class PhotoPreview {
  private container: HTMLElement
  private overlay: HTMLDivElement
  private qrOverlay: HTMLDivElement
  private onRetake: (indices: number[]) => void
  private onConfirm: () => void

  private currentPaths: string[] = []
  private lastFrameConfig?: FrameConfig | null
  private lastServerUrl?: string
  private lastOtp?: string
  private lastSessionId?: string
  private keydownHandler: (e: KeyboardEvent) => void

  constructor(container: HTMLElement, onRetake: (indices: number[]) => void, onConfirm: () => void) {
    this.container = container
    this.onRetake = onRetake
    this.onConfirm = onConfirm

    this.overlay = document.createElement('div')
    this.overlay.style.cssText = `
      position: absolute; inset: 0; background: #0f0f0f;
      display: none; flex-direction: column; align-items: center;
      justify-content: center; z-index: 50; padding: 2rem;
    `
    this.container.appendChild(this.overlay)

    this.qrOverlay = document.createElement('div')
    this.qrOverlay.style.cssText = `
      position: absolute; inset: 0; background: rgba(0,0,0,0.85);
      display: none; flex-direction: column; align-items: center;
      justify-content: center; z-index: 60;
    `
    this.container.appendChild(this.qrOverlay)

    this.keydownHandler = (e: KeyboardEvent) => {
      // If we are showing the selection screen (retake mode)
      if (this.overlay.dataset.mode === 'retake') {
        const num = parseInt(e.key, 10)
        if (!isNaN(num) && num >= 1 && num <= this.currentPaths.length) {
          this.hide()
          this.onRetake([num - 1])
        }
      }
    }
    window.addEventListener('keydown', this.keydownHandler)
  }

  async show(paths: string[], frameConfig?: FrameConfig | null, serverUrl?: string, otp?: string, sessionId?: string) {
    this.currentPaths = paths
    this.lastFrameConfig = frameConfig
    this.lastServerUrl = serverUrl
    this.lastOtp = otp
    this.lastSessionId = sessionId
    this.overlay.dataset.mode = 'preview'
    this.overlay.innerHTML = ''
    this.overlay.style.display = 'flex'

    const title = document.createElement('h2')
    title.textContent = 'Your Photos'
    title.style.cssText = 'font-size: 2rem; font-weight: 700; margin-bottom: 2rem;'
    this.overlay.appendChild(title)

    let canvasOrGrid: HTMLElement

    if (frameConfig && serverUrl && otp) {
      const canvas = document.createElement('canvas')
      canvas.style.cssText = 'max-width: 100%; max-height: 70vh; border-radius: 8px; object-fit: contain; margin-bottom: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.5);'
      this.overlay.appendChild(canvas)
      canvasOrGrid = canvas
      
      const frameImageUrl = `${serverUrl}${frameConfig.imageUrl}?otp=${otp}`
      const photoUrls = paths.map(p => p.startsWith('blob:') || p.startsWith('http') ? p : `file://${p}`)
      
      try {
        await renderFrame(frameConfig, frameImageUrl, photoUrls, canvas)
      } catch (err) {
        console.error('Failed to render frame preview', err)
      }
    } else {
      const grid = document.createElement('div')
      grid.style.cssText = `
        display: grid; grid-template-columns: repeat(${Math.min(paths.length, 2)}, 1fr);
        gap: 1rem; max-width: 800px; width: 100%; margin-bottom: 2rem;
      `
      for (const p of paths) {
        const img = document.createElement('img')
        img.style.cssText = 'width: 100%; border-radius: 8px; object-fit: contain; max-height: 80vh;'
        img.src = p.startsWith('blob:') || p.startsWith('http') ? p : `file://${p}`
        grid.appendChild(img)
      }
      this.overlay.appendChild(grid)
      canvasOrGrid = grid
    }

    const actions = document.createElement('div')
    actions.style.cssText = 'display: flex; gap: 1rem;'

    const retakeBtn = document.createElement('button')
    retakeBtn.textContent = 'Retake'
    retakeBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
      background: transparent; color: #fff; border: 1px solid #555; border-radius: 100px;
      cursor: pointer;
    `
    retakeBtn.addEventListener('click', () => {
      this.showRetakeSelection()
    })
    actions.appendChild(retakeBtn)

    const confirmBtn = document.createElement('button')
    confirmBtn.textContent = 'Looks Great!'
    confirmBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
      background: #fff; color: #000; border: none; border-radius: 100px;
      cursor: pointer;
    `
    confirmBtn.addEventListener('click', () => {
      this.hide()
      this.onConfirm()
    })
    actions.appendChild(confirmBtn)

    if (sessionId && serverUrl) {
      const shareBtn = document.createElement('button')
      shareBtn.textContent = 'Share QR'
      shareBtn.style.cssText = `
        padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
        background: #2196F3; color: #fff; border: none; border-radius: 100px;
        cursor: pointer;
      `
      shareBtn.addEventListener('click', () => {
        this.showQR(`${serverUrl}/share/${sessionId}`)
      })
      actions.appendChild(shareBtn)
    }

    this.overlay.appendChild(actions)
  }

  private showRetakeSelection() {
    this.overlay.dataset.mode = 'retake'
    this.overlay.innerHTML = ''
    
    const title = document.createElement('h2')
    title.textContent = 'Which photo do you want to retake?'
    title.style.cssText = 'font-size: 2rem; font-weight: 700; margin-bottom: 2rem;'
    this.overlay.appendChild(title)
    
    const subtitle = document.createElement('p')
    subtitle.textContent = 'Click on photos to replace them.'
    subtitle.style.cssText = 'color: #888; font-size: 1.125rem; margin-top: -1rem; margin-bottom: 2rem;'
    this.overlay.appendChild(subtitle)

    const grid = document.createElement('div')
    grid.style.cssText = `
      display: grid; grid-template-columns: repeat(${Math.min(this.currentPaths.length, 2)}, 1fr);
      gap: 1.5rem; max-width: 900px; width: 100%; margin-bottom: 2rem;
    `

    const selectedIndices = new Set<number>()

    const updateConfirmBtn = () => {
      confirmBtn.disabled = selectedIndices.size === 0
      confirmBtn.style.opacity = selectedIndices.size === 0 ? '0.5' : '1'
      confirmBtn.textContent = selectedIndices.size > 0 ? `Retake ${selectedIndices.size} Photo${selectedIndices.size > 1 ? 's' : ''}` : 'Select Photos'
    }

    this.currentPaths.forEach((p, idx) => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position: relative; cursor: pointer; border-radius: 8px; overflow: hidden; border: 4px solid transparent; transition: border-color 0.2s;'
      wrapper.onmouseover = () => {
        if (!selectedIndices.has(idx)) wrapper.style.borderColor = '#555'
      }
      wrapper.onmouseout = () => {
        if (!selectedIndices.has(idx)) wrapper.style.borderColor = 'transparent'
      }
      wrapper.onclick = () => {
        if (selectedIndices.has(idx)) {
          selectedIndices.delete(idx)
          wrapper.style.borderColor = 'transparent'
          checkMark.style.display = 'none'
        } else {
          selectedIndices.add(idx)
          wrapper.style.borderColor = '#2196F3'
          checkMark.style.display = 'flex'
        }
        updateConfirmBtn()
      }
      
      const img = document.createElement('img')
      img.style.cssText = 'width: 100%; display: block; object-fit: contain; max-height: 50vh;'
      img.src = p.startsWith('blob:') || p.startsWith('http') ? p : `file://${p}`
      
      const checkMark = document.createElement('div')
      checkMark.innerHTML = '✓'
      checkMark.style.cssText = 'position: absolute; top: 1rem; right: 1rem; background: #2196F3; color: #fff; width: 40px; height: 40px; display: none; align-items: center; justify-content: center; border-radius: 50%; font-weight: bold; font-size: 1.5rem; z-index: 2;'
      
      const numBadge = document.createElement('div')
      numBadge.textContent = String(idx + 1)
      numBadge.style.cssText = 'position: absolute; top: 1rem; left: 1rem; background: rgba(0,0,0,0.7); color: #fff; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: bold; font-size: 1.25rem;'
      
      wrapper.appendChild(img)
      wrapper.appendChild(numBadge)
      wrapper.appendChild(checkMark)
      grid.appendChild(wrapper)
    })

    this.overlay.appendChild(grid)
    
    const actions = document.createElement('div')
    actions.style.cssText = 'display: flex; gap: 1.5rem; justify-content: center; margin-top: 2rem;'

    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
      background: transparent; color: #ccc; border: 1px solid #555; border-radius: 100px;
      cursor: pointer;
    `
    cancelBtn.addEventListener('click', () => {
      this.show(this.currentPaths, this.lastFrameConfig, this.lastServerUrl, this.lastOtp, this.lastSessionId)
    })

    const confirmBtn = document.createElement('button')
    confirmBtn.disabled = true
    confirmBtn.style.cssText = `
      padding: 1rem 3rem; font-size: 1.25rem; font-weight: 600;
      background: #2196F3; color: #fff; border: none; border-radius: 100px;
      cursor: pointer; opacity: 0.5; transition: opacity 0.2s;
    `
    confirmBtn.addEventListener('click', () => {
      if (selectedIndices.size > 0) {
        this.hide()
        this.onRetake(Array.from(selectedIndices).sort((a, b) => a - b))
      }
    })
    
    updateConfirmBtn()
    
    actions.appendChild(cancelBtn)
    actions.appendChild(confirmBtn)
    this.overlay.appendChild(actions)
  }

  private async showQR(url: string) {
    this.qrOverlay.innerHTML = ''
    this.qrOverlay.style.display = 'flex'

    const box = document.createElement('div')
    box.style.cssText = 'background: #fff; padding: 2rem; border-radius: 16px; text-align: center; max-width: 90%;'
    
    const title = document.createElement('h3')
    title.textContent = 'Scan to get photos'
    title.style.cssText = 'color: #000; margin: 0 0 1.5rem; font-size: 1.5rem;'
    box.appendChild(title)

    const img = document.createElement('img')
    img.style.width = '400px'
    img.style.height = '400px'
    img.style.marginBottom = '1.5rem'
    
    try {
      img.src = await QRCode.toDataURL(url, { margin: 1, width: 400 })
    } catch (err) {
      console.error('QR generation failed', err)
    }
    box.appendChild(img)

    const linkText = document.createElement('p')
    linkText.textContent = url
    linkText.style.cssText = 'color: #333; font-size: 1.125rem; margin-bottom: 1.5rem; word-break: break-all;'
    box.appendChild(linkText)

    const closeBtn = document.createElement('button')
    closeBtn.textContent = 'Close'
    closeBtn.style.cssText = 'padding: 0.75rem 3rem; background: #000; color: #fff; border: none; border-radius: 100px; cursor: pointer; font-size: 1.125rem; font-weight: 600;'
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

  destroy() {
    window.removeEventListener('keydown', this.keydownHandler)
    this.overlay.remove()
    this.qrOverlay.remove()
  }
}
