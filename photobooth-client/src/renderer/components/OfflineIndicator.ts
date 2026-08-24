export class OfflineIndicator {
  private el: HTMLDivElement
  private queueEl: HTMLSpanElement
  private dotEl: HTMLSpanElement
  private textEl: HTMLSpanElement

  constructor(container: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'ui-offline-indicator'

    this.dotEl = document.createElement('span')
    this.dotEl.className = 'ui-offline-dot'
    this.el.appendChild(this.dotEl)

    this.textEl = document.createElement('span')
    this.textEl.textContent = 'Server Disconnected'
    this.textEl.className = 'ui-offline-text'
    this.el.appendChild(this.textEl)

    this.queueEl = document.createElement('span')
    this.queueEl.className = 'ui-offline-queue'
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
      this.textEl.textContent = 'Server Disconnected'
      
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
