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
  dslrWhiteBalance?: string
  dslrWhiteBalanceKelvin?: number
  liveviewMode?: 'mjpeg' | 'polling'
  autoPreview?: boolean
  liveviewRetryAttempts?: number
  shutterOffsetDelay?: number
  settingsPasscode?: string
  devSimulationEnabled?: boolean
  devSimulateOffline?: boolean
  devLatencyMs?: number
  devUploadThrottleKbps?: number
  devPacketLossPercent?: number
  devServerErrorPercent?: number
  devTimeoutPercent?: number
}

interface MediaDeviceInfo {
  deviceId: string
  label: string
}

export class Settings {
  private overlay: HTMLDivElement
  private visible = false
  public get isVisible() { return this.visible }
  private dirty = false
  private onChange: (settings: BoothSettings) => void
  private settings: BoothSettings = { photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, serverUrl: 'http://localhost:3000', cameraMode: 'webcam', dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', dslrWhiteBalance: 'auto', dslrWhiteBalanceKelvin: 5200, liveviewMode: 'mjpeg', autoPreview: false, liveviewRetryAttempts: 1, shutterOffsetDelay: 0 }
  private serverInput!: HTMLInputElement
  private cameraSelect!: HTMLSelectElement
  private audioSelect!: HTMLSelectElement
  private statusText!: HTMLSpanElement
  private numInputs: HTMLInputElement[] = []
  private strInputs: HTMLInputElement[] = []
  private connectionStatus!: HTMLDivElement
  private passcodeInput!: HTMLInputElement
  private connectedEvent: { name: string; date: string; description: string } | null = null

  private static progressMap: Record<string, any> = {}
  private static progressListenerAdded = false
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
  private panel!: HTMLDivElement
  private grid!: HTMLDivElement
  private col2!: HTMLDivElement
  private dslrSliderRefs: Array<{ input: HTMLInputElement; display: HTMLSpanElement; choices: string[] }> = []
  private dslrModel = ''
  private mjpegBtn!: HTMLButtonElement
  private pollingBtn!: HTMLButtonElement
  private autoPreviewTrack!: HTMLDivElement
  private autoPreviewThumb!: HTMLDivElement
  private wbSelect!: HTMLSelectElement
  private wbKelvinRow!: HTMLDivElement
  private wbKelvinInput!: HTMLInputElement
  private wbKelvinDisplay!: HTMLSpanElement
  private whiteBalanceChoices: string[] = []

  constructor(container: HTMLElement, onChange: (settings: BoothSettings) => void) {
    this.onChange = onChange

    if (!Settings.progressListenerAdded) {
      Settings.progressListenerAdded = true
      window.hellomyphoto?.onUploadProgress((data) => {
        Settings.progressMap[data.sessionId] = data
      })
    }

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
      position: absolute; inset: 0; background: #0f0f0f;
      display: none; flex-direction: column;
      z-index: 30; pointer-events: all;
    `

    this.panel = document.createElement('div')
    this.panel.style.cssText = `
      background: #0f0f0f; padding: 2rem;
      width: 100%; box-sizing: border-box;
      flex: 1; overflow-y: auto;
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

    const devBtn = document.createElement('button')
    devBtn.textContent = 'Advanced Dev Options'
    devBtn.style.cssText = `
      padding: 0.5rem 1rem;
      background: transparent; color: #888; border: 1px solid #333; border-radius: 8px;
      font-size: 0.8125rem; font-weight: 500; cursor: pointer; margin-right: 0.5rem;
    `
    devBtn.addEventListener('click', () => this.promptForDevOptions())
    header.insertBefore(devBtn, saveBtn)


    this.panel.appendChild(header)

    this.grid = document.createElement('div')
    this.grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; align-items: start;'

    // Column 1 — Server URL + Event OTP + App Passcode
    const col1 = document.createElement('div')
    col1.style.cssText = 'display: flex; flex-direction: column; gap: 1.5rem;'
    const serverSection = this.createServerSection()
    serverSection.style.borderBottom = 'none'
    col1.appendChild(serverSection)
    const otpSection = this.createOtpSection()
    otpSection.style.borderBottom = 'none'
    col1.appendChild(otpSection)
    const passcodeSection = this.createPasscodeSection()
    col1.appendChild(passcodeSection)
    
    col1.appendChild(this.createQueueSection())

    // Column 2 — Camera Source, Devices, DSLR Exposure, Focus
    this.col2 = document.createElement('div')
    this.col2.style.cssText = 'display: flex; flex-direction: column; gap: 1.5rem;'
    const cameraSourceSection = this.createCameraSourceSection()
    cameraSourceSection.style.borderBottom = 'none'
    this.col2.appendChild(cameraSourceSection)
    const devicesSection = this.createDevicesSection()
    devicesSection.style.borderBottom = 'none'
    this.col2.appendChild(devicesSection)

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
      valDisplay.style.cssText = 'font-size: 0.875rem; font-weight: 600; color: #fff; min-width: 80px; text-align: right;'
      valDisplay.textContent = choices[parseInt(input.value)]

      this.dslrSliderRefs.push({ input, display: valDisplay, choices })

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

    const getWbOptions = () => {
      const opts = this.whiteBalanceChoices.length > 0 ? [...this.whiteBalanceChoices] : ['Auto', 'Daylight', 'Shadow', 'Cloudy', 'Tungsten', 'Fluorescent', 'Flash']
      if (!opts.includes('Custom')) opts.push('Custom')
      return opts
    }

    const populateWbDropdown = () => {
      this.wbSelect.innerHTML = ''
      for (const opt of getWbOptions()) {
        const el = document.createElement('option')
        el.value = opt
        el.textContent = opt
        this.wbSelect.appendChild(el)
      }
      this.wbSelect.value = this.settings.dslrWhiteBalance || 'Auto'
    }

    const wbRow = document.createElement('div')
    wbRow.style.cssText = 'display: flex; padding: 0.75rem 1rem; background: #111; align-items: center; justify-content: space-between; margin-top: 0.5rem; border: 1px solid #2a2a2a; border-radius: 8px;'
    const wbLabel = document.createElement('label')
    wbLabel.textContent = 'White Balance'
    wbLabel.style.cssText = 'font-size: 0.875rem; color: #ccc; font-weight: 500;'
    wbRow.appendChild(wbLabel)
    this.wbSelect = document.createElement('select')
    this.wbSelect.style.cssText = 'padding: 0.375rem 0.5rem; border: 1px solid #333; border-radius: 6px; background: #0f0f0f; color: #fff; font-size: 0.8125rem; outline: none; cursor: pointer;'
    populateWbDropdown()
    this.wbSelect.addEventListener('change', () => {
      this.settings.dslrWhiteBalance = this.wbSelect.value
      const isCustomWb = this.wbSelect.value === 'Custom' || this.wbSelect.value === 'Color Temperature'
      this.wbKelvinRow.style.display = isCustomWb ? 'flex' : 'none'
      this.markDirty()
    })
    this.strInputs.push(this.wbSelect as any)
    wbRow.appendChild(this.wbSelect)
    this.dslrExposureSection.appendChild(wbRow)

    this.wbKelvinRow = document.createElement('div')
    this.wbKelvinRow.style.cssText = 'display: none; padding: 0.75rem 1rem; background: #191919; align-items: center; justify-content: space-between; border: 1px solid #2a2a2a; border-radius: 8px; margin-top: 0.375rem;'
    const kelvinLabel = document.createElement('label')
    kelvinLabel.textContent = 'Kelvin'
    kelvinLabel.style.cssText = 'font-size: 0.875rem; color: #ccc; font-weight: 500; min-width: 60px;'
    this.wbKelvinRow.appendChild(kelvinLabel)

    const kelvinWrapper = document.createElement('div')
    kelvinWrapper.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; flex: 1;'

    this.wbKelvinInput = document.createElement('input')
    this.wbKelvinInput.type = 'range'
    this.wbKelvinInput.min = '2500'
    this.wbKelvinInput.max = '10000'
    this.wbKelvinInput.step = '100'
    this.wbKelvinInput.value = String(this.settings.dslrWhiteBalanceKelvin || 5200)
    this.wbKelvinInput.style.cssText = 'flex: 1;'

    this.wbKelvinDisplay = document.createElement('span')
    this.wbKelvinDisplay.textContent = this.wbKelvinInput.value + 'K'
    this.wbKelvinDisplay.style.cssText = 'font-size: 0.875rem; font-weight: 600; color: #fff; min-width: 60px; text-align: right;'

    this.wbKelvinInput.addEventListener('input', () => {
      this.wbKelvinDisplay.textContent = this.wbKelvinInput.value + 'K'
      this.settings.dslrWhiteBalanceKelvin = parseInt(this.wbKelvinInput.value, 10)
      this.markDirty()
    })

    kelvinWrapper.appendChild(this.wbKelvinInput)
    kelvinWrapper.appendChild(this.wbKelvinDisplay)
    this.wbKelvinRow.appendChild(kelvinWrapper)
    this.dslrExposureSection.appendChild(this.wbKelvinRow)

    if (this.wbSelect.value === 'Custom' || this.wbSelect.value === 'Color Temperature') this.wbKelvinRow.style.display = 'flex'

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
    this.col2.appendChild(this.dslrExposureSection)

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
      this.createFloatField('Shutter offset (s)', 0, 10, 0.1, this.settings.shutterOffsetDelay || 0, (v) => { this.settings.shutterOffsetDelay = v; this.markDirty() }, false),
    ]
    const settingsBox = document.createElement('div')
    settingsBox.style.cssText = 'border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden;'
    for (const f of fields) settingsBox.appendChild(f)
    fields[fields.length - 1].style.borderBottom = 'none'
    col3.appendChild(settingsBox)

    const lvTitle = document.createElement('h3')
    lvTitle.textContent = 'Preview'
    lvTitle.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;'
    col3.appendChild(lvTitle)

    const lvDesc = document.createElement('p')
    lvDesc.textContent = 'MJPEG: smooth 30fps preview (settings apply with brief pause). Polling: lower ~3fps (settings update without interruption).'
    lvDesc.style.cssText = 'font-size: 0.75rem; color: #666; margin: 0 0 0.5rem; line-height: 1.4;'
    col3.appendChild(lvDesc)

    const liveviewBox = document.createElement('div')
    liveviewBox.style.cssText = 'border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden;'

    const lvRow = document.createElement('div')
    lvRow.style.cssText = 'display: flex; padding: 0.75rem 1rem; background: #191919; align-items: center; justify-content: space-between;'

    const lvLabel = document.createElement('label')
    lvLabel.textContent = 'Liveview Mode'
    lvLabel.style.cssText = 'font-size: 0.875rem; color: #ccc; font-weight: 500;'
    lvRow.appendChild(lvLabel)

    const lvToggle = document.createElement('div')
    lvToggle.style.cssText = 'display: flex; border: 1px solid #333; border-radius: 6px; overflow: hidden;'

    this.mjpegBtn = document.createElement('button')
    this.mjpegBtn.textContent = 'MJPEG'
    this.pollingBtn = document.createElement('button')
    this.pollingBtn.textContent = 'Polling'

    this.refreshLvToggle()

    this.mjpegBtn.addEventListener('click', () => { this.settings.liveviewMode = 'mjpeg'; this.refreshLvToggle(); this.markDirty() })
    this.pollingBtn.addEventListener('click', () => {
      if (this.dslrModel.toLowerCase().includes('canon')) return
      this.settings.liveviewMode = 'polling'; this.refreshLvToggle(); this.markDirty()
    })

    lvToggle.appendChild(this.mjpegBtn)
    lvToggle.appendChild(this.pollingBtn)
    lvRow.appendChild(lvToggle)
    liveviewBox.appendChild(lvRow)

    const autoPreviewRow = document.createElement('div')
    autoPreviewRow.style.cssText = 'display: flex; padding: 0.75rem 1rem; background: #111; align-items: center; justify-content: space-between; border-top: 1px solid #252525;'

    const autoPreviewLabel = document.createElement('label')
    autoPreviewLabel.textContent = 'Auto exposure during preview'
    autoPreviewLabel.style.cssText = 'font-size: 0.875rem; color: #ccc; font-weight: 500; cursor: pointer;'
    autoPreviewRow.appendChild(autoPreviewLabel)

    this.autoPreviewTrack = document.createElement('div')
    this.autoPreviewThumb = document.createElement('div')
    const applyToggle = (on: boolean) => {
      this.autoPreviewTrack.style.cssText = `position: relative; width: 44px; height: 24px; border-radius: 12px; cursor: pointer; transition: background 150ms; flex-shrink: 0; background: ${on ? '#fff' : '#333'};`
      this.autoPreviewThumb.style.cssText = `position: absolute; top: 3px; left: ${on ? '23px' : '3px'}; width: 18px; height: 18px; border-radius: 50%; background: ${on ? '#000' : '#888'}; transition: left 150ms;`
    }
    applyToggle(!!this.settings.autoPreview)
    this.autoPreviewTrack.appendChild(this.autoPreviewThumb)
    this.autoPreviewTrack.addEventListener('click', () => {
      this.settings.autoPreview = !this.settings.autoPreview
      applyToggle(!!this.settings.autoPreview)
      this.markDirty()
    })
    autoPreviewRow.appendChild(this.autoPreviewTrack)
    liveviewBox.appendChild(autoPreviewRow)

    const retryRow = document.createElement('div')
    retryRow.style.cssText = 'display: flex; padding: 0.75rem 1rem; background: #191919; align-items: center; justify-content: space-between; border-top: 1px solid #252525;'

    const retryLabel = document.createElement('label')
    retryLabel.textContent = 'Liveview retry attempts'
    retryLabel.style.cssText = 'font-size: 0.875rem; color: #ccc; font-weight: 500;'
    retryRow.appendChild(retryLabel)

    const retryInput = document.createElement('input')
    retryInput.type = 'number'
    retryInput.min = '1'
    retryInput.max = '10'
    retryInput.value = String(this.settings.liveviewRetryAttempts || 1)
    retryInput.style.cssText = `
      width: 60px; padding: 0.375rem 0.5rem; border: 1px solid #333; border-radius: 6px;
      background: #0f0f0f; color: #fff; font-size: 0.875rem; font-weight: 600;
      outline: none; text-align: center; box-sizing: border-box;
    `
    retryInput.addEventListener('focus', () => { retryInput.style.borderColor = '#666'; retryInput.style.boxShadow = '0 0 0 1px #555' })
    retryInput.addEventListener('blur', () => { retryInput.style.borderColor = '#333'; retryInput.style.boxShadow = 'none' })
    retryInput.addEventListener('change', () => {
      let val = parseInt(retryInput.value, 10)
      if (isNaN(val)) val = 1
      val = Math.max(1, Math.min(10, val))
      retryInput.value = String(val)
      this.settings.liveviewRetryAttempts = val
      this.markDirty()
    })
    this.numInputs.push(retryInput)
    retryRow.appendChild(retryInput)

    liveviewBox.appendChild(retryRow)

    col3.appendChild(liveviewBox)

    this.grid.appendChild(col1)
    this.grid.appendChild(this.col2)
    this.grid.appendChild(col3)
    this.panel.appendChild(this.grid)

    this.overlay.appendChild(this.panel)
    container.appendChild(this.overlay)
  }

