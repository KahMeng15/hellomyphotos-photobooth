export class OfflineIndicator {
  private el: HTMLDivElement
  private queueEl: HTMLSpanElement
  private dotEl: HTMLSpanElement
  private textEl: HTMLSpanElement

  constructor(container: HTMLElement) {
    this.el = document.createElement('div')
    this.el.style.cssText = `
      position: absolute; top: 1.5rem; left: 50%; transform: translateX(-50%); z-index: 1000;
      display: none; align-items: center; gap: 0.5rem;
      padding: 0.375rem 0.875rem; border-radius: 9999px;
      background: rgba(220, 38, 38, 0.1); border: 1px solid rgba(220, 38, 38, 0.3);
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      pointer-events: none; transition: opacity 300ms ease;
    `
    
    // Animated pulsing dot
    const style = document.createElement('style')
    style.textContent = `
      @keyframes pulse-red {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `
    document.head.appendChild(style)

    this.dotEl = document.createElement('span')
    this.dotEl.style.cssText = `
      width: 8px; height: 8px; border-radius: 50%;
      background: #ef4444; box-shadow: 0 0 8px #ef4444;
      animation: pulse-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    `
    this.el.appendChild(this.dotEl)

    this.textEl = document.createElement('span')
    this.textEl.textContent = 'Server Disconnected'
    this.textEl.style.cssText = 'color: #fca5a5; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.025em; text-transform: uppercase;'
    this.el.appendChild(this.textEl)

    this.queueEl = document.createElement('span')
    this.queueEl.style.cssText = `
      color: #fff; font-size: 0.75rem; font-weight: 700;
      background: #ef4444; padding: 0.125rem 0.375rem;
      border-radius: 4px; margin-left: 0.25rem;
    `
    this.queueEl.style.display = 'none'
    this.el.appendChild(this.queueEl)
    
    container.appendChild(this.el)
  }

  private isOnline: boolean = true
  private depth: number = 0
  private retryMsg: string | null = null

  private updateState() {
    if (this.isOnline) {
      this.el.style.display = 'none'
    } else {
      this.el.style.display = 'flex'
      this.el.style.background = 'rgba(220, 38, 38, 0.1)'
      this.el.style.borderColor = 'rgba(220, 38, 38, 0.3)'
      this.dotEl.style.background = '#ef4444'
      this.dotEl.style.boxShadow = '0 0 8px #ef4444'
      this.textEl.textContent = 'Server Disconnected'
      this.textEl.style.color = '#fca5a5'
      this.queueEl.style.background = '#ef4444'

      if (this.retryMsg) {
        this.queueEl.textContent = this.retryMsg
        this.queueEl.style.display = 'block'
      } else if (this.depth > 0) {
        this.queueEl.textContent = `${this.depth} queued`
        this.queueEl.style.display = 'block'
      } else {
        this.queueEl.style.display = 'none'
      }
    }
  }

  setOnline(online: boolean) {
    this.isOnline = online
    if (online) this.retryMsg = null
    this.updateState()
  }

  setQueueDepth(depth: number) {
    this.depth = depth
    this.updateState()
  }

  setRetryMessage(msg: string | null) {
    this.retryMsg = msg
    this.updateState()
  }
}
