export class AudioManager {
  private audioCtx: AudioContext | null = null
  private sinkId: string | undefined

  async setSinkId(deviceId: string) {
    this.sinkId = deviceId
    if (this.audioCtx && 'setSinkId' in this.audioCtx) {
      try {
        await (this.audioCtx as any).setSinkId(deviceId)
      } catch {}
    }
  }

  private getContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext()
      if (this.sinkId && 'setSinkId' in this.audioCtx) {
        ;(this.audioCtx as any).setSinkId(this.sinkId).catch(() => {})
      }
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume()
    }
    return this.audioCtx
  }

  playShutter() {
    try {
      const ctx = this.getContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = 1200
      gain.gain.value = 0.4
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } catch {}
  }

  playBeep(frequency = 660, duration = 0.2) {
    try {
      const ctx = this.getContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      gain.gain.value = 0.3
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch {}
  }
}
