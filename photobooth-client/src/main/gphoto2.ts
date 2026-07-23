/**
 * gphoto2.ts — DSLR / Mirrorless camera integration
 *
 * Supports two backends, selected automatically at runtime:
 *  • macOS / Linux: gphoto2 CLI (install via `brew install gphoto2`)
 *  • Windows:       DigiCamControl HTTP API (http://localhost:5513)
 *
 * Features
 *  • Auto-detect connected cameras via USB
 *  • Live preview JPEG stream at ~15 FPS pushed as base64 to the renderer
 *  • Capture: stop liveview → fire shutter → download JPEG → resume liveview
 *  • Save to both SD card and PC (--keep flag / DigiCamControl default)
 *  • JPEG-only download (RAW files are skipped)
 *  • Periodic disconnect detection (every 5 s) with event emission
 */

import { spawn, ChildProcess } from 'child_process'
import http from 'http'
import path from 'path'
import fs from 'fs'
import { app, BrowserWindow } from 'electron'

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Structured logger for the DSLR pipeline.
 * All output is prefixed with [DSLR] and a timestamp so you can grep the
 * Electron main-process terminal for camera-related activity.
 */
const log = {
  info:  (...args: any[]) => console.log( `[DSLR][${ts()}] ℹ`, ...args),
  ok:    (...args: any[]) => console.log( `[DSLR][${ts()}] ✅`, ...args),
  warn:  (...args: any[]) => console.warn(`[DSLR][${ts()}] ⚠️`, ...args),
  error: (...args: any[]) => console.error(`[DSLR][${ts()}] ❌`, ...args),
  frame: (...args: any[]) => console.log( `[DSLR][${ts()}] 🎞`, ...args),
}

function ts(): string {
  return new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DslrStatus {
  connected: boolean
  model: string
  cameras: { model: string; port: string }[]
  selectedPort: string | null
  liveviewActive: boolean
  configChoices?: Record<string, string[]>
}

export interface CaptureResult {
  success: boolean
  path?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a writable temp directory for downloaded frames / captures. */
function tempDir(): string {
  return app.getPath('temp')
}

/**
 * Kill the macOS PTPCamera daemon permanently (prevents auto-respawn) so
 * that gphoto2 can claim the USB camera interface.
 *
 * macOS auto-launches PTPCamera via launchd when a camera is plugged in.
 * `killall` alone doesn't work because launchd immediately respawns the
 * process. We must use `launchctl bootout` to evict the service from launchd
 * first, then kill any remaining instances.
 *
 * Safe to call on non-macOS — it no-ops on Windows/Linux.
 */
export function killPtpDaemon(): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()

  return new Promise((resolve) => {
    // Use a shell script that:
    // 1. Boots out the launchd agent so it can't respawn
    // 2. Disables the service so launchd won't re-load it on USB reconnect
    // 3. Force-kills any still-running PTPCamera processes
    // 4. Waits 1.5s for the OS to release the USB interface
    const UID = `gui/$(id -u)`
    const script = [
      // Disable so launchd won't re-load when the USB device re-appears
      `launchctl disable ${UID}/com.apple.ptpcamerad 2>/dev/null`,
      `launchctl disable ${UID}/com.apple.imagecaptured 2>/dev/null`,
      `launchctl disable ${UID}/com.apple.PTPCamera 2>/dev/null`,
      // Stop & unload
      `launchctl bootout ${UID} /System/Library/LaunchAgents/com.apple.ptpcamerad.plist 2>/dev/null`,
      `launchctl bootout ${UID} /System/Library/LaunchAgents/com.apple.imagecaptured.plist 2>/dev/null`,
      `launchctl bootout ${UID} /System/Library/LaunchAgents/com.apple.photolibraryd.plist 2>/dev/null`,
      // Hard-kill any process still holding the camera
      `pkill -9 -f PTPCamera 2>/dev/null`,
      `pkill -9 -f imagecaptured 2>/dev/null`,
      `pkill -9 -f "Image Capture Extension" 2>/dev/null`,
      `pkill -9 -f "com.apple.photos.ImageCaptureService" 2>/dev/null`,
      // Also kill any gphoto2 processes that might be holding the device
      `pkill -9 -f gphoto2 2>/dev/null`,
      `exit 0`,
    ].join('; ')

    const proc = spawn('bash', ['-c', script])
    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', () => {
      log.ok('[macOS] PTPCamera / Image Capture daemons evicted + disabled via launchctl')
      if (stderr.trim()) {
        log.warn('[macOS] killPtpDaemon stderr (expected for non-running services):', stderr.trim())
      }

      const resetProc = spawn('gphoto2', ['--reset'])
      resetProc.on('close', () => {
        log.ok('[macOS] USB port reset via gphoto2 --reset')
        setTimeout(resolve, 200)
      })
      resetProc.on('error', () => resolve())
    })
    proc.on('error', () => {
      log.warn('[macOS] killPtpDaemon: bash spawn error — skipping')
      resolve()
    })
  })
}

/** Re-enable macOS daemons that killPtpDaemon disabled (call on app quit). */
export function enablePtpDaemon(): void {
  if (process.platform !== 'darwin') return
  const UID = `gui/$(id -u)`
  const script = [
    `launchctl enable ${UID}/com.apple.ptpcamerad 2>/dev/null`,
    `launchctl enable ${UID}/com.apple.imagecaptured 2>/dev/null`,
    `launchctl enable ${UID}/com.apple.PTPCamera 2>/dev/null`,
    `launchctl bootstrap ${UID} /System/Library/LaunchAgents/com.apple.ptpcamerad.plist 2>/dev/null`,
    `launchctl bootstrap ${UID} /System/Library/LaunchAgents/com.apple.imagecaptured.plist 2>/dev/null`,
    `exit 0`,
  ].join('; ')
  spawn('bash', ['-c', script])
  log.info('[macOS] PTPCamera / Image Capture daemons re-enabled')
}


/**
 * Download a URL to a buffer using Node's built-in `http` module.
 * Used for DigiCamControl live.jpg polling on Windows.
 */
function httpGetBuffer(url: string, timeoutMs = 3000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('HTTP timeout'))
    })
    req.on('error', reject)
  })
}

/**
 * Perform a fire-and-forget HTTP GET to DigiCamControl.
 * Returns parsed JSON or throws.
 */
