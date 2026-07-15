import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export class DslrManager {
  private connected = false
  private cameraModel = ''
  private capturing = false

  async detect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const detect = spawn('gphoto2', ['--auto-detect'])
        let output = ''

        detect.stdout?.on('data', (data: Buffer) => {
          output += data.toString()
        })

        detect.on('close', (code: number | null) => {
          this.connected = code === 0 && output.includes('usb:')
          if (this.connected) {
            const lines = output.split('\n').filter((l) => l.includes('usb:'))
            if (lines.length > 0) {
              this.cameraModel = lines[0].split('usb:')[0].trim()
            }
          }
          resolve(this.connected)
        })

        detect.on('error', () => {
          this.connected = false
          resolve(false)
        })
      } catch {
        this.connected = false
        resolve(false)
      }
    })
  }

  async capture(targetPath?: string): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.connected) {
      return { success: false, error: 'DSLR not connected' }
    }

    if (this.capturing) {
      return { success: false, error: 'Already capturing' }
    }

    this.capturing = true

    return new Promise((resolve) => {
      const photoPath = targetPath || path.join(app.getPath('temp'), `booth_${Date.now()}.jpg`)

      const capture = spawn('gphoto2', [
        '--capture-image-and-download',
        `--filename=${photoPath}`,
        '--force-overwrite',
      ])

      let errorOutput = ''

      capture.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString()
      })

      capture.on('close', (code: number | null) => {
        this.capturing = false

        if (code === 0 && fs.existsSync(photoPath)) {
          resolve({ success: true, path: photoPath })
        } else {
          resolve({
            success: false,
            error: errorOutput || 'Capture failed',
          })
        }
      })

      capture.on('error', (err) => {
        this.capturing = false
        resolve({ success: false, error: err.message })
      })

      setTimeout(() => {
        if (this.capturing) {
          capture.kill()
          this.capturing = false
          resolve({ success: false, error: 'Capture timeout (30s)' })
        }
      }, 30000)
    })
  }

  isConnected(): boolean {
    return this.connected
  }

  getCameraModel(): string {
    return this.cameraModel
  }

  setConnected(connected: boolean): void {
    this.connected = connected
  }
}
