interface BoothSettings {
  photoCount: number
  countdown: number
  captureInterval: number
}

export class Settings {
  private overlay: HTMLDivElement
  private visible = false
  private onChange: (settings: BoothSettings) => void
  private settings: BoothSettings = { photoCount: 4, countdown: 5, captureInterval: 1 }

  constructor(container: HTMLElement, onChange: (settings: BoothSettings) => void) {
    this.onChange = onChange

    this.overlay = document.createElement('div')
    this.overlay.style.cssText = `
      position: absolute; inset: 0; background: rgba(0,0,0,0.85);
      display: none; align-items: center; justify-content: center;
      z-index: 30; pointer-events: all;
    `

    const panel = document.createElement('div')
    panel.style.cssText = `
      background: #1a1a1a; border-radius: 16px; padding: 2rem;
      min-width: 360px; max-width: 480px;
    `

    const title = document.createElement('h2')
    title.textContent = 'Booth Settings'
    title.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin: 0 0 1.5rem;'
    panel.appendChild(title)

    panel.appendChild(this.createField('Photos per session', 1, 4, (v) => { this.settings.photoCount = v; this.save() }))
    panel.appendChild(this.createField('Countdown (seconds)', 3, 10, (v) => { this.settings.countdown = v; this.save() }))
    panel.appendChild(this.createField('Interval (seconds)', 0, 5, (v) => { this.settings.captureInterval = v; this.save() }))

    const closeBtn = document.createElement('button')
    closeBtn.textContent = 'Close'
    closeBtn.style.cssText = `
      width: 100%; padding: 0.75rem; margin-top: 1rem;
      background: #fff; color: #000; border: none; border-radius: 8px;
      font-size: 0.9375rem; font-weight: 600; cursor: pointer;
    `
    closeBtn.addEventListener('click', () => this.hide())
    panel.appendChild(closeBtn)

    this.overlay.appendChild(panel)
    container.appendChild(this.overlay)
  }

  private createField(
    label: string,
    min: number,
    max: number,
    onChange: (value: number) => void
  ): HTMLDivElement {
    const field = document.createElement('div')
    field.style.cssText = 'margin-bottom: 1rem;'

    const lbl = document.createElement('label')
    lbl.textContent = label
    lbl.style.cssText = 'display: block; font-size: 0.8125rem; color: #888; margin-bottom: 0.375rem;'
    field.appendChild(lbl)

    const row = document.createElement('div')
    row.style.cssText = 'display: flex; align-items: center; gap: 0.75rem;'

    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.value = String(this.settings.photoCount)
    input.style.cssText = 'flex: 1; accent-color: #fff;'
    row.appendChild(input)

    const value = document.createElement('span')
    value.textContent = input.value
    value.style.cssText = 'font-size: 1rem; font-weight: 600; min-width: 2rem; text-align: center;'

    input.addEventListener('input', () => {
      value.textContent = input.value
      onChange(parseInt(input.value, 10))
    })

    row.appendChild(value)
    field.appendChild(row)
    return field
  }

  private save() {
    this.onChange(this.settings)
    window.hellomyphoto?.saveSettings(this.settings)
  }

  toggle() {
    this.visible = !this.visible
    this.overlay.style.display = this.visible ? 'flex' : 'none'
    if (this.visible) {
      window.hellomyphoto?.getSettings().then((s) => {
        this.settings = s
      })
    }
  }

  hide() {
    this.visible = false
    this.overlay.style.display = 'none'
  }
}
