export class CountdownUI {
  private overlay: HTMLElement
  private countdownEl: HTMLDivElement
  private spinnerEl: HTMLDivElement
  private overlayOrigBg: string
  private overlayOrigBackdrop: string

  constructor(overlay: HTMLElement) {
    this.overlay = overlay
    this.overlayOrigBg = (overlay.style as any).background || ''
    this.overlayOrigBackdrop = (overlay.style as any).backdropFilter || ''

    this.spinnerEl = document.createElement('div')
    this.spinnerEl.style.cssText = `
      width: 28px; height: 28px;
      border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff;
      border-radius: 50%; animation: spin 0.8s linear infinite;
      box-sizing: border-box; display: none;
    `
    this.overlay.appendChild(this.spinnerEl)

    this.countdownEl = document.createElement('div')
    this.countdownEl.style.cssText = `
      font-size: 12rem; font-weight: 900; color: rgba(255,255,255,0.9);
      text-shadow: 0 0 60px rgba(0,0,0,0.5);
      transition: opacity 0.1s, transform 0.1s;
      pointer-events: none; user-select: none;
    `
    this.overlay.appendChild(this.countdownEl)
  }

  async play(seconds: number, audioCtx: AudioContext, onLastTick?: () => void, pauseCheck?: () => Promise<void>): Promise<void> {
    Object.assign(this.overlay.style, {
      background: 'rgba(0,0,0,0.35)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      flexDirection: 'column' as any,
      gap: '1rem',
    })
    this.spinnerEl.style.display = 'block'

    for (let i = seconds; i > 0; i--) {
      if (pauseCheck) await pauseCheck()
      this.countdownEl.textContent = String(i)
      this.countdownEl.style.opacity = '1'
      this.countdownEl.style.transform = 'scale(1.2)'

      this.playBeep(audioCtx, i === 1 ? 880 : 660)

      // Fire DSLR prep at "1" — this stops liveview and begins camera readiness
      // steps so that when the countdown hits 0 the shutter fires immediately.
      if (i === 1 && onLastTick) {
        onLastTick()
      }

      await this.delay(500, pauseCheck)
      this.countdownEl.style.transform = 'scale(1)'
      await this.delay(500, pauseCheck)
    }

    this.countdownEl.textContent = ''
    this.countdownEl.style.opacity = '0'
    this.spinnerEl.style.display = 'none'
    Object.assign(this.overlay.style, {
      background: this.overlayOrigBg,
      backdropFilter: this.overlayOrigBackdrop,
      flexDirection: '' as any,
      gap: '',
    })
  }

  private playBeep(audioCtx: AudioContext, frequency: number) {
    try {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      gain.gain.value = 0.3
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.3)
    } catch {}
  }

  private async delay(ms: number, pauseCheck?: () => Promise<void>): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
    if (pauseCheck) await pauseCheck()
  }
}
