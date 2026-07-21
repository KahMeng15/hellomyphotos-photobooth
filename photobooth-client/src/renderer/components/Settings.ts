import { io, Socket } from 'socket.io-client'

export let boothSocket: Socket | null = null

export function connectBoothSocket(serverUrl: string, otp: string) {
  if (boothSocket?.connected) {
    boothSocket.disconnect()
  }
  boothSocket = io(serverUrl, {
    auth: { otp },
    transports: ['websocket', 'polling'],
  })
  boothSocket.on('connect', () => {
    console.log('[booth] WebSocket connected')
    document.dispatchEvent(new CustomEvent('booth-socket-connect'))
  })
  boothSocket.on('disconnect', () => {
    console.log('[booth] WebSocket disconnected')
    document.dispatchEvent(new CustomEvent('booth-socket-disconnect'))
  })
  boothSocket.on('connect_error', (err) => {
    console.error('[booth] WebSocket error:', err.message)
    document.dispatchEvent(new CustomEvent('booth-socket-error'))
  })
  boothSocket.on('booth-command', (cmd: any) => {
    console.log('[booth] Received command via WebSocket:', cmd)
    document.dispatchEvent(new CustomEvent('booth-ws-command', { detail: cmd }))
  })
}

export function disconnectBoothSocket() {
  if (boothSocket) {
    boothSocket.disconnect()
    boothSocket = null
    document.dispatchEvent(new CustomEvent('booth-socket-disconnect'))
  }
}

interface BoothSettings {
  photoCount: number
  countdown: number
  captureInterval: number
  postCapturePreview: number
  serverUrl: string
  cameraDeviceId?: string
  audioDeviceId?: string
  otp?: string
}

interface MediaDeviceInfo {
  deviceId: string
  label: string
}

export class Settings {
  private overlay: HTMLDivElement
  private visible = false
  private dirty = false
  private onChange: (settings: BoothSettings) => void
  private settings: BoothSettings = { photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, serverUrl: 'http://localhost:3000' }
  private serverInput!: HTMLInputElement
  private cameraSelect!: HTMLSelectElement
  private audioSelect!: HTMLSelectElement
  private statusText!: HTMLSpanElement
  private numInputs: HTMLInputElement[] = []
  private connectionStatus!: HTMLDivElement
  private connectedEvent: { name: string; date: string; description: string } | null = null

