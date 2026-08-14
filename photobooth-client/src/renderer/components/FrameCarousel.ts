export class FrameCarousel {
  private container: HTMLElement
  private carouselEl: HTMLDivElement
  private frames: { id: string; name: string; url: string }[] = []
  private selectedId: string | null = null
  public activeFrames: any[] = []
  private onChange: (frameId: string | null) => void

  constructor(container: HTMLElement, onChange: (frameId: string | null) => void) {
    this.container = container
    this.onChange = onChange

    this.carouselEl = document.createElement('div')
    this.carouselEl.style.cssText = `
      display: flex; gap: 0.5rem; overflow-x: auto; padding: 0.5rem;
      scrollbar-width: none; pointer-events: all;
    `
    container.appendChild(this.carouselEl)
  }

  async loadFrames(serverUrl: string, otp: string) {
    try {
      const response = await fetch(`${serverUrl}/api/booth/frames`, {
        headers: {
          'Authorization': `Bearer ${otp}`
        }
      })
      const data = await response.json()
      this.frames = data.frames.map((f: any) => ({
        id: f.id,
        name: f.name,
        url: `${serverUrl}${f.imageUrl}?otp=${otp}`,
      }))
      this.activeFrames = data.frames
      this.render()
    } catch {
      this.frames = []
      this.activeFrames = []
    }
  }

  private render() {
    this.carouselEl.innerHTML = ''

    const noneBtn = document.createElement('button')
    noneBtn.textContent = 'No Frame'
    noneBtn.style.cssText = `
      padding: 0.5rem 1rem; border-radius: 100px; border: 2px solid #444;
      background: ${this.selectedId === null ? '#fff' : 'transparent'};
      color: ${this.selectedId === null ? '#000' : '#fff'};
      font-size: 0.8125rem; cursor: pointer; white-space: nowrap;
      flex-shrink: 0;
    `
    noneBtn.addEventListener('click', () => {
      this.selectedId = null
      this.onChange(null)
      this.render()
    })
    this.carouselEl.appendChild(noneBtn)

    for (const frame of this.frames) {
      const btn = document.createElement('button')
      btn.textContent = frame.name
      btn.style.cssText = `
        padding: 0.5rem 1rem; border-radius: 100px; border: 2px solid #444;
        background: ${this.selectedId === frame.id ? '#fff' : 'transparent'};
        color: ${this.selectedId === frame.id ? '#000' : '#fff'};
        font-size: 0.8125rem; cursor: pointer; white-space: nowrap;
        flex-shrink: 0;
      `
      btn.addEventListener('click', () => {
        this.selectedId = frame.id
        this.onChange(frame.id)
        this.render()
      })
      this.carouselEl.appendChild(btn)
    }
  }
}
