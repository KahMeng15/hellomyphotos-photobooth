export class CameraManager {
  private stream: MediaStream | null = null

  async startWebcam(): Promise<MediaStream | null> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: 'user',
        },
        audio: false,
      })
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
      const imageCapture = new (ImageCapture as any)(videoTrack)
      const blob: Blob = await imageCapture.takePhoto()

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