  private createQueueSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = ''

    const headerRow = document.createElement('div')
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;'

    const title = document.createElement('h3')
    title.textContent = 'Upload Queue & Diagnostics'
    title.style.cssText = 'font-size: 0.8125rem; font-weight: 600; color: #888; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;'
    headerRow.appendChild(title)

    const controls = document.createElement('div')
    controls.style.cssText = 'display: flex; gap: 0.5rem;'

    const pauseBtn = document.createElement('button')
    pauseBtn.textContent = 'Pause Uploads'
    pauseBtn.style.cssText = 'padding: 0.375rem 0.75rem; border: 1px solid #555; border-radius: 4px; background: #222; color: #fff; font-size: 0.75rem; cursor: pointer;'
    
    const isPausedCheck = async () => {
      const paused = await window.hellomyphoto?.isQueuePaused()
      if (paused) {
        pauseBtn.textContent = 'Resume Uploads'
        pauseBtn.style.background = '#4CAF50'
      } else {
        pauseBtn.textContent = 'Pause Uploads'
        pauseBtn.style.background = '#222'
      }
    }
    isPausedCheck()
    
    pauseBtn.addEventListener('click', async () => {
      const paused = await window.hellomyphoto?.isQueuePaused()
      if (paused) await window.hellomyphoto?.resumeQueue()
      else await window.hellomyphoto?.pauseQueue()
      isPausedCheck()
      refreshList()
    })

