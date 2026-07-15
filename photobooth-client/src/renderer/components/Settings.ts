interface BoothSettings {
  photoCount: number
  countdown: number
  captureInterval: number
  serverUrl: string
  cameraDeviceId?: string
  audioDeviceId?: string
}

interface MediaDeviceInfo {
  deviceId: string
  label: string
}

export class Settings {
  private overlay: HTMLDivElement
  private visible = false
  private onChange: (settings: BoothSettings) => void
  private settings: BoothSettings = { photoCount: 4, countdown: 5, captureInterval: 1, serverUrl: 'http://localhost:3000' }
  private serverInput!: HTMLInputElement
  private cameraSelect!: HTMLSelectElement
  private audioSelect!: HTMLSelectElement
  private statusText!: HTMLSpanElement

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
      min-width: 420px; max-width: 500px; max-height: 90vh; overflow-y: auto;
    `

    const title = document.createElement('h2')
    title.textContent = 'Booth Settings'
    title.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin: 0 0 1.5rem;'
    panel.appendChild(title)

    const serverSection = this.createServerSection()
    panel.appendChild(serverSection)

    const devicesSection = this.createDevicesSection()
    panel.appendChild(devicesSection)

    const captureTitle = document.createElement('h3')
    captureTitle.textContent = 'Capture'
    captureTitle.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0 0 1rem; text-transform: uppercase; letter-spacing: 0.05em;'
    panel.appendChild(captureTitle)

    panel.appendChild(this.createField('Photos per session', 1, 4, (v) => { this.settings.photoCount = v; this.save() }))
    panel.appendChild(this.createField('Countdown (seconds)', 3, 10, (v) => { this.settings.countdown = v; this.save() }))
    panel.appendChild(this.createField('Interval (seconds)', 0, 5, (v) => { this.settings.captureInterval = v; this.save() }))

    const closeBtn = document.createElement('button')
    closeBtn.textContent = 'Close'
    closeBtn.style.cssText = `
      width: 100%; padding: 0.75rem; margin-top: 1.5rem;
      background: #fff; color: #000; border: none; border-radius: 8px;
      font-size: 0.9375rem; font-weight: 600; cursor: pointer;
    `
    closeBtn.addEventListener('click', () => this.hide())
    panel.appendChild(closeBtn)

    this.overlay.appendChild(panel)
    container.appendChild(this.overlay)
  }

  private createServerSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = 'margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #2a2a2a;'

    const label = document.createElement('label')
    label.textContent = 'Server URL'
    label.style.cssText = 'display: block; font-size: 0.8125rem; color: #888; margin-bottom: 0.375rem;'
    section.appendChild(label)

    const row = document.createElement('div')
    row.style.cssText = 'display: flex; gap: 0.5rem;'

    this.serverInput = document.createElement('input')
    this.serverInput.type = 'text'
    this.serverInput.value = this.settings.serverUrl
    this.serverInput.style.cssText = `
      flex: 1; padding: 0.625rem; border: 1px solid #333; border-radius: 6px;
      background: #111; color: #fff; font-size: 0.875rem; outline: none;
    `
    row.appendChild(this.serverInput)

    const testBtn = document.createElement('button')
    testBtn.textContent = 'Test'
    testBtn.style.cssText = `
      padding: 0.625rem 1rem; border: 1px solid #555; border-radius: 6px;
      background: #222; color: #fff; font-size: 0.8125rem; cursor: pointer;
      white-space: nowrap;
    `
    row.appendChild(testBtn)

    this.statusText = document.createElement('span')
    this.statusText.style.cssText = 'font-size: 0.75rem; margin-top: 0.375rem; display: block;'

    testBtn.addEventListener('click', async () => {
      const url = this.serverInput.value.replace(/\/+$/, '')
      this.serverInput.value = url
      testBtn.disabled = true
      testBtn.textContent = 'Testing...'
      testBtn.style.opacity = '0.5'
      this.statusText.textContent = ''
      try {
        const res = await fetch(`${url}/api/health`)
        if (res.ok) {
          this.statusText.style.color = '#4caf50'
          this.statusText.textContent = 'Connected'
        } else {
          this.statusText.style.color = '#f44336'
          this.statusText.textContent = `Server returned ${res.status}`
        }
      } catch {
        this.statusText.style.color = '#f44336'
        this.statusText.textContent = 'Could not reach server'
      }
      testBtn.disabled = false
      testBtn.textContent = 'Test'
      testBtn.style.opacity = '1'
    })

    section.appendChild(row)
    section.appendChild(this.statusText)

    this.serverInput.addEventListener('change', () => {
      this.settings.serverUrl = this.serverInput.value.replace(/\/+$/, '')
      this.save()
    })

    return section
  }

  private createDevicesSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = 'margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #2a2a2a;'

    const title = document.createElement('h3')
    title.textContent = 'Devices'
    title.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0 0 1rem; text-transform: uppercase; letter-spacing: 0.05em;'
    section.appendChild(title)

    this.cameraSelect = document.createElement('select')
    this.cameraSelect.style.cssText = this.selectStyle()
    const cameraLabel = this.createSelectLabel('Camera', this.cameraSelect)
    section.appendChild(cameraLabel)
    section.appendChild(this.cameraSelect)

    this.audioSelect = document.createElement('select')
    this.audioSelect.style.cssText = this.selectStyle()
    const audioLabel = this.createSelectLabel('Audio Output', this.audioSelect)
    section.appendChild(audioLabel)
    section.appendChild(this.audioSelect)

    this.cameraSelect.addEventListener('change', () => {
      this.settings.cameraDeviceId = this.cameraSelect.value || undefined
      this.save()
    })

    this.audioSelect.addEventListener('change', () => {
      this.settings.audioDeviceId = this.audioSelect.value || undefined
      this.save()
    })

    return section
  }

  private selectStyle(): string {
    return `
      width: 100%; padding: 0.5rem; margin-bottom: 0.75rem;
      border: 1px solid #333; border-radius: 6px;
      background: #111; color: #fff; font-size: 0.8125rem; outline: none;
    `
  }

  private createSelectLabel(text: string, select: HTMLSelectElement): HTMLLabelElement {
    const label = document.createElement('label')
    label.textContent = text
    label.style.cssText = 'display: block; font-size: 0.75rem; color: #888; margin-bottom: 0.25rem;'
    return label
  }

  private async populateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()

      this.cameraSelect.innerHTML = ''
      const defaultCam = document.createElement('option')
      defaultCam.value = ''
      defaultCam.textContent = 'Default Camera'
      this.cameraSelect.appendChild(defaultCam)
      for (const d of devices.filter((d) => d.kind === 'videoinput')) {
        const opt = document.createElement('option')
        opt.value = d.deviceId
        opt.textContent = d.label || `Camera ${this.cameraSelect.options.length}`
        if (d.deviceId === this.settings.cameraDeviceId) opt.selected = true
        this.cameraSelect.appendChild(opt)
      }

      this.audioSelect.innerHTML = ''
      const defaultAudio = document.createElement('option')
      defaultAudio.value = ''
      defaultAudio.textContent = 'Default Audio Output'
      this.audioSelect.appendChild(defaultAudio)
      for (const d of devices.filter((d) => d.kind === 'audiooutput')) {
        const opt = document.createElement('option')
        opt.value = d.deviceId
        opt.textContent = d.label || `Audio ${this.audioSelect.options.length}`
        if (d.deviceId === this.settings.audioDeviceId) opt.selected = true
        this.audioSelect.appendChild(opt)
      }
    } catch {
      this.cameraSelect.innerHTML = '<option value="">Camera list unavailable</option>'
      this.audioSelect.innerHTML = '<option value="">Audio list unavailable</option>'
    }
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
        this.settings = { ...this.settings, ...s }
      })
      this.populateDevices()
    }
  }

  hide() {
    this.visible = false
    this.overlay.style.display = 'none'
  }
}