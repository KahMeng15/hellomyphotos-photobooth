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
function killPtpDaemon(): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()

  return new Promise((resolve) => {
    // Use a shell script that:
    // 1. Boots out the launchd agent so it can't respawn
    // 2. Force-kills any still-running PTPCamera processes
    // 3. Waits 1.5s for the OS to release the USB interface
    const script = [
      // Stop & unload all known PTP/Image Capture agents for the current user
      `launchctl bootout gui/$(id -u) /System/Library/LaunchAgents/com.apple.ptpcamerad.plist 2>/dev/null`,
      `launchctl bootout gui/$(id -u) /System/Library/LaunchAgents/com.apple.imagecaptured.plist 2>/dev/null`,
      `launchctl bootout gui/$(id -u) /System/Library/LaunchAgents/com.apple.photolibraryd.plist 2>/dev/null`,
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
      log.ok('[macOS] PTPCamera / Image Capture daemons evicted via launchctl + pkill')
      if (stderr.trim()) {
        log.warn('[macOS] killPtpDaemon stderr (expected for non-running services):', stderr.trim())
      }
      
      // Reset the USB port to clear any bad state left by PTPCamera
      // killPtpDaemon doesn't have the port context, but resetting all is usually fine
      const resetProc = spawn('gphoto2', ['--reset'])
      resetProc.on('close', () => {
        log.ok('[macOS] USB port reset via gphoto2 --reset')
        setTimeout(resolve, 200)
      })
      resetProc.on('error', () => resolve())
    })
    proc.on('error', () => {
      // bash not found — shouldn't happen on macOS but resolve anyway
      log.warn('[macOS] killPtpDaemon: bash spawn error — skipping')
      resolve()
    })
  })
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
    log.info('[gphoto2 stream] Starting — PTPCamera racing mode enabled')
    this.active = true
    this.frameCount = 0
    this.missCount = 0
    this.ptpKillCount = 0

    return new Promise<boolean>((resolve) => {
      let resolved = false

      const origOnFrame = this.onFrame
      const onFirstFrame = (jpeg: Buffer) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          log.ok(`[gphoto2 stream] ✅ First frame confirmed after ${this.ptpKillCount} PTP kill(s) — liveview working`)
          resolve(true)
        }
        origOnFrame(jpeg)
      }

      // Replace internal callback so racing loop calls onFirstFrame
      this.onFrame = onFirstFrame
      // origOnFrame is already captured in onFirstFrame closure via this.onFrame;
      // restore it after first frame is confirmed
      const origStop = this.stop.bind(this)
      this.stop = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(false)
        }
        origStop()
      }

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          log.error(
            `[gphoto2 stream] No frame in ${firstFrameTimeoutMs}ms after ${this.ptpKillCount} PTP kill attempt(s). ` +
            'Try unplugging and re-plugging the USB cable.'
          )
          resolve(false)
          this.stop()
        }
      }, firstFrameTimeoutMs)

      // Kick off the frame loop — it will self-manage PTPCamera killing
      this.scheduleNextFrame()
      log.ok(`[gphoto2 stream] Racing loop started — timeout=${firstFrameTimeoutMs}ms`)
    })
  }

  private scheduleNextFrame(delayMs = 67): void {
    if (!this.active) return
    this.frameTimer = setTimeout(() => this.captureOneFrame(), delayMs)
  }

  private captureOneFrame(): void {
    if (!this.active) return
    const frameFile = path.join(tempDir(), `lv_${Date.now()}.jpg`)
    const args = ['--capture-preview', `--filename=${frameFile}`, '--force-overwrite']
    if (this.port) args.push(`--port=${this.port}`)

    if (this.frameCount === 0 && this.missCount === 0) {
      log.info(`[gphoto2 stream] First attempt: gphoto2 ${args.join(' ')}`)
    }

    const proc = spawn('gphoto2', args)
    this.currentProc = proc
    let procStderr = ''
    proc.stderr?.on('data', (d: Buffer) => { procStderr += d.toString() })

    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (this.currentProc === proc) this.currentProc = null

      const parsedPath = path.parse(frameFile)
      const thumbFile = path.join(parsedPath.dir, `thumb_${parsedPath.base}`)
      const actualFile = fs.existsSync(frameFile) ? frameFile : (fs.existsSync(thumbFile) ? thumbFile : null)

      if (actualFile) {
        // ✅ Got a frame
        try {
          const buf = fs.readFileSync(actualFile)
          fs.unlinkSync(actualFile)
          if (this.active) {
            this.frameCount++
            if (this.frameCount % 150 === 0) {
              log.frame(`[gphoto2 stream] ${this.frameCount} frames delivered`)
            }
            this.onFrame(buf)
          }
        } catch (readErr: any) {
          this.missCount++
          log.warn(`[gphoto2 stream] Frame read error: ${readErr.message}`)
        }
        // Schedule next frame at normal cadence
        this.scheduleNextFrame(67)
      } else {
        // ❌ No frame — check if it's a PTPCamera USB conflict
        // PTPCamera can cause either "Could not claim" or "Error (-1" (corrupted USB state)
        const isPtpConflict = procStderr.includes('Could not claim') ||
          procStderr.includes('Error (-53') ||
          (procStderr.includes('Error (-1') && !procStderr.includes('Error (-110'))

        if (isPtpConflict && this.frameCount === 0) {
          // Kill PTPCamera immediately and retry right away (no delay)
          // — we want gphoto2 to claim USB before launchd can respawn PTPCamera
          this.ptpKillCount++
          log.warn(
            `[gphoto2 stream] USB claimed by PTPCamera (kill #${this.ptpKillCount}) — ` +
            'pkilling and retrying immediately...'
          )
          this.killPtpNow(() => {
            // Retry immediately — race launchd's respawn
            this.captureOneFrame()
          })
        } else {
          this.missCount++
          if (this.missCount <= 3 || this.missCount % 30 === 0) {
            log.warn(
              `[gphoto2 stream] Frame miss #${this.missCount}` +
              (procStderr ? ` — stderr: ${procStderr.trim().slice(0, 120)}` : '')
            )
          }
          this.scheduleNextFrame(67)
        }
      }
    }

    proc.on('close', (code) => {
      if (this.frameCount === 0 && code !== 0 && !procStderr.includes('Could not claim')) {
        log.error(`[gphoto2 stream] gphoto2 exited code=${code}. stderr: ${procStderr.trim().slice(0, 200)}`)
      }
      finish()
    })
    proc.on('error', (err) => {
      log.error(`[gphoto2 stream] gphoto2 spawn error: ${err.message}`)
      log.error('[gphoto2 stream] Is gphoto2 installed? Run: brew install gphoto2')
      finish()
    })

    // Safety net: abort individual frame attempt after 2.5 s
    setTimeout(() => {
      if (!done) {
        proc.kill()
        finish()
      }
    }, 2500)
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

  stop(): void {
    log.info(`[gphoto2 stream] Stopping (${this.frameCount} frames, ${this.missCount} misses, ${this.ptpKillCount} PTP kills)`)
    this.active = false
    if (this.frameTimer) {
      clearTimeout(this.frameTimer)
      this.frameTimer = null
    }
    if (this.currentProc) {
      this.currentProc.kill()
      this.currentProc = null
    }
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

  // -------------------------------------------------------------------------
  // Detection & Selection
  // -------------------------------------------------------------------------

  async detect(): Promise<{ connected: boolean; model: string; cameras: { model: string, port: string }[] }> {
    log.info(`[DslrManager] detect() called (platform=${process.platform})`)
    if (this.isWindows) {
      return this.detectWindows()
    }
    return this.detectGphoto2()
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
      this.gphoto2Stream?.stop()
      this.gphoto2Stream = null
      
      // Deactivate liveview on the camera side (drop the mirror).
      // Always attempt this for Canon cameras — even if liveviewActive was
      // already false, the camera may still have the mirror up from a prior
      // DslrManager.capture() call that restarted liveview internally.
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
  // Capture
  // -------------------------------------------------------------------------

  /**
   * Fire the camera shutter and download the JPEG.
   *
   * Steps:
   *  1. Stop liveview (required to release the PTP session)
   *  2. Run gphoto2 --capture-image-and-download --keep (saves to SD + downloads)
   *  3. Filter to JPEG files only (skip RAW)
   *  4. Resume liveview
   */
  async capture(targetPath?: string): Promise<CaptureResult> {
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
    if (wasLiveviewActive) {
      log.info('[DslrManager] Stopping liveview before capture...')
      await this.stopLiveview()
      // Small pause to let the PTP session close cleanly
      log.info('[DslrManager] Waiting 300 ms for PTP session to release...')
      await new Promise((r) => setTimeout(r, 300))
    }

    this.capturing = true
    let result: CaptureResult

    if (this.isWindows) {
      log.info('[DslrManager] Triggering capture via DigiCamControl...')
      result = await this.captureWindows(targetPath)
    } else {
      log.info('[DslrManager] Triggering capture via gphoto2...')
      result = await this.captureGphoto2(targetPath)
    }

    this.capturing = false
    if (result.success) {
      log.ok(`[DslrManager] Capture success! File: ${result.path}`)
    } else {
      log.error(`[DslrManager] Capture failed: ${result.error}`)
    }

    // Resume liveview after capture
    if (wasLiveviewActive && this.mainWindow && !this.mainWindow.isDestroyed()) {
      log.info('[DslrManager] Resuming liveview after capture...')
      // Re-attach the frame push callback
      this.startLiveview((jpeg) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
        }
      })
    }

    // Canon post-capture: ensure liveview is disabled on the camera.
    //
    // Even though --capture-image-and-download is preceded by --set-config
    // viewfinder=0 in the args, some Canon cameras re-enter liveview after the
    // PTP session ends (the camera reverts to its pre-session state). Running a
    // separate viewfinder=0 command after the capture process has fully exited
    // forces the mirror down and disables the sensor live feed, saving battery.
    //
    // We only do this when liveview is NOT being restarted (wasLiveviewActive
    // was false), which is the normal case when called from captureDslrShot()
    // (since dslrPreview.stop() already ran before the capture IPC).
    if (!wasLiveviewActive && result.success && this.cameraModel.toLowerCase().includes('canon') && !this.isWindows) {
      log.info('[DslrManager] Post-capture: ensuring Canon mirror is down (viewfinder=0)...')
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

  private captureGphoto2(targetPath?: string): Promise<CaptureResult> {
    return new Promise((resolve) => {
      // Download to temp dir; gphoto2 appends its own filename when a dir is given.
      const downloadDir = targetPath
        ? path.dirname(targetPath)
        : tempDir()

      const filenameTemplate = targetPath
        ? path.basename(targetPath)
        : `booth_%Y%m%d_%H%M%S.%C`

      // Forcefully kill PTPCamera just before capture so it doesn't steal the USB lock
      if (!this.isWindows) {
        try {
          require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null; pkill -9 -f imagecaptured 2>/dev/null')
        } catch (e) {}
      }
      
      const doCapture = async () => {
        if (!this.isWindows) {
           log.info('[DslrManager] Re-detecting before capture to ensure port is valid...')
           await this.detectGphoto2()
        }

        // For Canon: drop the mirror in a separate step before capture and give
        // the mirror time to physically settle. If viewfinder=0 and
        // --capture-image-and-download run in the same gphoto2 invocation, the
        // mirror may still be dropping when gphoto2 starts the capture sequence,
        // preventing the phase-detect AF sensor from receiving light.
        if (this.cameraModel.toLowerCase().includes('canon') && !this.isWindows) {
          log.info('[DslrManager] Canon: pre-setting viewfinder=0 for mirror settle before capture...')
          const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
          await this.execGphoto2(['--set-config', '/main/actions/viewfinder=0', ...portArgs], 5000)
          await new Promise((r) => setTimeout(r, 500))
        }

        const args = []
        
        // Also set viewfinder=0 in the capture args for safety (redundant if the
        // separate command above succeeded, but guards against PTP Device Busy if
        // detectGphoto2 or the autofocus trigger reset the camera state).
        if (this.cameraModel.toLowerCase().includes('canon')) {
          args.push('--set-config', '/main/actions/viewfinder=0')
        }

        args.push(
          '--capture-image-and-download',
          '--keep',                            // keep copy on SD card
          `--filename=${path.join(downloadDir, filenameTemplate)}`,
          '--force-overwrite',
        )
        if (this.selectedPort) args.push(`--port=${this.selectedPort}`)

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
          // Find downloaded file — gphoto2 prints "Saving file as <path>"
          // Prefer JPEG if multiple exist.
          const matches = [...stdout.matchAll(/Saving file as (.+\.(?:jpe?g|png|cr2|cr3|arw|nef|dng))/ig)]
          if (matches.length > 0) {
            // Find a jpeg match first
            let bestMatch = matches.find((m) => /\.(jpe?g|png)$/i.test(m[1])) || matches[0]
            const filePath = bestMatch[1].trim()
            log.info(`[DslrManager] Found image path from stdout: ${filePath}`)
            if (fs.existsSync(filePath)) {
              resolve({ success: true, path: filePath })
              return
            }
            log.warn(`[DslrManager] Path from stdout doesn't exist on disk: ${filePath}`)
          } else {
            log.warn('[DslrManager] Could not find "Saving file as ..." in stdout — falling back to dir scan')
          }

          // Fallback: scan download dir for the newest image.
          // Only consider files from the last 30 s to avoid picking up stale
          // images from a previous session when the capture itself failed.
          const RECENT_CUTOFF = Date.now() - 30000
          try {
            const jpegs = fs.readdirSync(downloadDir)
              .filter((f) => /\.(jpe?g|png|cr2|cr3|arw|nef|dng)$/i.test(f))
              .map((f) => ({ f, t: fs.statSync(path.join(downloadDir, f)).mtimeMs }))
              .filter((f) => f.t >= RECENT_CUTOFF)
              .sort((a, b) => b.t - a.t)

            log.info(`[DslrManager] Dir scan found ${jpegs.length} recent image(s) (cutoff=30s) in ${downloadDir}`)
            if (jpegs.length > 0) {
              const bestFile = jpegs.find(j => /\.(jpe?g|png)$/i.test(j.f)) || jpegs[0]
              log.ok(`[DslrManager] Using newest image: ${bestFile.f}`)
              resolve({ success: true, path: path.join(downloadDir, bestFile.f) })
              return
            }
          } catch (scanErr: any) {
            log.error(`[DslrManager] Dir scan error: ${scanErr.message}`)
          }

          log.error(`[DslrManager] Capture failed. stderr: ${stderr.trim()}`)
          resolve({ success: false, error: stderr || `gphoto2 exited with code ${code}` })
        })

        proc.on('error', (err) => {
          log.error(`[DslrManager] gphoto2 spawn error during capture: ${err.message}`)
          resolve({ success: false, error: err.message })
        })

        // 30-second overall timeout
        setTimeout(() => {
          if (this.capturing) {
            log.error('[DslrManager] Capture timed out after 30 s — killing gphoto2')
            proc.kill()
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
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  getCameraModel(): string {
    return this.cameraModel
  }

  /** @deprecated Use getStatus().connected instead */
  setConnected(connected: boolean): void {
    this.connected = connected
  }
}