function dccGet(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:5513${path}`
    const req = http.get(url, (res) => {
      let data = ''
      res.on('data', (chunk: string) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(data) // might be plain text
        }
      })
      res.on('error', reject)
    })
    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error('DCC timeout'))
    })
    req.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// DigiCamControl adapter (Windows)
// ---------------------------------------------------------------------------

/** Communicates with the DigiCamControl HTTP API running on localhost:5513. */
class DigiCamControlAdapter {
  private liveviewTimer: NodeJS.Timeout | null = null
  private frameCallback: ((jpeg: Buffer) => void) | null = null

  async detect(): Promise<{ connected: boolean; model: string }> {
    log.info('[DCC] Detecting camera via DigiCamControl HTTP API...')
    try {
      const data = await dccGet('/camera1/')
      log.info('[DCC] Raw detect response:', JSON.stringify(data))
      const connected = data?.IsConnected === true || data?.IsConnected === 'true'
      const model = data?.Name || data?.DeviceName || ''
      if (connected) {
        log.ok(`[DCC] Camera detected: ${model}`)
      } else {
        log.warn('[DCC] No camera connected (IsConnected=false or missing)')
      }
      return { connected, model }
    } catch (err: any) {
      log.error('[DCC] detect() failed:', err.message)
      return { connected: false, model: '' }
    }
  }

  startLiveview(onFrame: (jpeg: Buffer) => void): void {
    if (this.liveviewTimer) {
      log.warn('[DCC] startLiveview() called but already active — ignoring')
      return
    }
    log.info('[DCC] Starting liveview polling at ~15 FPS from http://localhost:5513/liveview.jpg')
    this.frameCallback = onFrame
    let frameCount = 0
    let missCount = 0
    // Poll at ~15 FPS
    const INTERVAL_MS = 67
    const poll = async () => {
      try {
        const buf = await httpGetBuffer('http://localhost:5513/liveview.jpg', 2000)
        if (buf.length > 0 && this.frameCallback) {
          frameCount++
          if (frameCount === 1) log.ok(`[DCC] First liveview frame received (${buf.length} bytes)`)
          if (frameCount % 150 === 0) log.frame(`[DCC] Liveview running — ${frameCount} frames delivered`)
          this.frameCallback(buf)
        } else {
          log.warn(`[DCC] poll() returned empty buffer (${buf.length} bytes)`)
        }
      } catch (err: any) {
        missCount++
        if (missCount === 1 || missCount % 30 === 0) {
          log.warn(`[DCC] Frame miss #${missCount}: ${err.message}`)
        }
      }
    }
    // Start immediately then repeat
    void poll()
    this.liveviewTimer = setInterval(poll, INTERVAL_MS)
    log.ok('[DCC] Liveview poll timer started')
  }

  stopLiveview(): void {
    if (this.liveviewTimer) {
      log.info('[DCC] Stopping liveview poll timer')
      clearInterval(this.liveviewTimer)
      this.liveviewTimer = null
    } else {
      log.warn('[DCC] stopLiveview() called but timer was not running')
    }
    this.frameCallback = null
    log.ok('[DCC] Liveview stopped')
  }

  async capture(targetPath: string): Promise<CaptureResult> {
    try {
      // capturenoaf = capture without re-triggering autofocus
      await dccGet('/camera1/capturenoaf')
      // DigiCamControl saves to its configured folder; we wait for the file
      // to appear or fall back to the most recent file in the download dir.
      // Give the camera up to 15 s to transfer the file.
      const deadline = Date.now() + 15000
      while (Date.now() < deadline) {
        if (fs.existsSync(targetPath)) {
          return { success: true, path: targetPath }
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      return { success: false, error: 'Capture timeout — file not found' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  isLiveviewActive(): boolean {
    return this.liveviewTimer !== null
  }
}

// ---------------------------------------------------------------------------
// gphoto2 liveview (macOS / Linux)
// ---------------------------------------------------------------------------

/**
 * Pumps JPEG preview frames from gphoto2 --capture-preview at ~15 FPS.
 *
 * start() returns a Promise<boolean> that resolves true when the first frame
 * arrives (proving the camera is accessible), or false if no frame arrives
 * within the timeout.
 *
 * PTPCamera racing strategy:
 *   macOS auto-launches PTPCamera via launchd when a camera is plugged in.
 *   `killall` alone fails because launchd respawns it within ~200 ms.
 *   This class detects the 'Could not claim' error on each frame attempt and
 *   immediately pkill -9s PTPCamera before retrying gphoto2 (no settle delay).
 *   launchd throttles the service after 3 rapid crashes (~10 s cool-off), so
 *   gphoto2 wins the race within a few seconds of repeated kill + retry cycles.
 */
class Gphoto2LiveviewStream {
  private onFrame: (jpeg: Buffer) => void
  private port: string | null
  private active = false
  private frameTimer: NodeJS.Timeout | null = null
  private frameCount = 0
  private missCount = 0
  // Track PTPCamera kills during startup to surface helpful log messages
  private ptpKillCount = 0

  constructor(onFrame: (jpeg: Buffer) => void, port: string | null = null) {
    this.onFrame = onFrame
    this.port = port
  }

  /**
   * Start pumping frames.
   * @param firstFrameTimeoutMs How long to wait for the first real frame
   *   before declaring the camera inaccessible. 20 s is recommended to
   *   give the PTPCamera racing loop enough time to win.
   */
  start(firstFrameTimeoutMs = 20000): Promise<boolean> {
    if (this.active) {
      log.warn('[gphoto2 stream] start() called but already active')
      return Promise.resolve(true)
    }
    log.info('[gphoto2 stream] Starting MJPEG stream mode')
    this.active = true
    this.frameCount = 0
    this.missCount = 0
    this.ptpKillCount = 0

    return new Promise<boolean>((resolve) => {
      let resolved = false
      let buffer = Buffer.alloc(0)
      
      const args = ['--capture-movie', '--stdout']
      if (this.port) args.push(`--port=${this.port}`)

      this.currentProc = spawn('gphoto2', args)

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          log.error(`[gphoto2 stream] No MJPEG frame in ${firstFrameTimeoutMs}ms.`)
          resolve(false)
          this.stop()
        }
      }, firstFrameTimeoutMs)

      this.currentProc.stdout.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        
        // Find JPEG start (FF D8) and end (FF D9)
        let startIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]))
        while (startIdx !== -1) {
          const endIdx = buffer.indexOf(Buffer.from([0xff, 0xd9]), startIdx + 2)
          if (endIdx !== -1) {
            // We have a full frame!
            const frame = buffer.slice(startIdx, endIdx + 2)
            buffer = buffer.slice(endIdx + 2)
            
            this.frameCount++
            if (this.frameCount % 150 === 0) {
              log.frame(`[gphoto2 stream] ${this.frameCount} frames delivered via MJPEG`)
            }
            this.onFrame(frame)
            
            if (!resolved) {
               resolved = true
               clearTimeout(timeout)
               log.ok(`[gphoto2 stream] ✅ First MJPEG frame confirmed — liveview working`)
               resolve(true)
            }
            
            // Look for next frame
            startIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]))
          } else {
            break // Wait for more data to get the end of this frame
          }
        }
      })
      
      let procStderr = ''
      this.currentProc.stderr?.on('data', (d: Buffer) => {
        procStderr += d.toString()
        if (procStderr.includes('Could not claim') && !resolved) {
          log.warn(`[gphoto2 stream] USB claimed by PTPCamera (kill #${++this.ptpKillCount}) — pkilling and retrying...`)
          this.killPtpNow(() => {
            // Re-spawn the movie capture
            this.currentProc.kill()
            this.start(firstFrameTimeoutMs)
          })
        }
      })

      this.currentProc.on('close', (code: number) => {
        if (this.frameCount === 0 && code !== 0 && !procStderr.includes('Could not claim')) {
          log.error(`[gphoto2 stream] MJPEG stream exited code=${code}. stderr: ${procStderr.trim().slice(0, 200)}`)
        }
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(false)
        }
        if (this.active) {
          this.active = false
        }
      })
    })
  }

  /**
   * pkill -9 all PTPCamera/ptpcamerad processes, reset the USB port (without
   * a specific port argument to avoid "Port not found"), then re-detect the
   * camera so `this.port` stays valid after the USB re-enumeration.
   *
   * pkill alone is NOT sufficient to clear the USB endpoint stalled state
   * that PTPCamera leaves behind (Error -110 'I/O in progress'). A USB reset
   * via `gphoto2 --reset` is required. But `--reset --port=X` would make
   * port X invalid after the re-enumeration — so we reset without --port,
   * then run --auto-detect to find the fresh USB path.
   */
  private killPtpNow(onDone: () => void): void {
    const detect = () => {
      const det = spawn('gphoto2', ['--auto-detect'])
      let out = ''
      det.stdout?.on('data', (d: Buffer) => { out += d.toString() })
      det.on('close', () => {
        const lines = out.split('\n').filter((l) => l.includes('usb:'))
        if (lines.length > 0) {
          const parts = lines[0].split('usb:')
          this.port = 'usb:' + (parts[1] || '').trim()
        } else {
          this.port = null
        }
        setTimeout(() => {
          onDone()
        }, 500)
      })
      det.on('error', () => {
        setTimeout(() => {
          onDone()
        }, 500)
      })
    }
    const proc = spawn('bash', [
      '-c',
      'pkill -9 -f PTPCamera 2>/dev/null; ' +
      'pkill -9 -f ptpcamerad 2>/dev/null; ' +
      'pkill -9 -f imagecaptured 2>/dev/null; ' +
      'gphoto2 --reset 2>/dev/null; ' +
      'exit 0',
    ])
    proc.on('close', detect)
    proc.on('error', () => { this.port = null; onDone() })
  }

  private currentProc: any = null

  /**
   * Stop the MJPEG stream.
   *
   * Uses SIGKILL (not SIGTERM) to ensure the gphoto2 process dies immediately.
   * SIGTERM leaves gphoto2 trying to gracefully close the PTP session, which can
   * take 20+ seconds on Canon cameras. While gphoto2 is in that dying state, the
   * USB interface is still held, causing the next capture command to hang.
   *
   * Returns a Promise that resolves once the process has fully exited so callers
   * can be sure the USB interface is free before issuing the next gphoto2 command.
   */
  stop(): Promise<void> {
    log.info(`[gphoto2 stream] Stopping (${this.frameCount} frames, ${this.missCount} misses, ${this.ptpKillCount} PTP kills)`)
    this.active = false
    if (this.frameTimer) {
      clearTimeout(this.frameTimer)
      this.frameTimer = null
    }
    if (this.currentProc) {
      const proc = this.currentProc
      this.currentProc = null
      return new Promise<void>((resolve) => {
        const finish = () => {
          log.info('[gphoto2 stream] MJPEG process exited — USB interface released')
          resolve()
        }
        proc.once('close', finish)
        proc.once('error', finish)
        // SIGKILL: no graceful shutdown — we need the USB interface back NOW.
        proc.kill('SIGKILL')
        // Safety timeout: if 'close' never fires within 3 s, unblock anyway.
        setTimeout(() => {
          proc.removeListener('close', finish)
          proc.removeListener('error', finish)
          log.warn('[gphoto2 stream] Timeout waiting for MJPEG process exit — continuing')
          resolve()
        }, 3000)
      })
    }
    return Promise.resolve()
  }

  isActive(): boolean {
    return this.active
  }
}




