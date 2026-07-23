export class CountdownUI {
  private overlay: HTMLElement
  private countdownEl: HTMLDivElement

  constructor(overlay: HTMLElement) {
    this.overlay = overlay

    this.countdownEl = document.createElement('div')
    this.countdownEl.style.cssText = `
      font-size: 12rem; font-weight: 900; color: rgba(255,255,255,0.9);
      text-shadow: 0 0 60px rgba(0,0,0,0.5);
      transition: opacity 0.1s, transform 0.1s;
      pointer-events: none; user-select: none;
    `
    this.overlay.appendChild(this.countdownEl)
  }

  async play(seconds: number, audioCtx: AudioContext, onLastTick?: () => void): Promise<void> {
    for (let i = seconds; i > 0; i--) {
      this.countdownEl.textContent = String(i)
      this.countdownEl.style.opacity = '1'
      this.countdownEl.style.transform = 'scale(1.2)'

      this.playBeep(audioCtx, i === 1 ? 880 : 660)

      // Trigger DSLR prep at "2" so the mirror has time to drop + AF to run
      // before the shutter fires at the end of the "1" second.
      if (i === 2 && onLastTick) {
        onLastTick()
      }

      await this.delay(500)
      this.countdownEl.style.transform = 'scale(1)'
      await this.delay(500)
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
