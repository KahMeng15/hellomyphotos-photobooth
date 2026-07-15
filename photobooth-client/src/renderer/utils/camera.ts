export class CameraManager {
  private stream: MediaStream | null = null

  async startWebcam(deviceId?: string): Promise<MediaStream | null> {
    try {
      const video: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }
      if (deviceId) {
        video.deviceId = { exact: deviceId }
      } else {
        video.facingMode = 'user'
      }
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      return this.stream
    } catch (err) {
      console.error('Webcam start failed:', err)
      return null
    }
  }

  async captureStill(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.stream) {
      return { success: false, error: 'No webcam stream' }
    }

    try {
      const videoTrack = this.stream.getVideoTracks()[0]
      if (typeof ImageCapture !== 'undefined') {
        try {
          const imageCapture = new (ImageCapture as any)(videoTrack)
          const blob: Blob = await imageCapture.takePhoto()
          const path = URL.createObjectURL(blob)
          return { success: true, path }
        } catch (_e) {}
      }

      const originalTrack = this.stream.getVideoTracks()[0]
      const settings = originalTrack.getSettings()
      const canvas = document.createElement('canvas')
      canvas.width = settings.width || 1280
      canvas.height = settings.height || 720

      const clone = originalTrack.clone()
      const vid = document.createElement('video')
      vid.srcObject = new MediaStream([clone])
      vid.autoplay = true
      vid.muted = true
      await vid.play()

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
      clone.stop()
      vid.srcObject = null

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.92)
      })
      const path = URL.createObjectURL(blob)
      return { success: true, path }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
  }
}