// ---------------------------------------------------------------------------
// DslrManager — public interface used by ipc.ts and index.ts
// ---------------------------------------------------------------------------

export class DslrManager {
  private connected = false
  private cameraModel = ''
  private cameras: { model: string, port: string }[] = []
  private selectedPort: string | null = null
  private capturing = false
  private liveviewActive = false

  // Windows backend
  private dcc: DigiCamControlAdapter | null = null
  // macOS backend
  private gphoto2Stream: Gphoto2LiveviewStream | null = null

  // Disconnect poll
  private disconnectPollTimer: NodeJS.Timeout | null = null

  // Reference to the main window for pushing events
  private mainWindow: BrowserWindow | null = null

  private get isWindows(): boolean {
    return process.platform === 'win32'
  }

  /** Attach main window reference so DslrManager can push IPC events. */
  setWindow(win: BrowserWindow): void {
    log.info(`[DslrManager] Window reference set (platform=${process.platform})`)
    this.mainWindow = win
  }

  // DSLR config choices (ISO, Shutter Speed, Aperture)
  private configChoices: Record<string, string[]> = {
    iso: ['auto'],
    shutterspeed: ['auto'],
    aperture: ['auto']
  }

  // -------------------------------------------------------------------------
  // Detection & Selection
  // -------------------------------------------------------------------------

  async detect(): Promise<{ connected: boolean; model: string; cameras: { model: string, port: string }[] }> {
    log.info(`[DslrManager] detect() called (platform=${process.platform})`)
    if (this.isWindows) {
      return this.detectWindows()
    }
    const res = await this.detectGphoto2()
    if (res.connected) {
      this.fetchConfigChoices()
    }
    return res
  }

