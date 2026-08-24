export class CountdownUI {
  private overlay: HTMLElement
  private countdownEl: HTMLDivElement

  constructor(overlay: HTMLElement) {
    this.overlay = overlay

    this.countdownEl = document.createElement('div')
    this.countdownEl.className = 'ui-countdown'
    this.overlay.appendChild(this.countdownEl)
  }

  async play(seconds: number, audioCtx: AudioContext, onPrep?: () => void, pauseCheck?: () => Promise<void>, prepAt = 1): Promise<void> {
    const prepTick = Math.ceil(prepAt)
    for (let i = seconds; i > 0; i--) {
      if (pauseCheck) await pauseCheck()
      this.countdownEl.textContent = String(i)
      this.countdownEl.style.opacity = '1'
      this.countdownEl.style.transform = 'scale(1.2)'

      this.playBeep(audioCtx, i === 1 ? 880 : 660)

      if (i === prepTick && onPrep) {
        onPrep()
      }

      await this.delay(500, pauseCheck)
      this.countdownEl.style.transform = 'scale(1)'
      await this.delay(500, pauseCheck)
    }

    this.countdownEl.textContent = ''
    this.countdownEl.style.opacity = '0'
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