  constructor(container: HTMLElement, onChange: (settings: BoothSettings) => void) {
    this.onChange = onChange

    // Listen for socket status changes to update the UI when visible
    const onSocketEvent = () => {
      if (this.visible) this.refreshConnectionStatus()
      if (boothSocket?.connected && !this.connectedEvent) {
        window.hellomyphoto?.getSettings().then((s) => {
          if (s.otp && !this.connectedEvent) {
            this.settings = { ...this.settings, ...s }
            this.fetchConnectedEvent(s.otp)
          }
        })
      }
    }
    document.addEventListener('booth-socket-connect', onSocketEvent)
    document.addEventListener('booth-socket-disconnect', onSocketEvent)
    document.addEventListener('booth-socket-error', onSocketEvent)

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

    const otpSection = this.createOtpSection()
    panel.appendChild(otpSection)

    const devicesSection = this.createDevicesSection()
    panel.appendChild(devicesSection)

    const captureTitle = document.createElement('h3')
    captureTitle.textContent = 'Capture'
    captureTitle.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0 0 1rem; text-transform: uppercase; letter-spacing: 0.05em;'
    panel.appendChild(captureTitle)

    const fields = [
      this.createField('Photos per session', 1, 4, this.settings.photoCount, (v) => { this.settings.photoCount = v; this.markDirty() }, false),
      this.createField('Countdown (seconds)', 3, 10, this.settings.countdown, (v) => { this.settings.countdown = v; this.markDirty() }, true),
      this.createField('Interval (seconds)', 0, 5, this.settings.captureInterval, (v) => { this.settings.captureInterval = v; this.markDirty() }, false),
      this.createField('Preview (seconds)', 1, 5, this.settings.postCapturePreview, (v) => { this.settings.postCapturePreview = v; this.markDirty() }, true),
    ]
    const settingsBox = document.createElement('div')
    settingsBox.style.cssText = 'border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden; margin-bottom: 1rem;'
    for (const f of fields) settingsBox.appendChild(f)
    fields[fields.length - 1].style.borderBottom = 'none'
    panel.appendChild(settingsBox)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 1.5rem;'

    const saveBtn = document.createElement('button')
    saveBtn.textContent = 'Save'
    saveBtn.style.cssText = `
      flex: 1; padding: 0.75rem;
      background: #fff; color: #000; border: none; border-radius: 8px;
      font-size: 0.9375rem; font-weight: 600; cursor: pointer;
    `
    saveBtn.addEventListener('click', () => {
      this.save()
      this.dirty = false
      this.hide()
    })
    btnRow.appendChild(saveBtn)

    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.style.cssText = `
      flex: 1; padding: 0.75rem;
      background: transparent; color: #888; border: 1px solid #333; border-radius: 8px;
      font-size: 0.9375rem; cursor: pointer;
    `
    cancelBtn.addEventListener('click', () => {
      if (this.dirty) {
        if (!confirm('You have unsaved changes. Discard them?')) return
      }
      this.hide()
    })
    btnRow.appendChild(cancelBtn)
    panel.appendChild(btnRow)

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && this.visible) {
        if (this.dirty) {
          if (!confirm('You have unsaved changes. Discard them?')) return
        }
        this.hide()
      }
    })

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
      this.markDirty()
    })

    return section
  }

  private createOtpSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = 'margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #2a2a2a;'

    const label = document.createElement('label')
    label.textContent = 'Event OTP'
    label.style.cssText = 'display: block; font-size: 0.8125rem; color: #888; margin-bottom: 0.375rem;'
    section.appendChild(label)

    const desc = document.createElement('p')
    desc.textContent = '6-digit code from the operator dashboard.'
    desc.style.cssText = 'font-size: 0.75rem; color: #666; margin: 0 0 0.5rem;'
    section.appendChild(desc)

    const row = document.createElement('div')
    row.style.cssText = 'display: flex; gap: 0.5rem; align-items: stretch;'

    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 6
    input.placeholder = '000000'
    input.value = this.settings.otp || ''
    input.style.cssText = `
      flex: 1; font-size: 1.5rem; font-family: monospace; letter-spacing: 0.5rem;
      padding: 0.625rem; background: #111; border: 1px solid #333;
      border-radius: 8px; color: #fff; text-align: center;
      outline: none;
    `
    input.addEventListener('input', () => {
      this.settings.otp = input.value.slice(0, 6)
      this.markDirty()
    })
    row.appendChild(input)

    const testBtn = document.createElement('button')
    testBtn.textContent = 'Test'
    testBtn.style.cssText = `
      padding: 0.625rem 1rem; border: 1px solid #555; border-radius: 8px;
      background: #222; color: #fff; font-size: 0.8125rem; cursor: pointer;
      white-space: nowrap;
    `
    row.appendChild(testBtn)
    section.appendChild(row)

    const result = document.createElement('div')
    result.style.cssText = 'margin-top: 0.5rem;'
    section.appendChild(result)

    this.connectionStatus = document.createElement('div')
    this.connectionStatus.style.cssText = 'margin-top: 0.375rem; font-size: 0.75rem; display: flex; align-items: center; gap: 0.375rem; width: 100%;'
    section.appendChild(this.connectionStatus)

    testBtn.addEventListener('click', async () => {
      const otpVal = input.value.trim()
      if (otpVal.length !== 6) {
        result.innerHTML = '<div style="color:#f44336;font-size:0.75rem;">Enter a 6-digit OTP</div>'
        return
      }
      testBtn.disabled = true
      testBtn.textContent = 'Validating...'
      testBtn.style.opacity = '0.5'
      result.innerHTML = ''
      const url = this.settings.serverUrl.replace(/\/+$/, '')
      try {
        const res = await fetch(`${url}/api/booth/validate-otp?otp=${otpVal}`)
        const data = await res.json()
        if (data.valid) {
          this.connectedEvent = { name: data.event.name, date: data.event.date, description: data.event.description || '' }
          connectBoothSocket(url, otpVal)
          this.refreshConnectionStatus()
        } else {
          result.innerHTML = `<div style="background:#1a1a1a;border:1px solid #3a1a1a;border-radius:8px;padding:0.75rem;color:#f44336;font-size:0.8125rem;">${data.error || 'Invalid OTP'}</div>`
        }
      } catch {
        result.innerHTML = '<div style="background:#1a1a1a;border:1px solid #3a1a1a;border-radius:8px;padding:0.75rem;color:#f44336;font-size:0.8125rem;">Could not reach server</div>'
      }
      testBtn.disabled = false
      testBtn.textContent = 'Test'
      testBtn.style.opacity = '1'
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
      this.markDirty()
    })

    this.audioSelect.addEventListener('change', () => {
      this.settings.audioDeviceId = this.audioSelect.value || undefined
      this.markDirty()
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
    currentValue: number,
    onChange: (value: number) => void,
    isEven: boolean
  ): HTMLDivElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; background: ${isEven ? '#191919' : '#111'}; border-bottom: 1px solid #252525;`

    const lbl = document.createElement('label')
    lbl.textContent = label
    lbl.style.cssText = 'font-size: 0.8125rem; color: #ccc; font-weight: 500;'
    field.appendChild(lbl)

    const input = document.createElement('input')
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.value = String(currentValue)
    input.style.cssText = `
      width: 60px; padding: 0.375rem 0.5rem; border: 1px solid #333; border-radius: 6px;
      background: #0f0f0f; color: #fff; font-size: 0.875rem; font-weight: 600;
      outline: none; text-align: center; box-sizing: border-box;
    `

    this.numInputs.push(input)

    input.addEventListener('focus', () => { input.style.borderColor = '#666'; input.style.boxShadow = '0 0 0 1px #555' })
    input.addEventListener('blur', () => { input.style.borderColor = '#333'; input.style.boxShadow = 'none' })

    input.addEventListener('change', () => {
      let val = parseInt(input.value, 10)
      if (isNaN(val)) val = min
      val = Math.max(min, Math.min(max, val))
      input.value = String(val)
      onChange(val)
    })

    field.appendChild(input)
    return field
  }

  private refreshFields() {
    const values = [this.settings.photoCount, this.settings.countdown, this.settings.captureInterval, this.settings.postCapturePreview]
    for (let i = 0; i < this.numInputs.length; i++) {
      this.numInputs[i].value = String(values[i])
    }
  }

  private async fetchConnectedEvent(otp: string) {
    const url = this.settings.serverUrl.replace(/\/+$/, '')
    try {
      const res = await fetch(`${url}/api/booth/validate-otp?otp=${otp}`)
      const data = await res.json()
      if (data.valid) {
        this.connectedEvent = { name: data.event.name, date: data.event.date, description: data.event.description || '' }
        if (this.visible) this.refreshConnectionStatus()
      }
    } catch {}
  }

  private disconnect() {
    disconnectBoothSocket()
    this.settings.otp = ''
    window.hellomyphoto?.saveSettings(this.settings)
    this.connectedEvent = null
    this.refreshConnectionStatus()
    // Also clear the OTP input value
    const otpInput = this.overlay.querySelector<HTMLInputElement>('input[maxlength="6"]')
    if (otpInput) otpInput.value = ''
  }

  private refreshConnectionStatus() {
    if (!this.connectionStatus) return
    if (boothSocket?.connected) {
      if (this.connectedEvent) {
        this.connectionStatus.innerHTML = `
          <div style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:0.75rem;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:0.375rem;margin-bottom:0.5rem;">
              <span style="color:#4caf50;font-size:0.8125rem;">●</span>
              <span style="color:#4caf50;font-size:0.8125rem;font-weight:500;">Connected</span>
            </div>
            <div style="color:#fff;font-weight:600;font-size:0.9375rem;margin-bottom:0.25rem;">${this.connectedEvent.name}</div>
            <div style="color:#888;font-size:0.75rem;margin-bottom:0.125rem;">${this.connectedEvent.date}</div>
            <div style="color:#666;font-size:0.75rem;margin-bottom:0.5rem;">${this.connectedEvent.description}</div>
            <button id="disconnect-otp-btn" style="padding:0.375rem 0.75rem;background:#3a1a1a;color:#f44336;border:1px solid #5a2a2a;border-radius:6px;font-size:0.75rem;cursor:pointer;">Disconnect</button>
          </div>
        `
      } else {
        this.connectionStatus.innerHTML = `
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span style="color:#4caf50;font-size:0.8125rem;">●</span>
            <span style="color:#888;font-size:0.8125rem;">Connected</span>
            <button id="disconnect-otp-btn" style="margin-left:auto;padding:0.25rem 0.625rem;background:#3a1a1a;color:#f44336;border:1px solid #5a2a2a;border-radius:6px;font-size:0.6875rem;cursor:pointer;">Disconnect</button>
          </div>
        `
      }
      const btn = this.overlay.querySelector('#disconnect-otp-btn')
      if (btn) btn.addEventListener('click', () => this.disconnect())
    } else if (boothSocket) {
      this.connectionStatus.innerHTML = '<span style="color:#f44336;">●</span> Disconnected'
    } else {
      this.connectionStatus.innerHTML = '<span style="color:#666;">○</span> Not connected'
    }
  }

  private markDirty() {
    this.dirty = true
  }

  private save() {
    this.settings.serverUrl = this.serverInput.value.replace(/\/+$/, '')
    this.onChange(this.settings)
    window.hellomyphoto?.saveSettings(this.settings)
    if (this.settings.otp) {
      connectBoothSocket(this.settings.serverUrl, this.settings.otp)
      if (!this.connectedEvent) this.fetchConnectedEvent(this.settings.otp)
    } else if (boothSocket) {
      this.connectedEvent = null
      disconnectBoothSocket()
    }
    this.refreshConnectionStatus()
  }

  toggle() {
    this.visible = !this.visible
    this.overlay.style.display = this.visible ? 'flex' : 'none'
    if (this.visible) {
      this.dirty = false
      window.hellomyphoto?.getSettings().then((s) => {
        this.settings = { ...this.settings, ...s }
        this.refreshFields()
        this.refreshConnectionStatus()
        if (this.settings.otp && boothSocket?.connected && !this.connectedEvent) {
          this.fetchConnectedEvent(this.settings.otp)
        }
      })
      this.populateDevices()
    }
  }

  hide() {
    this.visible = false
    this.overlay.style.display = 'none'
  }
}