export class OfflineIndicator {
  private el: HTMLDivElement
  private queueEl: HTMLSpanElement

  constructor(container: HTMLElement) {
    this.el = document.createElement('div')
    this.el.style.cssText = `
      display: none; align-items: center; gap: 0.5rem;
      padding: 0.375rem 1rem; border-radius: 100px;
      background: rgba(244,67,54,0.2); border: 1px solid #f44336;
      font-size: 0.8125rem; pointer-events: none;
    `
    this.el.innerHTML = '<span>●</span> Offline Mode'
    container.appendChild(this.el)

    this.queueEl = document.createElement('span')
    this.queueEl.style.cssText = 'color: #ff9800; font-size: 0.75rem;'
    this.el.appendChild(this.queueEl)
  }

  setOnline(online: boolean) {
    this.el.style.display = online ? 'none' : 'flex'
  }

  setQueueDepth(depth: number) {
    this.queueEl.textContent = depth > 0 ? `${depth} queued` : ''
  }
}
