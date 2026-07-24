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
  /** 'webcam' (default) | 'dslr' — controls which capture path BoothApp uses */
  cameraMode?: 'webcam' | 'dslr'
  dslrCameraPort?: string | null
  dslrIso?: string
  dslrShutterSpeed?: string
  dslrAperture?: string
  dslrFocusMode?: string
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
  private settings: BoothSettings = { photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, serverUrl: 'http://localhost:3000', cameraMode: 'webcam', dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto' }
  private serverInput!: HTMLInputElement
  private cameraSelect!: HTMLSelectElement
  private audioSelect!: HTMLSelectElement
  private statusText!: HTMLSpanElement
  private numInputs: HTMLInputElement[] = []
  private strInputs: HTMLInputElement[] = []
  private connectionStatus!: HTMLDivElement
  private connectedEvent: { name: string; date: string; description: string } | null = null
  // Camera source
  private webcamModeBtn!: HTMLButtonElement
  private dslrModeBtn!: HTMLButtonElement
  private dslrStatusEl!: HTMLDivElement
  private dslrSelectContainer!: HTMLDivElement
  private dslrSelect!: HTMLSelectElement
  private webcamDeviceRow!: HTMLDivElement
  private dslrScanBtn!: HTMLButtonElement
  private dslrKillPtpBtn!: HTMLButtonElement
  private dslrExposureSection!: HTMLDivElement

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
      position: absolute; right: 20px; bottom: 20px; background: #0f0f0f;
      display: none; flex-direction: column; border-radius: 12px;
      z-index: 30; pointer-events: all; width: 350px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #333;
    `

    const panel = document.createElement('div')
    panel.style.cssText = `
      padding: 1.5rem;
      width: 100%; box-sizing: border-box;
      overflow-y: auto; max-height: 80vh;
    `

    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;'

    const backBtn = document.createElement('button')
    backBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    backBtn.style.cssText = `
      background: none; border: none; color: #888; cursor: pointer;
      padding: 0.25rem; display: flex; align-items: center; border-radius: 6px;
    `
    backBtn.addEventListener('click', () => {
      if (this.dirty) {
        if (!confirm('You have unsaved changes. Discard them?')) return
      }
      this.hide()
    })
    header.appendChild(backBtn)

    const title = document.createElement('h2')
    title.textContent = 'Settings'
    title.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin: 0; flex: 1;'
    header.appendChild(title)

    const saveBtn = document.createElement('button')
    saveBtn.textContent = 'Save'
    saveBtn.style.cssText = `
      padding: 0.5rem 1.25rem;
      background: #fff; color: #000; border: none; border-radius: 8px;
      font-size: 0.875rem; font-weight: 600; cursor: pointer;
    `
    saveBtn.addEventListener('click', () => {
      this.save()
      this.dirty = false
      this.hide()
    })
    header.appendChild(saveBtn)
    panel.appendChild(header)

    const grid = document.createElement('div')
    grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; align-items: start;'

    // Column 1 — Server URL + Event OTP
    const col1 = document.createElement('div')
    col1.style.cssText = 'display: flex; flex-direction: column; gap: 1.5rem;'
    const serverSection = this.createServerSection()
    col1.appendChild(serverSection)
    const otpSection = this.createOtpSection()
    otpSection.style.borderBottom = 'none'
    col1.appendChild(otpSection)

    // Column 2 — Camera Source, Devices, DSLR Exposure, Focus
    const col2 = document.createElement('div')
    col2.style.cssText = 'display: flex; flex-direction: column; gap: 1.5rem;'
    const cameraSourceSection = this.createCameraSourceSection()
    cameraSourceSection.style.borderBottom = 'none'
    col2.appendChild(cameraSourceSection)
    const devicesSection = this.createDevicesSection()
    devicesSection.style.borderBottom = 'none'
    col2.appendChild(devicesSection)

    this.dslrExposureSection = document.createElement('div')
    this.dslrExposureSection.style.cssText = 'display: flex; flex-direction: column; gap: 1rem;'

    const dslrTitle = document.createElement('h3')
    dslrTitle.textContent = 'DSLR Exposure'
    dslrTitle.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;'
    this.dslrExposureSection.appendChild(dslrTitle)

    const isoChoices = ['auto', '100', '200', '400', '800', '1600', '3200', '6400']
    const shutterChoices = ['auto', '1/30', '1/40', '1/50', '1/60', '1/80', '1/100', '1/125', '1/160', '1/200', '1/250', '1/320', '1/400', '1/500', '1/640', '1/800']
    const apertureChoices = ['auto', '2.8', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11']

    const createChoiceSlider = (labelStr: string, current: string, choices: string[], onChange: (v: string) => void, altBg: boolean) => {
      const row = document.createElement('div')
      row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: ${altBg ? '#111' : '#191919'}; border-bottom: 1px solid #252525;`
      const label = document.createElement('label')
      label.textContent = labelStr
      label.style.cssText = 'font-size: 0.875rem; color: #ccc; font-weight: 500; min-width: 100px;'
      row.appendChild(label)

      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'display: flex; align-items: center; gap: 1rem; flex: 1;'

      const input = document.createElement('input')
      input.type = 'range'
      input.min = '0'
      input.max = String(choices.length - 1)
      const currentIndex = choices.indexOf(current)
      input.value = String(currentIndex >= 0 ? currentIndex : 0)
      input.style.cssText = 'flex: 1;'

      const valDisplay = document.createElement('span')
      valDisplay.style.cssText = 'font-size: 0.875rem; font-weight: 600; color: #fff; min-width: 60px; text-align: right;'
      valDisplay.textContent = choices[parseInt(input.value)]

      input.addEventListener('input', () => {
        const val = choices[parseInt(input.value)]
        valDisplay.textContent = val
        onChange(val)
      })

      wrapper.appendChild(input)
      wrapper.appendChild(valDisplay)
      row.appendChild(wrapper)
      return row
    }

    const dslrFields = [
      createChoiceSlider('Shutter', this.settings.dslrShutterSpeed || 'auto', shutterChoices, (v) => { this.settings.dslrShutterSpeed = v; this.markDirty() }, false),
      createChoiceSlider('ISO', this.settings.dslrIso || 'auto', isoChoices, (v) => { this.settings.dslrIso = v; this.markDirty() }, true),
      createChoiceSlider('Aperture', this.settings.dslrAperture || 'auto', apertureChoices, (v) => { this.settings.dslrAperture = v; this.markDirty() }, false),
    ]
    const dslrBox = document.createElement('div')
    dslrBox.style.cssText = 'border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden;'
    for (const f of dslrFields) dslrBox.appendChild(f)
    dslrFields[dslrFields.length - 1].style.borderBottom = 'none'
    this.dslrExposureSection.appendChild(dslrBox)

    const focusTitle = document.createElement('h3')
    focusTitle.textContent = 'Focus'
    focusTitle.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;'
    this.dslrExposureSection.appendChild(focusTitle)

    const focusBox = document.createElement('div')
    focusBox.style.cssText = 'border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden;'

    const focusRow = document.createElement('div')
    focusRow.style.cssText = 'display: flex; padding: 0.75rem 1rem; background: #191919; align-items: center; justify-content: space-between;'

    const focusLabel = document.createElement('label')
    focusLabel.textContent = 'Focus Mode'
    focusLabel.style.cssText = 'font-size: 0.875rem; color: #ccc; font-weight: 500;'
    focusRow.appendChild(focusLabel)

    const focusToggle = document.createElement('div')
    focusToggle.style.cssText = 'display: flex; border: 1px solid #333; border-radius: 6px; overflow: hidden;'

    const afBtn = document.createElement('button')
    afBtn.textContent = 'Auto (AF)'
    const mfBtn = document.createElement('button')
    mfBtn.textContent = 'Manual (MF)'

    const focusMode = this.settings.dslrFocusMode || 'auto'
    const applyFocusStyle = (mode: string) => {
      afBtn.style.cssText = `padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 600; border: none; cursor: pointer; ${mode === 'auto' ? 'background: #fff; color: #000;' : 'background: #111; color: #888;'}`
      mfBtn.style.cssText = `padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 600; border: none; cursor: pointer; ${mode === 'manual' ? 'background: #fff; color: #000;' : 'background: #111; color: #888;'}`
    }
    applyFocusStyle(focusMode)

    afBtn.addEventListener('click', () => { this.settings.dslrFocusMode = 'auto'; applyFocusStyle('auto'); this.markDirty() })
    mfBtn.addEventListener('click', () => { this.settings.dslrFocusMode = 'manual'; applyFocusStyle('manual'); this.markDirty() })

    focusToggle.appendChild(afBtn)
    focusToggle.appendChild(mfBtn)
    focusRow.appendChild(focusToggle)
    focusBox.appendChild(focusRow)
    this.dslrExposureSection.appendChild(focusBox)
    col2.appendChild(this.dslrExposureSection)

    // Column 3 — Capture
    const col3 = document.createElement('div')
    col3.style.cssText = 'display: flex; flex-direction: column; gap: 1.5rem;'
    const captureTitle = document.createElement('h3')
    captureTitle.textContent = 'Capture'
    captureTitle.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;'
    col3.appendChild(captureTitle)

    const fields = [
      this.createField('Photos per session', 1, 4, this.settings.photoCount, (v) => { this.settings.photoCount = v; this.markDirty() }, false),
      this.createField('Countdown (seconds)', 3, 10, this.settings.countdown, (v) => { this.settings.countdown = v; this.markDirty() }, true),
      this.createField('Interval (seconds)', 0, 5, this.settings.captureInterval, (v) => { this.settings.captureInterval = v; this.markDirty() }, false),
      this.createField('Preview (seconds)', 1, 5, this.settings.postCapturePreview, (v) => { this.settings.postCapturePreview = v; this.markDirty() }, true),
    ]
    const settingsBox = document.createElement('div')
    settingsBox.style.cssText = 'border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden;'
    for (const f of fields) settingsBox.appendChild(f)
    fields[fields.length - 1].style.borderBottom = 'none'
    col3.appendChild(settingsBox)

    panel.appendChild(this.dslrExposureSection)

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

  // -------------------------------------------------------------------------
  // Camera Source section — segmented control: Webcam vs DSLR
  // -------------------------------------------------------------------------

  private createCameraSourceSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = 'margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #2a2a2a;'

    const title = document.createElement('h3')
    title.textContent = 'Camera Source'
    title.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0 0 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;'
    section.appendChild(title)

    // Segmented control
    const segRow = document.createElement('div')
    segRow.style.cssText = `
      display: flex; border: 1px solid #333; border-radius: 8px; overflow: hidden;
      margin-bottom: 0.75rem;
    `

    this.webcamModeBtn = document.createElement('button')
    this.webcamModeBtn.textContent = 'Webcam'
    this.webcamModeBtn.id = 'cam-mode-webcam'

    this.dslrModeBtn = document.createElement('button')
    this.dslrModeBtn.textContent = 'DSLR / Mirrorless'
    this.dslrModeBtn.id = 'cam-mode-dslr'

    const segBtnBase = `
      flex: 1; padding: 0.625rem; font-size: 0.8125rem; font-weight: 600;
      border: none; cursor: pointer; transition: background 150ms;
    `
    this.webcamModeBtn.style.cssText = segBtnBase
    this.dslrModeBtn.style.cssText = segBtnBase

    segRow.appendChild(this.webcamModeBtn)
    segRow.appendChild(this.dslrModeBtn)
    section.appendChild(segRow)

    // DSLR status line (model name or "Not detected")
    this.dslrStatusEl = document.createElement('div')
    this.dslrStatusEl.style.cssText = 'font-size: 0.75rem; color: #666; min-height: 1.2em; margin-bottom: 0.375rem;'
    section.appendChild(this.dslrStatusEl)

    this.dslrSelectContainer = document.createElement('div')
    this.dslrSelectContainer.style.cssText = 'margin-bottom: 0.75rem; display: none;'
    
    this.dslrSelect = document.createElement('select')
    this.dslrSelect.style.cssText = `
      width: 100%; padding: 0.625rem; border: 1px solid #333;
      border-radius: 8px; background: #222; color: #fff;
      font-size: 0.8125rem; outline: none; margin-top: 0.375rem;
    `
    this.dslrSelect.addEventListener('change', () => {
      if (window.hellomyphoto && window.hellomyphoto.setDslrCameraPort) {
        window.hellomyphoto.setDslrCameraPort(this.dslrSelect.value)
      }
    })
    this.dslrSelectContainer.appendChild(this.dslrSelect)
    section.appendChild(this.dslrSelectContainer)

    // Scan button
    this.dslrScanBtn = document.createElement('button')
    this.dslrScanBtn.textContent = 'Scan for Camera'
    this.dslrScanBtn.id = 'dslr-scan-btn'
    this.dslrScanBtn.style.cssText = `
      padding: 0.375rem 0.875rem; border: 1px solid #444; border-radius: 6px;
      background: #222; color: #ccc; font-size: 0.75rem; cursor: pointer;
    `
    this.dslrScanBtn.addEventListener('click', async () => {
      this.dslrScanBtn.disabled = true
      this.dslrScanBtn.textContent = 'Scanning…'
      try {
        const result = await window.hellomyphoto?.detectDslr()
        this.dslrSelectContainer.style.display = 'none'
        
        if (result?.connected) {
          this.dslrStatusEl.style.color = '#4caf50'
          this.dslrStatusEl.textContent = `● Connected — ${result.model || 'Unknown camera'}`
          
          if (result.cameras && result.cameras.length > 1) {
            this.dslrSelect.innerHTML = ''
            result.cameras.forEach((c: any) => {
              const opt = document.createElement('option')
              opt.value = c.port
              opt.textContent = `${c.model} (${c.port})`
              if (c.model === result.model) opt.selected = true
              this.dslrSelect.appendChild(opt)
            })
            this.dslrSelectContainer.style.display = 'block'
          }
        } else {
          this.dslrStatusEl.style.color = '#f44336'
          this.dslrStatusEl.textContent = '● No camera detected — check USB cable'
        }
      } catch {
        this.dslrStatusEl.style.color = '#f44336'
        this.dslrStatusEl.textContent = '● Detection failed'
      }
      this.dslrScanBtn.disabled = false
      this.dslrScanBtn.textContent = 'Scan for Camera'
    })
    section.appendChild(this.dslrScanBtn)

    // Kill PTPCamera button (macOS: PTPCamera daemon steals USB from gphoto2)
    this.dslrKillPtpBtn = document.createElement('button')
    this.dslrKillPtpBtn.textContent = 'Kill Camera Daemon'
    this.dslrKillPtpBtn.id = 'dslr-kill-ptp-btn'
    this.dslrKillPtpBtn.style.cssText = `
      padding: 0.375rem 0.875rem; border: 1px solid #c0392b; border-radius: 6px;
      background: #2a0f0d; color: #e74c3c; font-size: 0.75rem; cursor: pointer;
      margin-left: 0.5rem;
    `
    this.dslrKillPtpBtn.addEventListener('click', async () => {
      this.dslrKillPtpBtn.disabled = true
      this.dslrKillPtpBtn.textContent = 'Killing…'
      try {
        const result = await window.hellomyphoto?.killPtpDaemon()
        if (result?.success) {
          this.dslrStatusEl.textContent = '● Daemon killed — re-scanning…'
          this.dslrStatusEl.style.color = '#f0ad4e'
          // Auto re-scan after killing
          const detectResult = await window.hellomyphoto?.detectDslr()
          if (detectResult?.connected) {
            this.dslrStatusEl.style.color = '#4caf50'
            this.dslrStatusEl.textContent = `● Connected — ${detectResult.model || 'Unknown camera'}`
          } else {
            this.dslrStatusEl.style.color = '#f44336'
            this.dslrStatusEl.textContent = '● No camera detected — check USB cable'
          }
        } else {
          this.dslrStatusEl.style.color = '#f44336'
          this.dslrStatusEl.textContent = '● Failed to kill daemon'
        }
      } catch {
        this.dslrStatusEl.style.color = '#f44336'
        this.dslrStatusEl.textContent = '● Failed to kill daemon'
      }
      this.dslrKillPtpBtn.disabled = false
      this.dslrKillPtpBtn.textContent = 'Kill Camera Daemon'
    })
    section.appendChild(this.dslrKillPtpBtn)

    // Wire up button events
    this.webcamModeBtn.addEventListener('click', () => {
      this.settings.cameraMode = 'webcam'
      this.refreshCameraSourceUI()
      this.markDirty()
    })
    this.dslrModeBtn.addEventListener('click', () => {
      this.settings.cameraMode = 'dslr'
      this.refreshCameraSourceUI()
      this.markDirty()
    })

    this.refreshCameraSourceUI()
    return section
  }

  /**
   * Update the segmented control and webcam row visibility to reflect
   * the current settings.cameraMode value.
   */
  private refreshCameraSourceUI() {
    const isDslr = this.settings.cameraMode === 'dslr'

    const active = 'background: #fff; color: #000;'
    const inactive = 'background: #111; color: #888;'
    this.webcamModeBtn.style.cssText = `flex: 1; padding: 0.625rem; font-size: 0.8125rem; font-weight: 600; border: none; cursor: pointer; transition: background 150ms; ${isDslr ? inactive : active}`
    this.dslrModeBtn.style.cssText = `flex: 1; padding: 0.625rem; font-size: 0.8125rem; font-weight: 600; border: none; cursor: pointer; transition: background 150ms; ${isDslr ? active : inactive}`

    if (this.webcamDeviceRow && this.cameraSelect) {
      if (isDslr) {
        this.webcamDeviceRow.style.display = ''
        this.cameraSelect.disabled = true
        this.cameraSelect.style.opacity = '0.45'
        this.cameraSelect.innerHTML = '<option value="">N/A</option>'
      } else {
        this.cameraSelect.disabled = false
        this.cameraSelect.style.opacity = '1'
        this.populateDevices()
      }
    }

    if (this.dslrScanBtn) {
      this.dslrScanBtn.disabled = !isDslr
      this.dslrScanBtn.style.opacity = isDslr ? '1' : '0.35'
      this.dslrScanBtn.style.cursor = isDslr ? 'pointer' : 'default'
    }
    if (this.dslrKillPtpBtn) {
      this.dslrKillPtpBtn.disabled = !isDslr
      this.dslrKillPtpBtn.style.opacity = isDslr ? '1' : '0.35'
      this.dslrKillPtpBtn.style.cursor = isDslr ? 'pointer' : 'default'
    }

    // Removed dimming so it's always interactable in the limited modal
  }

  // -------------------------------------------------------------------------
  // Devices section
  // -------------------------------------------------------------------------

  private createDevicesSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = 'margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #2a2a2a;'

    const title = document.createElement('h3')
    title.textContent = 'Devices'
    title.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0 0 1rem; text-transform: uppercase; letter-spacing: 0.05em;'
    section.appendChild(title)

    // Wrap webcam camera select so we can hide it in DSLR mode
    this.webcamDeviceRow = document.createElement('div')

    this.cameraSelect = document.createElement('select')
    this.cameraSelect.style.cssText = this.selectStyle()
    const cameraLabel = this.createSelectLabel('Webcam Device', this.cameraSelect)
    this.webcamDeviceRow.appendChild(cameraLabel)
    this.webcamDeviceRow.appendChild(this.cameraSelect)
    section.appendChild(this.webcamDeviceRow)

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

  private createStringField(
    label: string,
    currentValue: string,
    onChange: (value: string) => void,
    isEven: boolean
  ): HTMLDivElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; background: ${isEven ? '#191919' : '#111'}; border-bottom: 1px solid #252525;`

    const lbl = document.createElement('label')
    lbl.textContent = label
    lbl.style.cssText = 'font-size: 0.8125rem; color: #ccc; font-weight: 500;'
    field.appendChild(lbl)

    const input = document.createElement('input')
    input.type = 'text'
    input.value = currentValue
    input.style.cssText = `
      width: 100px; padding: 0.375rem 0.5rem; border: 1px solid #333; border-radius: 6px;
      background: #0f0f0f; color: #fff; font-size: 0.875rem; font-weight: 600;
      outline: none; text-align: center; box-sizing: border-box;
    `

    this.strInputs.push(input)

    input.addEventListener('focus', () => { input.style.borderColor = '#666'; input.style.boxShadow = '0 0 0 1px #555' })
    input.addEventListener('blur', () => { input.style.borderColor = '#333'; input.style.boxShadow = 'none' })

    input.addEventListener('change', () => {
      let val = input.value.trim()
      if (!val) val = 'auto'
      input.value = val
      onChange(val)
    })

    field.appendChild(input)
    return field
  }

  private refreshFields() {
    const numValues = [this.settings.photoCount, this.settings.countdown, this.settings.captureInterval, this.settings.postCapturePreview]
    for (let i = 0; i < this.numInputs.length; i++) {
      this.numInputs[i].value = String(numValues[i])
    }

    if (this.strInputs.length === 3) {
      this.strInputs[0].value = this.settings.dslrShutterSpeed || 'auto'
      this.strInputs[1].value = this.settings.dslrIso || 'auto'
      this.strInputs[2].value = this.settings.dslrAperture || 'auto'
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
        this.refreshCameraSourceUI()
        if (this.settings.otp && boothSocket?.connected && !this.connectedEvent) {
          this.fetchConnectedEvent(this.settings.otp)
        }
      })
      this.populateDevices()
      // Show current DSLR detection status when panel opens
      window.hellomyphoto?.detectDslr().then((result) => {
        if (!this.visible) return
        if (result?.connected) {
          this.dslrStatusEl.style.color = '#4caf50'
          this.dslrStatusEl.textContent = `● ${result.model || 'Camera'} connected`
        } else {
          this.dslrStatusEl.style.color = '#555'
          this.dslrStatusEl.textContent = '○ No DSLR detected'
        }
      }).catch(() => {})
    }
  }

  hide() {
    this.visible = false
    this.overlay.style.display = 'none'
  }
}