  private async fetchConfigChoices() {
    if (this.isWindows) return
    const keys = ['iso', 'shutterspeed', 'aperture']
    for (const key of keys) {
      try {
        const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
        const res = await this.execGphoto2(['--get-config', key, ...portArgs], 10000)
        if (res.code === 0) {
          const choices = res.stdout.split('\n')
            .filter(l => l.startsWith('Choice:'))
            .map(l => l.replace(/^Choice:\s*\d+\s*/, '').trim())
          if (choices.length > 0) {
            // 'auto' is usually implicitly supported, so we prefix it if not present
            const finalChoices = choices.some(c => c.toLowerCase() === 'auto') ? choices : ['auto', ...choices]
            this.configChoices[key] = finalChoices
            log.info(`[DslrManager] Fetched ${finalChoices.length} choices for ${key}`)
          }
        }
      } catch (err: any) {
        log.warn(`[DslrManager] Failed to fetch choices for ${key}: ${err.message}`)
      }
    }
    // Push an updated status once choices are loaded
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('dslr-status', this.getStatus())
    }
  }

  setCameraPort(port: string): void {
    log.info(`[DslrManager] Setting preferred camera port: ${port}`)
    this.selectedPort = port
    // Update the cameraModel to reflect the selected camera
    const cam = this.cameras.find((c) => c.port === port)
    if (cam) {
      this.cameraModel = cam.model
    }
  }

  async applyExposure(iso: string, shutterspeed: string, aperture: string) {
    if (this.isWindows || !this.connected) return
    log.info(`[DslrManager] Applying exposure settings to camera: iso=${iso}, shutter=${shutterspeed}, aperture=${aperture}`)
    const configArgs = []
    if (iso && iso.toLowerCase() !== 'auto') configArgs.push('--set-config', `iso=${iso}`)
    if (shutterspeed && shutterspeed.toLowerCase() !== 'auto') configArgs.push('--set-config', `shutterspeed=${shutterspeed}`)
    if (aperture && aperture.toLowerCase() !== 'auto') configArgs.push('--set-config', `aperture=${aperture}`)
    
    if (configArgs.length === 0) return

    const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
    const wasLiveview = this.liveviewActive
    if (wasLiveview) {
      log.info('[DslrManager] Stopping liveview temporarily to apply exposure settings')
      this.stopLiveview()
      await new Promise(r => setTimeout(r, 1000))
    }

    try {
      require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null')
    } catch (e) {}

    const res = await this.execGphoto2([...configArgs, ...portArgs], 15000)
    if (res.code !== 0) {
      log.warn(`[DslrManager] Failed to apply exposure settings: ${res.stderr.trim()}`)
    }

    if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
      log.info('[DslrManager] Resuming liveview after applying exposure')
      this.startLiveview((jpeg) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
        }
      })
    }
  }

  private async detectWindows(): Promise<{ connected: boolean; model: string; cameras: { model: string, port: string }[] }> {
    if (!this.dcc) this.dcc = new DigiCamControlAdapter()
    const { connected, model } = await this.dcc.detect()
    this.connected = connected
    this.cameraModel = model
    this.cameras = connected ? [{ model, port: 'default' }] : []
    log.info(`[DslrManager] detectWindows() result: connected=${connected}, model="${model}"`)
    return { connected, model, cameras: this.cameras }
  }

  private detectGphoto2(): Promise<{ connected: boolean; model: string; cameras: { model: string, port: string }[] }> {
    log.info('[DslrManager] Running: gphoto2 --auto-detect')
    return new Promise((resolve) => {
      try {
        const proc = spawn('gphoto2', ['--auto-detect'])
        let output = ''
        let stderr = ''

        proc.stdout?.on('data', (data: Buffer) => {
          output += data.toString()
        })
        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        proc.on('close', (code: number | null) => {
          log.info(`[DslrManager] gphoto2 --auto-detect exited code=${code}`)
          log.info(`[DslrManager] stdout:\n${output.trim() || '(empty)'}`)
          if (stderr) log.warn(`[DslrManager] stderr: ${stderr.trim()}`)

          this.connected = code === 0 && output.includes('usb:')
          if (this.connected) {
            // Extract camera model from gphoto2 output table
            // Format: "Canon EOS 80D           usb:001,005"
            const lines = output.split('\n').filter((l) => l.includes('usb:'))
            this.cameras = lines.map((line) => {
              const parts = line.split('usb:')
              const modelStr = parts[0].trim()
              const portStr = 'usb:' + parts[1].trim()
              return { model: modelStr, port: portStr }
            })

            // USB ports can change when the camera is reset. Try matching by exact port first,
            // then by model name (assuming only one of each model), and finally fallback to the first.
            let selectedCam = this.cameras.find((c) => c.port === this.selectedPort)
            if (!selectedCam) {
              selectedCam = this.cameras.find((c) => c.model === this.cameraModel)
            }
            if (!selectedCam) {
              selectedCam = this.cameras[0]
            }

            if (this.cameras.length > 0) {
              this.cameraModel = selectedCam.model
              this.selectedPort = selectedCam.port
            }
            log.ok(`[DslrManager] Cameras detected: ${this.cameras.length}. Selected: "${this.cameraModel}" (${this.selectedPort})`)
          } else {
            this.cameraModel = ''
            this.cameras = []
            log.warn('[DslrManager] No camera found via gphoto2 --auto-detect')
            if (code !== 0) {
              log.error(`[DslrManager] gphoto2 exited with non-zero code=${code}. Is it installed? Try: which gphoto2`)
            }
          }
          resolve({ connected: this.connected, model: this.cameraModel, cameras: this.cameras })
        })

        proc.on('error', (err) => {
          // gphoto2 not installed or not found in PATH
          log.error(`[DslrManager] gphoto2 spawn error: ${err.message}`)
          log.error('[DslrManager] Make sure gphoto2 is installed: brew install gphoto2')
          this.connected = false
          this.cameraModel = ''
          this.cameras = []
          resolve({ connected: false, model: '', cameras: [] })
        })
      } catch (err: any) {
        log.error(`[DslrManager] detectGphoto2() unexpected error: ${err.message}`)
        this.connected = false
        resolve({ connected: false, model: '', cameras: [] })
      }
    })
  }

  // -------------------------------------------------------------------------
  // Liveview
  // -------------------------------------------------------------------------

  /**
   * Start streaming live preview frames.
   * Kills the macOS PTPCamera daemon first, then starts the frame pump.
   *
   * Returns true if the first real frame was received within 6 s
   * (i.e. the camera is genuinely accessible), false otherwise.
   */
  async startLiveview(onFrame: (jpeg: Buffer) => void): Promise<boolean> {
    log.info(`[DslrManager] startLiveview() called (liveviewActive=${this.liveviewActive}, connected=${this.connected}, platform=${process.platform})`)
    if (this.liveviewActive) {
      log.warn('[DslrManager] startLiveview() ignored — already active')
      return true
    }
    if (!this.connected) {
      log.warn('[DslrManager] startLiveview() called but connected=false — proceeding anyway')
    }

    // On macOS: do an initial broad sweep to evict the PTP daemons from launchd
    // before starting the frame loop. The frame loop then handles any respawns
    // by racing pkill + immediate gphoto2 retry.
    if (!this.isWindows) {
      log.info('[DslrManager] macOS: initial PTPCamera eviction before liveview...')
      await killPtpDaemon()
      log.info('[DslrManager] Re-detecting cameras to fetch new USB ports after eviction...')
      await this.detectGphoto2()
    }

    this.liveviewActive = true

    let firstFrameOk: boolean

    if (this.isWindows) {
      log.info('[DslrManager] Using DigiCamControl backend (Windows)')
      if (!this.dcc) this.dcc = new DigiCamControlAdapter()
      this.dcc.startLiveview(onFrame)
      firstFrameOk = true
    } else {
      if (this.cameraModel.toLowerCase().includes('canon')) {
        log.info('[DslrManager] Attempting to enable EOS viewfinder (Canon only) before liveview...')
        await new Promise<void>((resolve) => {
          const args = ['--set-config', '/main/actions/viewfinder=1']
          if (this.selectedPort) args.push(`--port=${this.selectedPort}`)
          const proc = spawn('gphoto2', args)
          
          let done = false
          const finish = () => {
            if (!done) {
              done = true
              resolve()
            }
          }
          proc.on('close', finish)
          proc.on('error', finish)
          setTimeout(() => {
            if (!done) {
              log.warn('[DslrManager] Viewfinder config timed out')
              proc.kill()
              finish()
            }
          }, 5000)
        })
        log.info('[DslrManager] Waiting 1s for mirror to fully open before streaming...')
        await new Promise((r) => setTimeout(r, 1000))
      }

      log.info('[DslrManager] Using gphoto2 backend — PTPCamera racing mode')
      this.gphoto2Stream = new Gphoto2LiveviewStream(onFrame, this.selectedPort)
      // 20 s timeout: give the racing loop time to exhaust launchd's throttle
      firstFrameOk = await this.gphoto2Stream.start(20000)
    }

    if (!firstFrameOk) {
      log.error('[DslrManager] Liveview failed after 20 s — no frames received. Check USB cable.')
      this.liveviewActive = false
      this.gphoto2Stream = null
      return false
    }

    this.startDisconnectPoll()
    this.pushStatus()
    log.ok('[DslrManager] startLiveview() confirmed — first frame received')
    return true
  }

  /** Stop the live preview stream. */
  async stopLiveview(): Promise<void> {
    const wasActive = this.liveviewActive
    log.info(`[DslrManager] stopLiveview() called (liveviewActive=${wasActive})`)

    this.liveviewActive = false

    if (this.isWindows) {
      this.dcc?.stopLiveview()
    } else {
      // CRITICAL: await the stream stop so the USB interface is fully released
      // before we issue the next gphoto2 command (viewfinder=0 or capture).
      // stop() now uses SIGKILL and waits for the process to exit.
      if (this.gphoto2Stream) {
        await this.gphoto2Stream.stop()
        this.gphoto2Stream = null
      }

      // Deactivate liveview on the camera side (drop the mirror).
      // Always attempt this for Canon cameras — even if liveviewActive was
      // already false, the camera may still have the mirror up.
      if (this.cameraModel.toLowerCase().includes('canon')) {
        log.info('[DslrManager] Dropping Canon mirror (viewfinder=0) to deactivate liveview...')
        const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
        for (let i = 0; i < 3; i++) {
          try {
            require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null; pkill -9 -f imagecaptured 2>/dev/null')
          } catch (e) {}
          const res = await this.execGphoto2(['--set-config', '/main/actions/viewfinder=0', ...portArgs], 5000)
          if (res.code === 0) {
            log.ok('[DslrManager] Canon mirror dropped successfully')
            break
          }
          log.warn(`[DslrManager] Canon mirror drop failed (attempt ${i + 1}/3): ${res.stderr.trim()}`)
          if (i < 2) await new Promise(r => setTimeout(r, 1000))
        }
      }
    }

    if (wasActive) {
      this.stopDisconnectPoll()
    }
    this.pushStatus()
    log.ok('[DslrManager] stopLiveview() complete')
  }

  // -------------------------------------------------------------------------
  // Prep capture (called during last second of countdown)
  // -------------------------------------------------------------------------

  private _prepDone = false
  private _returnedFiles: Set<string> = new Set()

  /**
   * Begin capture preparation while the countdown is still running.
   *
   * Steps:
   *  1. Stop liveview (drops mirror, releases PTP session)
   *  2. Wait 300ms for PTP session release
   *  3. Best-effort autofocus trigger (gphoto2 only)
   *
   * When capture() is subsequently called with liveviewStopped:true,
   * it will skip the liveview-stop + PTP-wait steps and just fire the shutter.
   */
  async prepCapture(): Promise<void> {
    log.info(`[DslrManager] prepCapture() called (connected=${this.connected}, liveviewActive=${this.liveviewActive})`)
    // Always set the flag — the renderer already called dslrPreview.stop() (which
    // sends stop-dslr-liveview) before invoking this IPC, so camera liveview may
    // already be off. capture() needs _prepDone=true to know it should resume
    // liveview after the shot even though liveviewActive is now false.
    this._prepDone = true
    if (this.liveviewActive) {
      // stopLiveview() handles viewfinder=0 (mirror drop) for Canon cameras.
      await this.stopLiveview()
    }
    // Trigger autofocus now that the mirror is down (phase-detect AF).
    // We do this unconditionally — liveviewActive is already false by the time
    // prepCapture IPC is called (the renderer calls stop-dslr-liveview first),
    // so the old `if (this.liveviewActive)` guard was always skipping AF.
    if (!this.isWindows && this.connected) {
      log.info('[DslrManager] prepCapture() — triggering autofocus (phase-detect, mirror down)...')
      try {
        // Kill any lingering PTP processes that might block the AF command
        require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null; pkill -9 -f imagecaptured 2>/dev/null')
      } catch (e) {}
      const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
      const afRes = await this.execGphoto2(['--set-config', '/main/actions/autofocusdrive=1', ...portArgs], 6000)
      if (afRes.code === 0) {
        log.ok('[DslrManager] prepCapture() — autofocus triggered successfully')
      } else {
        log.warn(`[DslrManager] prepCapture() — AF trigger returned code=${afRes.code} (non-fatal): ${afRes.stderr.trim().slice(0, 100)}`)
      }
    }
    log.info('[DslrManager] prepCapture() complete')
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  /**
   * Fire the camera shutter and download the JPEG.
   *
   * Steps:
   *  1. Stop liveview (required to release the PTP session) — skipped if liveviewStopped=true
   *  2. Run gphoto2 --capture-image-and-download --keep (saves to SD + downloads)
   *  3. Filter to JPEG files only (skip RAW)
   *  4. Resume liveview
   */
  async capture(options?: { targetPath?: string; iso?: string; shutterSpeed?: string; aperture?: string; liveviewStopped?: boolean }): Promise<CaptureResult> {
    log.info(`[DslrManager] capture() called (connected=${this.connected}, capturing=${this.capturing}, liveviewActive=${this.liveviewActive})`)
    if (!this.connected) {
      log.error('[DslrManager] capture() aborted — camera not connected')
      return { success: false, error: 'No DSLR connected' }
    }
    if (this.capturing) {
      log.warn('[DslrManager] capture() aborted — already capturing')
      return { success: false, error: 'Already capturing' }
    }

    const wasLiveviewActive = this.liveviewActive
    const wasPrepped = this._prepDone
    this._prepDone = false

    // If prepCapture() already ran during the countdown, camera liveview was
    // already stopped and PTP session released — skip the stop+wait.
    if (wasLiveviewActive && !wasPrepped) {
      log.info('[DslrManager] Stopping liveview before capture...')
      await this.stopLiveview()
      log.info('[DslrManager] Waiting 300 ms for PTP session to release...')
      await new Promise((r) => setTimeout(r, 300))
    }

    this.capturing = true
    let result: CaptureResult

    if (this.isWindows) {
      log.info('[DslrManager] Triggering capture via DigiCamControl...')
      result = await this.captureWindows(options?.targetPath)
    } else {
      log.info('[DslrManager] Triggering capture via gphoto2...')
      result = await this.captureGphoto2(options)
    }

    this.capturing = false
    if (result.success) {
      log.ok(`[DslrManager] Capture success! File: ${result.path}`)
    } else {
      log.error(`[DslrManager] Capture failed: ${result.error}`)
    }

    // Do NOT restart liveview internally here.
    //
    // Previously this method called startLiveview() after capture, but that
    // created a race condition: the renderer's BoothApp independently calls
    // start-dslr-liveview (via dslrPreview.start()) between shots. Having two
    // concurrent callers manage liveview caused USB state inconsistencies that
    // made the second capture hang for ~21 seconds.
    //
    // The renderer is the single source of truth for liveview lifecycle:
    //   - Between shots: BoothApp checks dslrPreview.isActive() and calls start()
    //   - After all shots: BoothApp calls dslrPreview.stop()
    // The camera's mirror is already down from the viewfinder=0 command that runs
    // inside captureGphoto2() before --capture-image-and-download, so no extra
    // cleanup is needed here.
    log.info('[DslrManager] capture() complete — liveview restart delegated to renderer')

    return result
  }

  /** Run a gphoto2 command and collect stdout/stderr/exit code. */
  private execGphoto2(args: string[], timeoutMs = 15000): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('gphoto2', args)
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      const timer = setTimeout(() => {
        proc.kill()
        resolve({ code: null, stdout, stderr })
      }, timeoutMs)
      proc.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code, stdout, stderr })
      })
      proc.on('error', () => {
        clearTimeout(timer)
        resolve({ code: null, stdout, stderr })
      })
    })
  }

  private captureGphoto2(options?: { targetPath?: string; iso?: string; shutterSpeed?: string; aperture?: string }): Promise<CaptureResult> {
    return new Promise((resolve) => {
      const targetPath = options?.targetPath
      const downloadDir = targetPath
        ? path.dirname(targetPath)
        : tempDir()

      const filenameTemplate = targetPath
        ? path.basename(targetPath)
        : `booth_%Y%m%d_%H%M%S.%C`

      // Record timestamp before capture so the fallback scan only accepts
      // files created during THIS capture attempt, not previous ones.
      const captureStartTime = Date.now()

      if (!this.isWindows) {
        try {
          require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null; pkill -9 -f imagecaptured 2>/dev/null')
        } catch (e) {}
      }

      const doCapture = async () => {
        const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []

        // For Canon cameras: explicitly drop the mirror (viewfinder=0) in a
        // SEPARATE gphoto2 call BEFORE capture-image-and-download.
        // Mixing --set-config with --capture-image-and-download in one invocation
        // is unreliable — some firmware versions ignore the config or reset the
        // capture pipeline, causing intermittent failures.
        if (this.cameraModel.toLowerCase().includes('canon')) {
          log.info('[DslrManager] Ensuring mirror is down (viewfinder=0) before capture...')
          const dropRes = await this.execGphoto2(['--set-config', '/main/actions/viewfinder=0', ...portArgs], 5000)
          if (dropRes.code !== 0) {
            log.warn(`[DslrManager] viewfinder=0 returned code=${dropRes.code} — continuing anyway`)
          }
          // Give the camera a moment to physically drop the mirror before sending
          // the shutter command so the timing is correct.
          await new Promise((r) => setTimeout(r, 300))
        }

        const args = [
          '--capture-image-and-download',
          '--keep',
          `--filename=${path.join(downloadDir, filenameTemplate)}`,
          '--force-overwrite',
          ...portArgs,
        ]

        log.info(`[DslrManager] gphoto2 capture args: ${args.join(' ')}`)
        log.info(`[DslrManager] Download dir: ${downloadDir}`)

        const proc = spawn('gphoto2', args)
        let stdout = ''
        let stderr = ''

        proc.stdout?.on('data', (d: Buffer) => {
          const chunk = d.toString()
          stdout += chunk
          log.info(`[DslrManager] gphoto2 stdout: ${chunk.trim()}`)
        })
        proc.stderr?.on('data', (d: Buffer) => {
          const chunk = d.toString()
          stderr += chunk
          log.warn(`[DslrManager] gphoto2 stderr: ${chunk.trim()}`)
        })

        proc.on('close', (code: number | null) => {
          log.info(`[DslrManager] gphoto2 capture exited code=${code}`)

          const addReturned = (fp: string) => { this._returnedFiles.add(fp); return fp }

          const matches = [...stdout.matchAll(/Saving file as (.+\.(?:jpe?g|png|cr2|cr3|arw|nef|dng))/ig)]
          if (matches.length > 0) {
            let bestMatch = matches.find((m) => /\.(jpe?g|png)$/i.test(m[1])) || matches[0]
            const filePath = bestMatch[1].trim()
            log.info(`[DslrManager] Found image path from stdout: ${filePath}`)
            if (fs.existsSync(filePath)) {
              resolve({ success: true, path: addReturned(filePath) })
              return
            }
            log.warn(`[DslrManager] Path from stdout doesn't exist on disk: ${filePath}`)
          } else {
            log.warn('[DslrManager] Could not find "Saving file as ..." in stdout — falling back to dir scan')
          }

          // Fallback: scan for files newer than captureStartTime that haven't
          // been returned by a previous (failed) capture attempt.
          try {
            const jpegs = fs.readdirSync(downloadDir)
              .filter((f) => /\.(jpe?g|png|cr2|cr3|arw|nef|dng)$/i.test(f))
              .map((f) => ({ f, p: path.join(downloadDir, f), t: fs.statSync(path.join(downloadDir, f)).mtimeMs }))
              .filter((f) => f.t >= captureStartTime && !this._returnedFiles.has(f.p))
              .sort((a, b) => b.t - a.t)

            log.info(`[DslrManager] Dir scan found ${jpegs.length} new image(s) since capture start in ${downloadDir}`)
            if (jpegs.length > 0) {
              const bestFile = jpegs.find(j => /\.(jpe?g|png)$/i.test(j.f)) || jpegs[0]
              log.ok(`[DslrManager] Using newest image: ${bestFile.f}`)
              resolve({ success: true, path: addReturned(bestFile.p) })
              return
            }
          } catch (scanErr: any) {
            log.error(`[DslrManager] Dir scan error: ${scanErr.message}`)
          }

          const errMsg = stderr.trim() || `gphoto2 exited with code ${code}`
          log.error(`[DslrManager] Capture failed. stderr: ${errMsg}`)
          // On failure, attempt to put the mirror back down and reset the camera.
          this.resetCameraAfterFailure()
          resolve({ success: false, error: errMsg })
        })

        proc.on('error', (err) => {
          log.error(`[DslrManager] gphoto2 spawn error during capture: ${err.message}`)
          this.resetCameraAfterFailure()
          resolve({ success: false, error: err.message })
        })

        setTimeout(() => {
          if (this.capturing) {
            log.error('[DslrManager] Capture timed out after 30 s — killing gphoto2')
            proc.kill()
            this.resetCameraAfterFailure()
            resolve({ success: false, error: 'Capture timeout (30 s)' })
          }
        }, 30000)
      }
      doCapture()
    })
  }

  private async captureWindows(targetPath?: string): Promise<CaptureResult> {
    if (!this.dcc) this.dcc = new DigiCamControlAdapter()
    const filePath = targetPath || path.join(tempDir(), `booth_${Date.now()}.jpg`)
    return this.dcc.capture(filePath)
  }

  /**
   * Best-effort camera reset after a failed capture:
   *  1. Kill any stale PTPCamera / gphoto2 processes
   *  2. Drop the mirror (viewfinder=0) so the camera doesn't stay in a
   *     half-open liveview / exposure state with the mirror locked up
   *  3. Clear internal capturing flag so a retry is possible
   */
  private resetCameraAfterFailure(): void {
    log.warn('[DslrManager] resetCameraAfterFailure() — attempting to drop mirror and reset state')
    this.capturing = false

    if (this.isWindows || !this.connected) return

    try {
      require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null; pkill -9 -f imagecaptured 2>/dev/null; pkill -9 -f gphoto2 2>/dev/null')
    } catch (e) {}

    if (this.cameraModel.toLowerCase().includes('canon')) {
      const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
      // Fire-and-forget — drop mirror asynchronously so the capture() caller gets
      // the error result immediately without waiting for the reset.
      setTimeout(async () => {
        for (let i = 0; i < 3; i++) {
          const res = await this.execGphoto2(['--set-config', '/main/actions/viewfinder=0', ...portArgs], 5000)
          if (res.code === 0) {
            log.ok('[DslrManager] resetCameraAfterFailure() — mirror dropped successfully')
            return
          }
          log.warn(`[DslrManager] resetCameraAfterFailure() — mirror drop attempt ${i + 1}/3 failed: ${res.stderr.trim()}`)
          if (i < 2) await new Promise((r) => setTimeout(r, 1000))
        }
        log.error('[DslrManager] resetCameraAfterFailure() — could not drop mirror after 3 attempts')
      }, 100)
    }
  }

  // -------------------------------------------------------------------------
  // Disconnect polling
  // -------------------------------------------------------------------------

  private startDisconnectPoll(): void {
    if (this.disconnectPollTimer) {
      log.warn('[DslrManager] startDisconnectPoll() — timer already running')
      return
    }
    log.info('[DslrManager] Starting disconnect poll every 5 s')
    this.disconnectPollTimer = setInterval(async () => {
      const wasConnected = this.connected
      await this.detect()
      if (wasConnected && !this.connected) {
        log.error(`[DslrManager] Camera disconnected! Sending dslr-disconnected event (was: "${this.cameraModel}")`)
        this.stopLiveview()
        this.mainWindow?.webContents.send('dslr-disconnected', {
          model: this.cameraModel,
        })
      }
      this.pushStatus()
    }, 5000)
  }

  private stopDisconnectPoll(): void {
    if (this.disconnectPollTimer) {
      clearInterval(this.disconnectPollTimer)
      this.disconnectPollTimer = null
    }
  }

  // -------------------------------------------------------------------------
  // Status helpers
  // -------------------------------------------------------------------------

  private pushStatus(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('dslr-status', this.getStatus())
  }

  getStatus(): DslrStatus {
    return {
      connected: this.connected,
      model: this.cameraModel,
      cameras: this.cameras,
      selectedPort: this.selectedPort,
      liveviewActive: this.liveviewActive,
      configChoices: this.configChoices
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  getCameraModel(): string {
    return this.cameraModel
  }

  // -------------------------------------------------------------------------
  // Focus controls
  // -------------------------------------------------------------------------

  /** Set the camera focus mode: 'auto' (AF) or 'manual' (MF). */
  async setFocusMode(mode: 'auto' | 'manual'): Promise<{ success: boolean; error?: string }> {
    if (this.isWindows || !this.connected) {
      return { success: false, error: 'Focus mode change not supported on this platform' }
    }
    log.info(`[DslrManager] setFocusMode(${mode})`)
    const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
    const wasLiveview = this.liveviewActive

    if (wasLiveview) {
      await this.stopLiveview()
      await new Promise(r => setTimeout(r, 500))
    }

    try {
      require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null')
    } catch (e) {}

    // gphoto2 focus mode config: try common paths.
    // IMPORTANT: --set-config expects a SINGLE "key=value" argument, not two separate tokens.
    // Canon EOS cameras typically use focusmode2 for the physical AF/MF switch.
    // '0'=One Shot AF, '1'=AI Servo AF, '4'=MF — but the exact enum varies by model.
    // We try a range of known config paths and values.
    const afValue = mode === 'auto' ? '0' : '3'    // 0=One Shot (AF), 3=MF on most Canon
    const configPaths = [
      `/main/capturesettings/focusmode2=${afValue}`,  // Canon EOS: physical AF/MF selector
      `/main/capturesettings/focusmode=${afValue}`,
      `/main/settings/focusmode=${afValue}`,
      `/main/actions/focusmode=${afValue}`,
    ]
    let success = false
    for (const cfg of configPaths) {
      // Pass key=value as a single argument — this is how gphoto2 --set-config works.
      const res = await this.execGphoto2(['--set-config', cfg, ...portArgs], 5000)
      if (res.code === 0) {
        success = true
        break
      }
    }

    if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
      await this.startLiveview((jpeg) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
        }
      })
    }

    if (success) {
      log.ok(`[DslrManager] Focus mode set to ${mode}`)
      return { success: true }
    }
    log.warn(`[DslrManager] Could not set focus mode to ${mode} — camera may not support it`)
    return { success: false, error: 'Focus mode change not supported by this camera' }
  }

  /** Trigger autofocus. Stops liveview, runs AF, then restarts liveview. */
  async triggerAutofocus(): Promise<{ success: boolean; error?: string }> {
    if (this.isWindows || !this.connected) {
      return { success: false, error: 'Autofocus not supported on this platform' }
    }
    log.info('[DslrManager] triggerAutofocus()')
    const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
    const wasLiveview = this.liveviewActive

    if (wasLiveview) {
      await this.stopLiveview()
      await new Promise(r => setTimeout(r, 500))
    }

    try {
      require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null')
    } catch (e) {}

    try {
      const res = await this.execGphoto2(['--set-config', '/main/actions/autofocusdrive=1', ...portArgs], 10000)
      if (res.code === 0) {
        log.ok('[DslrManager] Autofocus triggered')
        if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
          await this.startLiveview((jpeg) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
            }
          })
        }
        return { success: true }
      }
      if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
        await this.startLiveview((jpeg) => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
          }
        })
      }
      log.warn(`[DslrManager] Autofocus failed: ${res.stderr}`)
      return { success: false, error: res.stderr || 'Autofocus command failed' }
    } catch (err: any) {
      if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
        await this.startLiveview((jpeg) => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
          }
        })
      }
      return { success: false, error: err.message }
    }
  }

  /** Step focus toward the camera (near). Stops/restarts liveview. */
  async triggerFocusNear(): Promise<{ success: boolean; error?: string }> {
    if (this.isWindows || !this.connected) {
      return { success: false, error: 'Manual focus not supported on this platform' }
    }
    log.info('[DslrManager] triggerFocusNear()')
    const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
    const wasLiveview = this.liveviewActive

    if (wasLiveview) {
      await this.stopLiveview()
      await new Promise(r => setTimeout(r, 500))
    }

    try {
      require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null')
    } catch (e) {}

    const commands = [
      ['--set-config', '/main/actions/focusdrive=0', ...portArgs],
      ['--set-config', '/main/actions/manualfocusdrive=-1', ...portArgs],
      ['--set-config', '/main/actions/focusdrive=2', ...portArgs],
    ]
    let lastErr = ''
    for (const args of commands) {
      try {
        const res = await this.execGphoto2(args, 3000)
        if (res.code === 0) {
          log.ok('[DslrManager] Focus step near succeeded')
          if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
            await this.startLiveview((jpeg) => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
              }
            })
          }
          return { success: true }
        }
        lastErr = res.stderr
      } catch (err: any) { lastErr = err.message }
    }

    if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
      await this.startLiveview((jpeg) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
        }
      })
    }
    return { success: false, error: lastErr || 'Focus near not supported by this camera' }
  }

  /** Step focus away from the camera (far). Stops/restarts liveview. */
  async triggerFocusFar(): Promise<{ success: boolean; error?: string }> {
    if (this.isWindows || !this.connected) {
      return { success: false, error: 'Manual focus not supported on this platform' }
    }
    log.info('[DslrManager] triggerFocusFar()')
    const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
    const wasLiveview = this.liveviewActive

    if (wasLiveview) {
      await this.stopLiveview()
      await new Promise(r => setTimeout(r, 500))
    }

    try {
      require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null')
    } catch (e) {}

    const commands = [
      ['--set-config', '/main/actions/focusdrive=1', ...portArgs],
      ['--set-config', '/main/actions/manualfocusdrive=1', ...portArgs],
      ['--set-config', '/main/actions/focusdrive=3', ...portArgs],
    ]
    let lastErr = ''
    for (const args of commands) {
      try {
        const res = await this.execGphoto2(args, 3000)
        if (res.code === 0) {
          log.ok('[DslrManager] Focus step far succeeded')
          if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
            await this.startLiveview((jpeg) => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
              }
            })
          }
          return { success: true }
        }
        lastErr = res.stderr
      } catch (err: any) { lastErr = err.message }
    }

    if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
      await this.startLiveview((jpeg) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
        }
      })
    }
    return { success: false, error: lastErr || 'Focus far not supported by this camera' }
  }

  /** @deprecated Use getStatus().connected instead */
  setConnected(connected: boolean): void {
    this.connected = connected
  }
}