    const diagBtn = document.createElement('button')
    diagBtn.textContent = 'Full Diagnostics'
    diagBtn.style.cssText = 'padding: 0.375rem 0.75rem; border: 1px solid #555; border-radius: 4px; background: #222; color: #fff; font-size: 0.75rem; cursor: pointer;'
    diagBtn.addEventListener('click', () => this.showDiagnosticsModal())
    
    const clearHistoryBtn = document.createElement('button')
    clearHistoryBtn.textContent = 'Clear Cache & History'
    clearHistoryBtn.style.cssText = 'padding: 0.375rem 0.75rem; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; background: rgba(239, 68, 68, 0.1); color: #ef4444; font-size: 0.75rem; cursor: pointer; transition: background 150ms;'
    clearHistoryBtn.onmouseenter = () => { clearHistoryBtn.style.background = 'rgba(239, 68, 68, 0.2)' }
    clearHistoryBtn.onmouseleave = () => { clearHistoryBtn.style.background = 'rgba(239, 68, 68, 0.1)' }
    clearHistoryBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all past sessions and cached photos? This cannot be undone.')) {
        await window.hellomyphoto.clearHistory()
        refreshList()
      }
    })

    controls.appendChild(pauseBtn)
    controls.appendChild(diagBtn)
    controls.appendChild(clearHistoryBtn)
    headerRow.appendChild(controls)
    section.appendChild(headerRow)

    const listContainer = document.createElement('div')
    listContainer.style.cssText = 'background: #111; border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;'
    section.appendChild(listContainer)

    let refreshInterval: any
    const refreshList = async () => {
      if (!this.visible) return
      try {
        const recent = await window.hellomyphoto?.getRecentUploads(3) || []
        listContainer.innerHTML = ''
        if (recent.length === 0) {
          listContainer.innerHTML = '<div style="padding: 1rem; color: #555; font-size: 0.75rem; text-align: center;">No recent uploads</div>'
          return
        }

        for (const job of recent) {
          const row = document.createElement('div')
          row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #222; font-size: 0.75rem;'
          
          let statusColor = '#888'
          if (job.status === 'completed') statusColor = '#4CAF50'
          else if (job.status === 'failed') statusColor = '#f44336'
          else if (job.status === 'uploading') statusColor = '#2196F3'

          const left = document.createElement('div')
          left.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem;'
          left.innerHTML = `
            <div style="color: #ccc; font-weight: 500;">Session: ${job.sessionId}</div>
            <div style="color: #666; font-size: 0.65rem; margin-top: 2px;">${new Date(job.createdAt).toLocaleString()}</div>
            <div style="color: ${statusColor}; margin-top: 4px;">${job.status.toUpperCase()}</div>
          `

          const stats = document.createElement('div')
          stats.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-end; color: #888;'
          
          if (job.status === 'uploading' || job.status === 'completed') {
            const sizeStr = job.sizeBytes ? (job.sizeBytes / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown size'
            const speedStr = job.avgSpeedKbps ? (job.avgSpeedKbps / 1024).toFixed(1) + ' MB/s' : '-- MB/s'
            let timeStr = '--'
            if (job.startedAt) {
              const end = job.completedAt || Date.now()
              timeStr = Math.round((end - job.startedAt) / 1000) + 's'
            }
            stats.innerHTML = `
              <div>${sizeStr}</div>
              <div>${speedStr} · ${timeStr}</div>
            `
          }

          const actions = document.createElement('div')
          actions.style.cssText = 'display: flex; gap: 0.5rem; margin-left: 1rem;'

          if (job.status === 'failed') {
            const retryBtn = document.createElement('button')
            retryBtn.textContent = 'Retry'
            retryBtn.style.cssText = 'padding: 0.25rem 0.5rem; border: none; background: #333; color: #fff; border-radius: 4px; cursor: pointer;'
            retryBtn.addEventListener('click', async () => {
              await window.hellomyphoto?.retryUploadJob(job.id)
              refreshList()
            })
            actions.appendChild(retryBtn)
          }

          if (job.status === 'uploading' || job.status === 'pending') {
            const stopBtn = document.createElement('button')
            stopBtn.textContent = 'Stop'
            stopBtn.style.cssText = 'padding: 0.25rem 0.5rem; border: none; background: #4a1c1c; color: #f44336; border-radius: 4px; cursor: pointer;'
            stopBtn.addEventListener('click', async () => {
              await window.hellomyphoto?.cancelUploadJob(job.id)
              refreshList()
            })
            actions.appendChild(stopBtn)
          }

          const rightContainer = document.createElement('div')
          rightContainer.style.cssText = 'display: flex; align-items: center;'
          rightContainer.appendChild(stats)
          if (actions.children.length > 0) rightContainer.appendChild(actions)

          row.appendChild(left)
          row.appendChild(rightContainer)
          listContainer.appendChild(row)
        }
      } catch (err) {
        console.error(err)
      }
    }

    // Refresh when visible
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        refreshList()
        refreshInterval = setInterval(refreshList, 2000)
      } else {
        clearInterval(refreshInterval)
      }
    })
    observer.observe(section)

    return section
  }

  private createServerSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = 'margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #2a2a2a;'

    const label = document.createElement('h3')
    label.textContent = 'SERVER URL'
    label.style.cssText = 'font-size: 0.8125rem; font-weight: 700; color: #888; margin: 0 0 1rem; letter-spacing: 0.05em;'
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

    const label = document.createElement('h3')
    label.textContent = 'EVENT OTP'
    label.style.cssText = 'font-size: 0.8125rem; font-weight: 700; color: #888; margin: 0 0 1rem; letter-spacing: 0.05em;'
    section.appendChild(label)

    const desc = document.createElement('p')
    desc.textContent = '6-digit code from the operator dashboard.'
    desc.style.cssText = 'font-size: 0.75rem; color: #666; margin: 0 0 0.5rem; line-height: 1.4;'
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

  private createPasscodeSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.style.cssText = 'margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #2a2a2a;'

    const label = document.createElement('h3')
    label.textContent = 'APP SETTINGS PASSCODE'
    label.style.cssText = 'font-size: 0.8125rem; font-weight: 700; color: #888; margin: 0 0 1rem; letter-spacing: 0.05em;'
    section.appendChild(label)

    const desc = document.createElement('p')
    desc.textContent = 'Optional. Lock settings page with a passcode. (Bypassed if not connected to an event)'
    desc.style.cssText = 'font-size: 0.75rem; color: #666; margin: 0 0 0.5rem; line-height: 1.4;'
    section.appendChild(desc)

    const row = document.createElement('div')
    row.style.cssText = 'display: flex; gap: 0.5rem; align-items: stretch;'

    const input = document.createElement('input')
    this.passcodeInput = input
    input.type = 'password'
    input.placeholder = 'Leave blank to disable'
    input.value = this.settings.settingsPasscode || ''
    input.style.cssText = `
      flex: 1; font-size: 1rem; padding: 0.625rem;
      background: #111; border: 1px solid #333;
      border-radius: 8px; color: #fff; text-align: center;
      outline: none;
    `

    input.addEventListener('input', () => {
      this.settings.settingsPasscode = input.value.trim() || undefined
      this.markDirty()
    })

    const revealBtn = document.createElement('button')
    revealBtn.textContent = 'Show'
    revealBtn.style.cssText = `
      padding: 0.625rem 1rem; border: 1px solid #555; border-radius: 8px;
      background: #222; color: #fff; font-size: 0.8125rem; cursor: pointer;
    `
    revealBtn.addEventListener('click', () => {
      if (input.type === 'password') {
        input.type = 'text'
        revealBtn.textContent = 'Hide'
      } else {
        input.type = 'password'
        revealBtn.textContent = 'Show'
      }
    })

    row.appendChild(input)
    row.appendChild(revealBtn)
    section.appendChild(row)

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
    const updateWbChoices = (choices?: string[]) => {
      if (choices && choices.length > 0) {
        this.whiteBalanceChoices = choices
      }
      // Rebuild dropdown preserving current selection
      const currentVal = this.settings.dslrWhiteBalance
      const opts = this.whiteBalanceChoices.length > 0 ? [...this.whiteBalanceChoices] : ['Auto', 'Daylight', 'Shadow', 'Cloudy', 'Tungsten', 'Fluorescent', 'Flash']
      if (!opts.includes('Custom')) opts.push('Custom')
      this.wbSelect.innerHTML = ''
      for (const opt of opts) {
        const el = document.createElement('option')
        el.value = opt
        el.textContent = opt
        this.wbSelect.appendChild(el)
      }
      if (currentVal && opts.includes(currentVal)) {
        this.wbSelect.value = currentVal
      }
      const isCustomWb = this.wbSelect.value === 'Custom' || this.wbSelect.value === 'Color Temperature'
      this.wbKelvinRow.style.display = isCustomWb ? 'flex' : 'none'
    }

    this.dslrScanBtn.addEventListener('click', async () => {
      this.dslrScanBtn.disabled = true
      this.dslrScanBtn.textContent = 'Scanning…'
      try {
        const result = await window.hellomyphoto?.detectDslr()
        this.dslrSelectContainer.style.display = 'none'
        this.dslrModel = result?.model || ''
        this.refreshLvToggle()
        
        if (result?.whiteBalanceChoices) {
          updateWbChoices(result.whiteBalanceChoices)
        }

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
          this.dslrModel = detectResult?.model || ''
          this.refreshLvToggle()
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

  private createFloatField(
    label: string,
    min: number,
    max: number,
    step: number,
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
    input.step = String(step)
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
      let val = parseFloat(input.value)
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

  private refreshLvToggle() {
    const mode = this.settings.liveviewMode || 'mjpeg'
    const isCanon = this.dslrModel.toLowerCase().includes('canon')
    this.mjpegBtn.style.cssText = `padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 600; border: none; cursor: pointer; ${mode === 'mjpeg' ? 'background: #fff; color: #000;' : 'background: #111; color: #888;'}`
    this.pollingBtn.style.cssText = `padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 600; border: none; cursor: ${isCanon ? 'not-allowed' : 'pointer'}; ${mode === 'polling' ? 'background: #fff; color: #000;' : isCanon ? 'background: #111; color: #444;' : 'background: #111; color: #888;'}`
    this.pollingBtn.title = isCanon ? 'Polling not supported on Canon DSLRs (fires shutter instead of live preview)' : ''
  }

  private refreshFields() {
    this.refreshLvToggle()
    if (this.autoPreviewTrack) {
      const on = !!this.settings.autoPreview
      this.autoPreviewTrack.style.background = on ? '#fff' : '#333'
      this.autoPreviewThumb.style.left = on ? '23px' : '3px'
      this.autoPreviewThumb.style.background = on ? '#000' : '#888'
    }

    if (this.passcodeInput) {
      this.passcodeInput.value = this.settings.settingsPasscode || ''
    }

    const numValues = [this.settings.photoCount, this.settings.countdown, this.settings.captureInterval, this.settings.postCapturePreview, this.settings.shutterOffsetDelay || 0, this.settings.liveviewRetryAttempts || 1]
    for (let i = 0; i < this.numInputs.length; i++) {
      this.numInputs[i].value = String(numValues[i])
    }

    const dslrVals = [this.settings.dslrShutterSpeed || 'auto', this.settings.dslrIso || 'auto', this.settings.dslrAperture || 'auto']
    for (let i = 0; i < this.dslrSliderRefs.length; i++) {
      const { input, display, choices } = this.dslrSliderRefs[i]
      const val = dslrVals[i] || 'auto'
      const idx = choices.indexOf(val)
      input.value = String(idx >= 0 ? idx : 0)
      display.textContent = choices[parseInt(input.value)]
    }
    if (this.wbSelect) {
      this.wbSelect.value = this.settings.dslrWhiteBalance || 'Auto'
      const isCustomWb = this.wbSelect.value === 'Custom' || this.wbSelect.value === 'Color Temperature'
      this.wbKelvinRow.style.display = isCustomWb ? 'flex' : 'none'
    }
    if (this.wbKelvinInput) {
      const kv = this.settings.dslrWhiteBalanceKelvin || 5200
      this.wbKelvinInput.value = String(kv)
      this.wbKelvinDisplay.textContent = kv + 'K'
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

  toggle(mode: 'full' | 'exposure' = 'full') {
    this.visible = !this.visible
    
    if (this.visible) {
      if (mode === 'exposure') {
        this.overlay.style.cssText = `
          position: absolute; right: 20px; bottom: 20px; background: #0f0f0f;
          flex-direction: column; border-radius: 12px;
          z-index: 30; pointer-events: all; width: 420px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #333;
        `
        this.panel.style.cssText = `
          padding: 1.5rem;
          width: 100%; box-sizing: border-box;
          overflow-y: auto; max-height: 80vh;
        `
        this.grid.style.display = 'none'
        this.panel.appendChild(this.dslrExposureSection)
      } else {
        this.overlay.style.cssText = `
          position: absolute; inset: 0; background: #0f0f0f;
          flex-direction: column;
          z-index: 30; pointer-events: all;
        `
        this.panel.style.cssText = `
          background: #0f0f0f; padding: 2rem;
          width: 100%; box-sizing: border-box;
          flex: 1; overflow-y: auto;
        `
        this.grid.style.display = 'grid'
        this.col2.appendChild(this.dslrExposureSection)
      }
    }

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
        this.dslrModel = result?.model || ''
        this.refreshLvToggle()
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

  private logModal: HTMLDivElement | null = null

  private async showLogs() {
    if (!this.logModal) {
      this.logModal = document.createElement('div')
      this.logModal.style.cssText = `
        position: fixed; inset: 0; z-index: 100;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      `
      this.logModal.addEventListener('click', (e) => {
        if (e.target === this.logModal) this.logModal!.style.display = 'none'
      })
      document.body.appendChild(this.logModal)
    }
    const result = await window.hellomyphoto?.getLogs()
    const lines = result?.lines || []
    const content = lines.join('\n')
    this.logModal.innerHTML = `
      <div style="background:#111; border:1px solid #333; border-radius:12px; width:90%; max-width:800px; max-height:80vh; display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; border-bottom:1px solid #222;">
          <span style="font-size:1rem; font-weight:600; color:#fff;">Logs (${lines.length} lines)</span>
          <button id="close-logs-btn" style="background:none; border:none; color:#888; cursor:pointer; font-size:1.25rem;">✕</button>
        </div>
        <pre style="flex:1; overflow:auto; padding:1rem 1.25rem; margin:0; font-size:0.6875rem; line-height:1.5; color:#aaa; font-family:ui-monospace,SFMono-Regular,monospace; white-space:pre-wrap;">${content || '(no logs yet)'}</pre>
      </div>
    `
    this.logModal.querySelector('#close-logs-btn')!.addEventListener('click', () => {
      this.logModal!.style.display = 'none'
    })
    this.logModal.style.display = 'flex'
  }

  hide() {
    this.visible = false
    this.overlay.style.display = 'none'
  }

  private async showDiagnosticsModal() {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position: fixed; inset: 0; background: #0f0f0f; z-index: 100; display: flex; flex-direction: column; pointer-events: all; padding: 2rem; box-sizing: border-box;'

    const headerRow = document.createElement('div')
    headerRow.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;'

    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    closeBtn.style.cssText = 'background: none; border: none; color: #888; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; border-radius: 6px;'
    closeBtn.addEventListener('click', () => overlay.remove())
    headerRow.appendChild(closeBtn)

    const title = document.createElement('h2')
    title.textContent = 'Upload Diagnostics'
    title.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin: 0; flex: 1;'
    headerRow.appendChild(title)
    overlay.appendChild(headerRow)

    const listContainer = document.createElement('div')
    listContainer.style.cssText = 'flex: 1; overflow-y: auto;'
    overlay.appendChild(listContainer)

    const table = document.createElement('table')
    table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 0.8125rem; text-align: left;'
    
    const thead = document.createElement('thead')
    thead.innerHTML = `
      <tr style="color: #888; border-bottom: 1px solid #333;">
        <th style="padding: 0.75rem;">Session ID</th>
        <th style="padding: 0.75rem;">Status</th>
        <th style="padding: 0.75rem;">Created</th>
        <th style="padding: 0.75rem;">Started</th>
        <th style="padding: 0.75rem; width: 200px;">Progress</th>
        <th style="padding: 0.75rem;">Retries</th>
        <th style="padding: 0.75rem;">Actions</th>
      </tr>
    `
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    table.appendChild(tbody)
    listContainer.appendChild(table)

    document.body.appendChild(overlay)

    const refreshDiagList = async () => {
      try {
        const history = await window.hellomyphoto?.getRecentUploads(100) || []
        tbody.innerHTML = ''
        
        history.forEach((job, index) => {
          const tr = document.createElement('tr')
          const bg = index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)'
          tr.style.cssText = `border-bottom: 1px solid #222; color: #ccc; background: ${bg};`
          
          let statusColor = '#888'
          if (job.status === 'completed') statusColor = '#4CAF50'
          else if (job.status === 'failed') statusColor = '#f44336'
          else if (job.status === 'uploading') statusColor = '#2196F3'

          const formatTime = (ts: number | null) => ts ? new Date(ts).toLocaleTimeString() : '--'
          
          let progressHtml = '--'
          if (job.status === 'uploading' || job.status === 'completed') {
            const isDone = job.status === 'completed'
            const progData = Settings.progressMap[job.sessionId] || { percent: isDone ? 100 : 0, speed: '--', eta: '--' }
            const percentStr = isDone ? '100%' : `${progData.percent}%`
            const infoStr = isDone 
              ? `Done (${job.sizeBytes ? (job.sizeBytes / (1024 * 1024)).toFixed(2) + ' MB' : ''})` 
              : `${progData.percent}% · ${progData.speed} · ETA ${progData.eta}s`

            progressHtml = `
              <div style="width: 100%; min-width: 120px; background: #333; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 0.25rem;">
                <div style="width: ${percentStr}; height: 100%; background: ${isDone ? '#4CAF50' : '#2196F3'}; transition: width 0.2s linear;"></div>
              </div>
              <div style="font-size: 0.65rem; color: #888;">${infoStr}</div>
            `
          }

          tr.innerHTML = `
            <td style="padding: 0.75rem;">${job.sessionId}</td>
            <td style="padding: 0.75rem; color: ${statusColor}; font-weight: 500;">${job.status.toUpperCase()}</td>
            <td style="padding: 0.75rem;">${new Date(job.createdAt).toLocaleTimeString()}</td>
            <td style="padding: 0.75rem;">${formatTime(job.startedAt)}</td>
            <td style="padding: 0.75rem;">${progressHtml}</td>
            <td style="padding: 0.75rem;">${job.retryCount}</td>
            <td style="padding: 0.75rem; width: 120px;" class="actions-cell"></td>
          `

          const actionsCell = tr.querySelector('.actions-cell') as HTMLTableCellElement
          actionsCell.style.cssText = 'display: flex; gap: 0.5rem; padding: 0.75rem; align-items: center;'
          
          if (job.status === 'failed') {
            const retryBtn = document.createElement('button')
            retryBtn.textContent = 'Retry'
            retryBtn.style.cssText = 'padding: 0.25rem 0.5rem; border: none; background: #333; color: #fff; border-radius: 4px; cursor: pointer;'
            retryBtn.addEventListener('click', async () => {
              await window.hellomyphoto?.retryUploadJob(job.id)
              refreshDiagList()
            })
            actionsCell.appendChild(retryBtn)
          } else if (job.status === 'uploading' || job.status === 'pending') {
            const stopBtn = document.createElement('button')
            stopBtn.textContent = 'Stop'
            stopBtn.style.cssText = 'padding: 0.25rem 0.5rem; border: none; background: #4a1c1c; color: #f44336; border-radius: 4px; cursor: pointer;'
            stopBtn.addEventListener('click', async () => {
              await window.hellomyphoto?.cancelUploadJob(job.id)
              refreshDiagList()
            })
            actionsCell.appendChild(stopBtn)
          }

          tbody.appendChild(tr)
        })
      } catch (err) {
        console.error(err)
      }
    }

    refreshDiagList()
    const intervalId = setInterval(refreshDiagList, 2000)

    closeBtn.addEventListener('click', () => {
      clearInterval(intervalId)
      overlay.remove()
    })
  }
  private async promptForDevOptions() {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position: fixed; inset: 0; background: #0f0f0f; z-index: 100; display: flex; flex-direction: column; pointer-events: all; padding: 2rem; box-sizing: border-box;'

    const headerRow = document.createElement('div')
    headerRow.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;'

    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    closeBtn.style.cssText = 'background: none; border: none; color: #888; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; border-radius: 6px;'
    closeBtn.addEventListener('click', () => overlay.remove())
    headerRow.appendChild(closeBtn)

    const title = document.createElement('h2')
    title.textContent = 'Developer Access'
    title.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin: 0; flex: 1;'
    headerRow.appendChild(title)

    overlay.appendChild(headerRow)

    const container = document.createElement('div')
    container.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center;'

    const modal = document.createElement('div')
    modal.style.cssText = 'display: flex; flex-direction: column; gap: 1rem; width: 400px;'
    
    const input = document.createElement('input')
    input.type = 'password'
    input.placeholder = 'Enter Password'
    input.style.cssText = 'padding: 0.75rem; background: transparent; border: 1px solid #333; color: #fff; border-radius: 8px; width: 100%; box-sizing: border-box; outline: none;'
    input.addEventListener('focus', () => { input.style.borderColor = '#666' })
    input.addEventListener('blur', () => { input.style.borderColor = '#333' })
    
    const err = document.createElement('div')
    err.style.cssText = 'color: #f44336; font-size: 0.8125rem; min-height: 1.2rem;'

    const row = document.createElement('div')
    row.style.cssText = 'display: flex; justify-content: flex-end; gap: 0.5rem;'
    
    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.style.cssText = 'padding: 0.5rem 1rem; background: transparent; color: #888; border: none; cursor: pointer; border-radius: 6px;'
    cancelBtn.addEventListener('click', () => overlay.remove())
    
    const submitBtn = document.createElement('button')
    submitBtn.textContent = 'Submit'
    submitBtn.style.cssText = 'padding: 0.5rem 1rem; background: #fff; color: #000; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;'
    
    const checkPassword = async () => {
      const pw = input.value
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      // Target hash for "hellomyphotos12345"
      if (hashHex === '0511be070cf1f6d7744eeeb1db04c6d9ef1c03bb559fe9b471e09c10019aed81') {
        overlay.remove()
        this.showDevOptionsModal()
      } else {
        err.textContent = 'Incorrect password'
        input.value = ''
        input.focus()
      }
    }
    
    submitBtn.addEventListener('click', checkPassword)
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') checkPassword()
      if (e.key === 'Escape') overlay.remove()
    })
    
    row.appendChild(cancelBtn)
    row.appendChild(submitBtn)
    modal.appendChild(input)
    modal.appendChild(err)
    modal.appendChild(row)
    container.appendChild(modal)
    overlay.appendChild(container)
    document.body.appendChild(overlay)
    input.focus()
  }

  private showDevOptionsModal() {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position: fixed; inset: 0; background: #0f0f0f; z-index: 100; display: flex; flex-direction: column; pointer-events: all; padding: 2rem; box-sizing: border-box;'

    const headerRow = document.createElement('div')
    headerRow.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;'

    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    closeBtn.style.cssText = 'background: none; border: none; color: #888; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; border-radius: 6px;'
    closeBtn.addEventListener('click', () => overlay.remove())
    headerRow.appendChild(closeBtn)

    const title = document.createElement('h2')
    title.textContent = 'Advanced Dev Options'
    title.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin: 0; flex: 1;'
    headerRow.appendChild(title)

    const saveBtn = document.createElement('button')
    saveBtn.textContent = 'Apply Settings'
    saveBtn.style.cssText = `
      padding: 0.5rem 1.25rem;
      background: #fff; color: #000; border: none; border-radius: 8px;
      font-size: 0.875rem; font-weight: 600; cursor: pointer;
    `
    headerRow.appendChild(saveBtn)
    overlay.appendChild(headerRow)

    const listContainer = document.createElement('div')
    listContainer.style.cssText = 'flex: 1; overflow-y: auto;'
    overlay.appendChild(listContainer)

    const form = document.createElement('div')
    form.style.cssText = 'display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px;'

    // Helper to style inputs
    const applyInputStyle = (el: HTMLInputElement) => {
      el.style.cssText = 'padding: 0.75rem; background: transparent; border: 1px solid #333; color: #fff; border-radius: 8px; width: 100%; box-sizing: border-box; outline: none; margin-top: 0.5rem;'
      el.addEventListener('focus', () => { el.style.borderColor = '#666' })
      el.addEventListener('blur', () => { el.style.borderColor = '#333' })
      el.addEventListener('keydown', (e) => e.stopPropagation())
    }

    // Logs
    const logsRow = document.createElement('div')
    logsRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; border: 1px solid #2a2a2a; border-radius: 8px; padding: 1rem;'
    const logsLabel = document.createElement('label')
    logsLabel.textContent = 'Application Logs'
    logsLabel.style.color = '#ccc'
    const logsBtn = document.createElement('button')
    logsBtn.textContent = 'View Logs'
    logsBtn.style.cssText = 'padding: 0.5rem 1rem; background: transparent; color: #888; border: 1px solid #333; border-radius: 6px; cursor: pointer;'
    logsBtn.addEventListener('click', () => {
      overlay.remove()
      this.showLogs()
    })
    logsRow.appendChild(logsLabel)
    logsRow.appendChild(logsBtn)
    form.appendChild(logsRow)

    // Master Toggle
    const masterRow = document.createElement('div')
    masterRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between;'
    const masterLabel = document.createElement('label')
    masterLabel.textContent = 'Enable Network Simulations'
    masterLabel.style.color = '#ccc'
    const masterToggle = document.createElement('input')
    masterToggle.type = 'checkbox'
    masterToggle.checked = !!this.settings.devSimulationEnabled
    masterRow.appendChild(masterLabel)
    masterRow.appendChild(masterToggle)
    form.appendChild(masterRow)

    // Offline Toggle
    const offlineRow = document.createElement('div')
    offlineRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between;'
    const offlineLabel = document.createElement('label')
    offlineLabel.textContent = 'Simulate Complete Offline'
    offlineLabel.style.color = '#ccc'
    const offlineToggle = document.createElement('input')
    offlineToggle.type = 'checkbox'
    offlineToggle.checked = !!this.settings.devSimulateOffline
    offlineRow.appendChild(offlineLabel)
    offlineRow.appendChild(offlineToggle)
    form.appendChild(offlineRow)

    // Latency
    const latencyRow = document.createElement('div')
    const latencyLabel = document.createElement('label')
    latencyLabel.textContent = 'Latency (ms, 0 = disabled)'
    latencyLabel.style.color = '#ccc'
    const latencyInput = document.createElement('input')
    latencyInput.type = 'number'
    latencyInput.value = String(this.settings.devLatencyMs || 0)
    applyInputStyle(latencyInput)
    latencyRow.appendChild(latencyLabel)
    latencyRow.appendChild(latencyInput)
    form.appendChild(latencyRow)

    // Throttle
    const throttleRow = document.createElement('div')
    const throttleLabel = document.createElement('label')
    throttleLabel.textContent = 'Upload Throttle (KB/s, 0 = disabled)'
    throttleLabel.style.color = '#ccc'
    const throttleInput = document.createElement('input')
    throttleInput.type = 'number'
    throttleInput.value = String(this.settings.devUploadThrottleKbps || 0)
    applyInputStyle(throttleInput)
    throttleRow.appendChild(throttleLabel)
    throttleRow.appendChild(throttleInput)
    form.appendChild(throttleRow)

    // Packet Loss
    const lossRow = document.createElement('div')
    const lossLabel = document.createElement('label')
    lossLabel.textContent = 'Packet Loss Rate (%)'
    lossLabel.style.color = '#ccc'
    const lossInput = document.createElement('input')
    lossInput.type = 'number'
    lossInput.min = '0'
    lossInput.max = '100'
    lossInput.value = String(this.settings.devPacketLossPercent || 0)
    applyInputStyle(lossInput)
    lossRow.appendChild(lossLabel)
    lossRow.appendChild(lossInput)
    form.appendChild(lossRow)
    
    // Server Error
    const errRow = document.createElement('div')
    const errLabel = document.createElement('label')
    errLabel.textContent = 'Server Error Rate (5xx) (%)'
    errLabel.style.color = '#ccc'
    const errInput = document.createElement('input')
    errInput.type = 'number'
    errInput.min = '0'
    errInput.max = '100'
    errInput.value = String(this.settings.devServerErrorPercent || 0)
    applyInputStyle(errInput)
    errRow.appendChild(errLabel)
    errRow.appendChild(errInput)
    form.appendChild(errRow)

    // Timeout Rate
    const timeoutRow = document.createElement('div')
    const timeoutLabel = document.createElement('label')
    timeoutLabel.textContent = 'Timeout Rate (%)'
    timeoutLabel.style.color = '#ccc'
    const timeoutInput = document.createElement('input')
    timeoutInput.type = 'number'
    timeoutInput.min = '0'
    timeoutInput.max = '100'
    timeoutInput.value = String(this.settings.devTimeoutPercent || 0)
    applyInputStyle(timeoutInput)
    timeoutRow.appendChild(timeoutLabel)
    timeoutRow.appendChild(timeoutInput)
    form.appendChild(timeoutRow)

    saveBtn.addEventListener('click', () => {
      this.settings.devSimulationEnabled = masterToggle.checked
      this.settings.devSimulateOffline = offlineToggle.checked
      this.settings.devLatencyMs = parseInt(latencyInput.value, 10) || 0
      this.settings.devUploadThrottleKbps = parseInt(throttleInput.value, 10) || 0
      this.settings.devPacketLossPercent = parseInt(lossInput.value, 10) || 0
      this.settings.devServerErrorPercent = parseInt(errInput.value, 10) || 0
      this.settings.devTimeoutPercent = parseInt(timeoutInput.value, 10) || 0
      this.save()
      overlay.remove()
    })

    listContainer.appendChild(form)
    document.body.appendChild(overlay)
  }
}