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
      log.ok('[macOS] PTPCamera / Image Capture daemons evicted + disabled')
      if (stderr.trim()) {
        log.warn('[macOS] killPtpDaemon stderr (expected for non-running services):', stderr.trim())
      }
      // NOTE: gphoto2 --reset is intentionally NOT called here. On Sony cameras
      // the USB reset breaks the PTP session and causes all subsequent gphoto2
      // commands to hang ("PTP Timeout"). pkill alone is sufficient.
      setTimeout(resolve, 500)
    })
    proc.on('error', () => {
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
  private ptpKillCount = 0
  private usingPolling = false
  private currentProc: any = null
  private pollingRetryTimer: NodeJS.Timeout | null = null

  private cameraModel: string

  constructor(onFrame: (jpeg: Buffer) => void, port: string | null = null, cameraModel: string = '') {
    this.onFrame = onFrame
    this.port = port
    this.cameraModel = cameraModel
  }

  /**
   * Start pumping frames.
   *
   * Two-phase approach:
   *   1. Try --capture-movie --stdout (fast MJPEG streaming — Canon/Nikon)
   *   2. If no frame, fall back to polling --capture-preview (Sony, etc.)
   *
   * @param firstFrameTimeoutMs  Budget for Phase 1 (MJPEG). If Phase 1 fails,
   *   Phase 2 (polling) always gets its own dedicated pollingBudgetMs window.
   * @param pollingBudgetMs      Dedicated budget for Phase 2 --capture-preview
   *   polling. This is independent of Phase 1 so Sony cameras are never starved.
   */
  async start(firstFrameTimeoutMs = 15000, pollingBudgetMs = 15000, forcePolling = false): Promise<boolean> {
    if (this.active) {
      log.warn('[gphoto2 stream] start() called but already active')
      return true
    }
    this.active = true
    this.frameCount = 0
    this.missCount = 0
    this.ptpKillCount = 0

    if (forcePolling) {
      // Polling mode uses --capture-preview which physically fires the shutter
      // and writes full-res photos on Canon DSLRs — not a lightweight preview.
      // Force MJPEG for Canon regardless of the setting.
      if (this.cameraModel.toLowerCase().includes('canon')) {
        log.warn('[gphoto2 stream] Canon detected — forcePolling overridden, using MJPEG')
        this.usingPolling = false
      } else {
        log.info('[gphoto2 stream] Polling mode — skipping MJPEG')
        this.usingPolling = true
        const pollingDeadline = Date.now() + pollingBudgetMs
        return this.tryPreviewPolling(pollingDeadline)
      }
    }

    log.info('[gphoto2 stream] Starting liveview (phase 1: MJPEG stream)')
    this.usingPolling = false

    const mjpegDeadline = Date.now() + firstFrameTimeoutMs
    const mjpegOk = await this.tryMjpegStream(mjpegDeadline)
    if (mjpegOk) return true
    if (!this.active) return false

    if (this.cameraModel.toLowerCase().includes('canon')) {
      log.error('[gphoto2 stream] MJPEG failed to produce frames. Skipping Phase 2 polling because it flaps the Canon mirror.')
      return false
    }

    log.info('[gphoto2 stream] MJPEG produced no frames — falling back to --capture-preview polling')
    this.usingPolling = true
    const pollingDeadline = Date.now() + pollingBudgetMs
    return this.tryPreviewPolling(pollingDeadline)
  }

  /**
   * Phase 1: Spawn gphoto2 --capture-movie --stdout and parse MJPEG frames
   * from stdout. Works well for Canon and Nikon cameras that output a
   * continuous MJPEG stream via USB.
   */
  private tryMjpegStream(deadline: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let resolved = false
      let buffer = Buffer.alloc(0)
      let procStderr = ''
      let isRetrying = false

      const remainingMs = Math.max(1, deadline - Date.now())

      const args: string[] = []
      if (this.cameraModel.toLowerCase().includes('canon')) {
        args.push('--set-config', '/main/actions/viewfinder=1', '--wait-event=1s')
      }
      args.push('--capture-movie', '--stdout')
      if (this.port) args.push(`--port=${this.port}`)

      this.currentProc = spawn('gphoto2', args)

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          log.warn(`[gphoto2 stream] No MJPEG frame in ${remainingMs}ms — proceeding to phase 2`)
          resolve(false)
          this.killCurrentProc()
        }
      }, remainingMs)

      this.currentProc.stdout.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])

        let startIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]))
        while (startIdx !== -1) {
          const endIdx = buffer.indexOf(Buffer.from([0xff, 0xd9]), startIdx + 2)
          if (endIdx !== -1) {
            const frame = buffer.slice(startIdx, endIdx + 2)
            buffer = buffer.slice(endIdx + 2)

            this.frameCount++
            if (this.frameCount % 150 === 0) {
              log.frame(`[gphoto2 stream] ${this.frameCount} frames via MJPEG`)
            }
            this.onFrame(frame)

            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              log.ok('[gphoto2 stream] First MJPEG frame confirmed')
              resolve(true)
            }

            startIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]))
          } else {
            break
          }
        }
      })

      this.currentProc.stderr?.on('data', (d: Buffer) => {
        procStderr += d.toString()
        if (procStderr.includes('Could not claim') && !resolved && !isRetrying) {
          isRetrying = true
          log.warn(`[gphoto2 stream] USB claimed by PTPCamera (kill #${++this.ptpKillCount}) — pkilling and retrying...`)
          clearTimeout(timeout)
          this.killCurrentProc()
          this.killPtpNow(() => {
            if (this.active) {
              this.tryMjpegStream(deadline).then((result) => {
                if (!resolved) {
                  resolved = true
                  resolve(result)
                }
              })
            } else {
              if (!resolved) {
                resolved = true
                resolve(false)
              }
            }
          })
        }
      })

      this.currentProc.on('close', (code: number | null) => {
        if (this.frameCount === 0 && !procStderr.includes('Could not claim')) {
          log.warn(`[gphoto2 stream] MJPEG stream exited code=${code}.`)
        }
        if (!resolved && !isRetrying) {
          resolved = true
          clearTimeout(timeout)
          resolve(false)
        }
      })
    })
  }

  /**
   * Phase 2: Poll --capture-preview in a loop at ~3 fps.
   *
   * Each invocation captures a single preview frame to a temp file.
   * This is slower than MJPEG streaming (~1-3 fps vs 15-30 fps) but
   * works with Sony Alpha cameras that don't output MJPEG via USB
   * in photo / PC Remote mode.
   */
  private tryPreviewPolling(deadline: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let resolved = false
      let pollCount = 0

      if (this.frameTimer) {
        clearTimeout(this.frameTimer)
        this.frameTimer = null
      }

      let isPollingActive = true

      const scheduleNextPoll = (delayMs: number) => {
        if (!this.active || !isPollingActive) {
          if (!resolved) { resolved = true; resolve(false) }
          return
        }
        this.frameTimer = setTimeout(doPoll, delayMs)
      }

      const doPoll = async () => {
        if (!isPollingActive || !this.active) {
          if (!resolved) { resolved = true; resolve(false) }
          return
        }

        // Only enforce the deadline until the first frame is confirmed.
        // After that, polling runs indefinitely until stop() is called.
        if (!resolved && Date.now() >= deadline) {
          log.error('[gphoto2 stream] Preview polling timed out — no frames received')
          isPollingActive = false
          resolved = true
          resolve(false)
          return
        }

        pollCount++

        try {
          const args = ['--capture-preview', '--stdout']
          if (this.port) args.push(`--port=${this.port}`)

          const result = await this.execGphoto2Buffer(args, 8000)

          // Check for valid JPEG
          if (result.code === 0 && result.buffer.length > 500 &&
              result.buffer[0] === 0xFF && result.buffer[1] === 0xD8) {
            this.frameCount++
            if (this.frameCount % 30 === 0) {
              log.frame(`[gphoto2 stream] Polling: ${this.frameCount} frames delivered`)
            }
            this.onFrame(result.buffer)

            if (!resolved) {
              resolved = true
              log.ok(`[gphoto2 stream] First preview frame confirmed — liveview working (polling mode)`)
              resolve(true)
              // Keep isPollingActive=true so the loop continues delivering frames
            }
          } else if (result.stderr.includes('Could not claim')) {
            this.missCount++
            log.warn(`[gphoto2 stream] USB claimed during poll #${pollCount} — killing PTPCamera`)
            await this.killPtpNowAsync()
            scheduleNextPoll(100)
            return
          } else {
            this.missCount++
            if (this.missCount <= 3 || this.missCount % 10 === 0) {
              const preview = result.buffer.length > 20 ? result.buffer.slice(0, 20).toString('hex') + '...' : 'empty'
              log.warn(`[gphoto2 stream] Poll #${pollCount}: code=${result.code}, data=${result.buffer.length}b, hex="${preview}"`)
              if (result.stderr.trim()) log.warn(`  stderr: ${result.stderr.trim().slice(0, 150)}`)
            }
          }
        } catch (err: any) {
          this.missCount++
          if (this.missCount % 10 === 0) {
            log.warn(`[gphoto2 stream] Poll miss #${this.missCount}: ${err.message}`)
          }
        }

        scheduleNextPoll(300)
      }

      // Kick off first poll immediately
      this.frameTimer = setTimeout(doPoll, 0)
    })
  }

  /** Run gphoto2 with args, collect text output. */
  private execGphoto2(args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('gphoto2', args)
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
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

  /** Run gphoto2 with args, collect raw stdout buffer (for binary data like JPEG). */
  private execGphoto2Buffer(args: string[], timeoutMs: number): Promise<{ code: number | null; buffer: Buffer; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('gphoto2', args)
      const chunks: Buffer[] = []
      let stderr = ''
      proc.stdout?.on('data', (d: Buffer) => { chunks.push(d) })
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
        resolve({ code: null, buffer: Buffer.concat(chunks), stderr })
      }, timeoutMs)
      proc.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code, buffer: Buffer.concat(chunks), stderr })
      })
      proc.on('error', () => {
        clearTimeout(timer)
        resolve({ code: null, buffer: Buffer.concat(chunks), stderr })
      })
    })
  }

  /** Wrapped killPtpNow that returns a Promise. */
  private killPtpNowAsync(): Promise<void> {
    return new Promise((resolve) => {
      this.killPtpNow(resolve)
    })
  }

  /**
   * pkill -9 all PTPCamera/ptpcamerad processes, reset USB, re-detect camera.
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
        setTimeout(onDone, 500)
      })
      det.on('error', () => setTimeout(onDone, 500))
    }
    const UID = `gui/$(id -u)`
    const proc = spawn('bash', [
      '-c',
      // Disable + bootout PTPCamera from launchd so it can't respawn
      `launchctl disable ${UID}/com.apple.ptpcamerad 2>/dev/null; ` +
      `launchctl disable ${UID}/com.apple.imagecaptured 2>/dev/null; ` +
      `launchctl bootout ${UID} /System/Library/LaunchAgents/com.apple.ptpcamerad.plist 2>/dev/null; ` +
      `launchctl bootout ${UID} /System/Library/LaunchAgents/com.apple.imagecaptured.plist 2>/dev/null; ` +
      `pkill -9 -f PTPCamera 2>/dev/null; ` +
      `pkill -9 -f ptpcamerad 2>/dev/null; ` +
      `pkill -9 -f imagecaptured 2>/dev/null; ` +
      // --reset intentionally omitted — breaks Sony PTP sessions
      'exit 0',
    ])
    proc.on('close', detect)
    proc.on('error', () => { this.port = null; onDone() })
  }

  /** Kill the current MJPEG process without the full stop() ceremony. */
  private killCurrentProc(): void {
    if (this.currentProc) {
      try {
        this.currentProc.kill('SIGKILL')
      } catch {}
      this.currentProc = null
    }
  }

  /**
   * Stop the stream.
   *
   * In MJPEG mode: sends SIGINT then escalates to SIGKILL if needed.
   * In polling mode: stops the poll timer.
   */
  stop(): Promise<void> {
    log.info(`[gphoto2 stream] Stopping (${this.frameCount} frames, ${this.missCount} misses, ${this.ptpKillCount} PTP kills, polling=${this.usingPolling})`)
    this.active = false

    // Clear timers
    if (this.frameTimer) {
      clearTimeout(this.frameTimer)
      this.frameTimer = null
    }
    if (this.pollingRetryTimer) {
      clearTimeout(this.pollingRetryTimer)
      this.pollingRetryTimer = null
    }

    if (this.usingPolling || !this.currentProc) {
      // Polling mode or no active process — just resolve
      log.info('[gphoto2 stream] Stopped (polling or no active process)')
      return Promise.resolve()
    }

    // MJPEG mode: kill the gphoto2 process
    const proc = this.currentProc
    this.currentProc = null
    return new Promise<void>((resolve) => {
      let safetyTimer: NodeJS.Timeout | null = null
      const finish = () => {
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
        log.info('[gphoto2 stream] MJPEG process exited — USB interface released')
        setTimeout(resolve, 300)
      }
      proc.once('close', finish)
      proc.once('error', finish)

      proc.kill('SIGINT')

      safetyTimer = setTimeout(() => {
        log.warn('[gphoto2 stream] SIGINT timeout — escalating to SIGKILL')
        proc.kill('SIGKILL')

        safetyTimer = setTimeout(() => {
          proc.removeListener('close', finish)
          proc.removeListener('error', finish)
          log.warn('[gphoto2 stream] Timeout waiting for MJPEG process exit — continuing')
          resolve()
        }, 1500)
      }, 1500)
    })
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

  /**
   * Registry of every gphoto2 child process spawned by this manager.
   * Used by shutdown() to SIGKILL all of them on app exit so they don't
   * outlive the Electron process and keep holding the USB interface.
   */
  private _childProcs: Set<import('child_process').ChildProcess> = new Set()

  /** Register a child, auto-removing it when it exits. */
  private _trackChild(proc: import('child_process').ChildProcess): import('child_process').ChildProcess {
    this._childProcs.add(proc)
    proc.once('close', () => this._childProcs.delete(proc))
    proc.once('error', () => this._childProcs.delete(proc))
    return proc
  }

  // Operation Mutex to prevent USB collisions between exposure, liveview, and capture
  private _mutex = Promise.resolve()

  private async enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this._mutex.then(async () => {
      try {
        return await fn()
      } catch (err) {
        log.error(`[DslrManager] Operation threw error: ${err}`)
        throw err
      }
    })
    this._mutex = next.catch(() => {}) as Promise<void>
    return next
  }

  // PTP kill cooldown to prevent redundant killPtpDaemon() + detectGphoto2()
  // cycles during sequential startup calls (detect → applyExposure → startLiveview).
  // Once killed+disabled via launchctl, PTPCamera cannot respawn, so subsequent
  // calls within the cooldown window can safely skip the expensive re-detect.
  private _lastPtpKill = 0
  private static PTP_KILL_COOLDOWN = 3000 // ms

  // Number of attempts for starting liveview (1 = no retry)
  private _liveviewRetryAttempts = 1

  setLiveviewRetryAttempts(n: number): void {
    this._liveviewRetryAttempts = Math.max(1, Math.floor(n))
  }

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

  /**
   * Detect connected cameras and refresh port + model.
   *
   * @param skipConfigFetch - If true, skips the fetchConfigChoices() call.
   *   Set true when calling from time-sensitive contexts (disconnect poll,
   *   stopLiveview re-detect) to avoid spawning 3 gphoto2 processes that
   *   hold the USB interface concurrently with capture commands.
   */
  async detect(skipConfigFetch = false): Promise<{ connected: boolean; model: string; cameras: { model: string, port: string }[] }> {
    return this.enqueue(async () => {
      log.info(`[DslrManager] detect() called (platform=${process.platform})`)
      if (this.isWindows) {
        return this.detectWindows()
      }
      const res = await this.detectGphoto2()
      if (res.connected && !skipConfigFetch) {
        // Enqueue fetchConfigChoices through the mutex so it cannot hold
        // the USB interface concurrently with liveview or capture operations.
        // Previously this was fire-and-forget which left stale gphoto2 processes
        // (e.g. "--get-config aperture") holding the USB claim when liveview started.
        this.enqueue(() => this.fetchConfigChoices()).catch(() => {})
      }
      return res
    })
  }

  public async fetchConfigChoices() {
    if (this.isWindows) return
    const keys = ['iso', 'shutterspeed', 'aperture', 'whitebalance']
    for (const key of keys) {
      try {
        const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
        const res = await this.execGphoto2(['--get-config', key, ...portArgs], 10000)
        if (res.code === 0) {
          const choices = res.stdout.split('\n')
            .filter(l => l.startsWith('Choice:'))
            .map(l => l.replace(/^Choice:\s*\d+\s*/, '').trim())
          if (choices.length > 0) {
            this.configChoices[key] = choices
            log.info(`[DslrManager] Fetched ${choices.length} choices for ${key}`)
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

  async getHardwareSettings(): Promise<{ iso: string, shutterspeed: string, aperture: string, whitebalance: string }> {
    return this.enqueue(async () => {
      const hw = { iso: 'auto', shutterspeed: 'auto', aperture: 'auto', whitebalance: 'auto' }
      if (this.isWindows || !this.connected) return hw
      
      const keys = ['iso', 'shutterspeed', 'aperture', 'whitebalance']
      for (const key of keys) {
        try {
          const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
          const res = await this.execGphoto2(['--get-config', key, ...portArgs], 5000)
          if (res.code === 0) {
            const match = res.stdout.match(/Current:\s*(.+)/)
            if (match && match[1]) {
              (hw as any)[key] = match[1].trim()
            }
          }
        } catch (err) {}
      }
      return hw
    })
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

  /**
   * Ensure the USB interface is free for gphoto2 commands by killing the macOS
   * PTPCamera daemon and re-detecting the camera. Uses a cooldown to avoid
   * redundant kill+detect cycles during rapid sequential calls.
   *
   * @param force - Always execute, ignoring cooldown. Use when the USB state
   *   is known to have changed (e.g. after killing an MJPEG stream).
   */
  private async _ensureUsbAccess(force = false): Promise<void> {
    if (this.isWindows) return
    const now = Date.now()
    if (!force && (now - this._lastPtpKill < DslrManager.PTP_KILL_COOLDOWN)) {
      log.info(`[DslrManager] PTP kill cooldown active (${now - this._lastPtpKill}ms ago) — skipping`)
      return
    }
    await killPtpDaemon()
    // Re-detect so the port is refreshed (USB state may have changed after
    // PTPCamera eviction or MJPEG process death).
    if (!this.isWindows) {
      await this.detectGphoto2()
    }
    this._lastPtpKill = now
  }

  /** Apply auto exposure for configs that have a valid "Auto" choice. */
  private async _applyConfigAuto(): Promise<void> {
    const configArgs: string[] = []
    for (const key of ['iso', 'shutterspeed', 'aperture', 'whitebalance'] as const) {
      const choices = this.configChoices[key]
      if (choices && choices.length > 0) {
        const autoVal = choices.find(c => c.toLowerCase() === 'auto')
        if (autoVal) {
          configArgs.push('--set-config', `${key}=${autoVal}`)
        }
      }
    }
    if (configArgs.length > 0) {
      const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
      const res = await this.execGphoto2([...configArgs, ...portArgs], 15000)
      if (res.code === 0) log.ok('[DslrManager] Auto exposure applied')
      else log.warn(`[DslrManager] Auto exposure returned code=${res.code}: ${res.stderr.trim().slice(0, 100)}`)
    }
  }

  async applyExposure(iso: string, shutterspeed: string, aperture: string, whitebalance?: string, whiteBalanceKelvin?: number) {
    return this.enqueue(async () => {
      if (this.isWindows || !this.connected) return

      const wbValue = whitebalance === 'Custom' ? 'Color Temperature' : whitebalance
      log.info(`[DslrManager] Applying exposure settings to camera: iso=${iso}, shutter=${shutterspeed}, aperture=${aperture}, whitebalance=${wbValue || 'unchanged'}${whiteBalanceKelvin !== undefined ? `, kelvin=${whiteBalanceKelvin}` : ''}`)

      const needsAuto = (!iso || iso === 'auto') || (!shutterspeed || shutterspeed === 'auto') || (!aperture || aperture === 'auto') || (wbValue !== undefined && wbValue === 'auto')
      const configArgs: string[] = []
      if (iso && iso.toLowerCase() !== 'auto') configArgs.push('--set-config', `iso=${iso}`)
      if (shutterspeed && shutterspeed.toLowerCase() !== 'auto') configArgs.push('--set-config', `shutterspeed=${shutterspeed}`)
      if (aperture && aperture.toLowerCase() !== 'auto') configArgs.push('--set-config', `aperture=${aperture}`)
      if (wbValue && wbValue.toLowerCase() !== 'auto') {
        let actualWbValue = wbValue
        const choices = this.configChoices['whitebalance']
        if (choices && choices.length > 0) {
          const matched = choices.find(c => c.toLowerCase() === wbValue.toLowerCase())
          if (matched) {
            actualWbValue = matched
          }
        }
        configArgs.push('--set-config', `whitebalance=${actualWbValue}`)
      }
      if (wbValue && wbValue === 'Color Temperature' && whiteBalanceKelvin !== undefined) {
        configArgs.push('--set-config', `/main/imgsettings/colortemperature=${whiteBalanceKelvin}`)
      }

      if (!needsAuto && configArgs.length === 0) return

      const wasLiveview = this.liveviewActive
      const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []

      if (wasLiveview) {
        log.info('[DslrManager] Killing MJPEG stream (keeping mirror up)...')
        if (this.gphoto2Stream) {
          await this.gphoto2Stream.stop()
          this.gphoto2Stream = null
        }
        this.liveviewActive = false
        this.stopDisconnectPoll()
        await new Promise(r => setTimeout(r, 500))
      }

      await this._ensureUsbAccess(wasLiveview)

      if (needsAuto) {
        await this._applyConfigAuto()
      }

      if (configArgs.length > 0) {
        const res = await this.execGphoto2([...configArgs, ...portArgs], 15000)
        if (res.code !== 0) {
          log.warn(`[DslrManager] Failed to apply exposure settings: ${res.stderr.trim()}`)
        } else {
          log.ok('[DslrManager] Exposure settings applied successfully')
        }
      }

      if (wasLiveview && this.mainWindow && !this.mainWindow.isDestroyed()) {
        log.info('[DslrManager] Starting fresh MJPEG stream (mirror is up)...')
        const stream = new Gphoto2LiveviewStream((jpeg) => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
          }
        }, this.selectedPort, this.cameraModel)
        this.liveviewActive = true
        this.gphoto2Stream = stream

        let streamOk = false
        for (let attempt = 1; attempt <= this._liveviewRetryAttempts; attempt++) {
          streamOk = await stream.start(20000, 0)
          if (streamOk) break
          log.warn(`[DslrManager] Stream attempt ${attempt}/${this._liveviewRetryAttempts} failed${attempt < this._liveviewRetryAttempts ? ' — retrying in 1s' : ''}`)
          if (attempt < this._liveviewRetryAttempts) {
            await new Promise(r => setTimeout(r, 1000))
          }
        }

        if (!streamOk) {
          log.warn('[DslrManager] Fresh MJPEG stream failed — retrying with viewfinder cycle')
          this.liveviewActive = false
          this.gphoto2Stream = null
          await this.execGphoto2(['--set-config', '/main/actions/viewfinder=0', ...portArgs], 5000).catch(() => {})
          await new Promise(r => setTimeout(r, 2000))
          await this.startLiveviewInternal((jpeg) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('dslr-frame', jpeg.toString('base64'))
            }
          })
        }
      }
    })
  }

  async applyAutoExposure(): Promise<void> {
    return this.enqueue(async () => {
      if (this.isWindows || !this.connected) return
      log.info('[DslrManager] Resetting exposure to auto for live preview')
      await this._applyConfigAuto()
    })
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
   * @param liveviewMode 'mjpeg' (default, high-fps) or 'polling' (lower fps,
   *   but USB is free between frames so --set-config can run without restart).
   *
   * Returns true if the first real frame was received within 6 s
   * (i.e. the camera is genuinely accessible), false otherwise.
   */
  async startLiveview(onFrame: (jpeg: Buffer) => void, liveviewMode: 'mjpeg' | 'polling' = 'mjpeg'): Promise<boolean> {
    return this.enqueue(async () => {
      for (let attempt = 1; attempt <= this._liveviewRetryAttempts; attempt++) {
        const ok = await this.startLiveviewInternal(onFrame, liveviewMode)
        if (ok) return true
        log.warn(`[DslrManager] startLiveview attempt ${attempt}/${this._liveviewRetryAttempts} failed${attempt < this._liveviewRetryAttempts ? ' — retrying in 1s' : ''}`)
        if (attempt < this._liveviewRetryAttempts) {
          await new Promise(r => setTimeout(r, 1000))
        }
      }
      return false
    })
  }

  private async startLiveviewInternal(onFrame: (jpeg: Buffer) => void, liveviewMode: 'mjpeg' | 'polling' = 'mjpeg'): Promise<boolean> {
    log.info(`[DslrManager] startLiveview() called (liveviewActive=${this.liveviewActive}, connected=${this.connected}, platform=${process.platform}, mode=${liveviewMode})`)
    if (this.liveviewActive) {
      log.warn('[DslrManager] startLiveview() ignored — already active')
      return true
    }
    if (!this.connected) {
      log.warn('[DslrManager] startLiveview() called but connected=false — proceeding anyway')
    }

    // Ensure USB is free before starting the frame loop. Uses a cooldown so
    // that when startLiveview is called immediately after applyExposure (common
    // in the startup path), the redundant PTP kill + detect cycle is skipped.
    // The Gphoto2LiveviewStream has its own PTP racing mechanism as a fallback.
    if (!this.isWindows) {
      log.info('[DslrManager] macOS: ensuring USB access before liveview...')
      await this._ensureUsbAccess(false)
    }

    this.liveviewActive = true

    let firstFrameOk: boolean

    if (this.isWindows) {
      log.info('[DslrManager] Using DigiCamControl backend (Windows)')
      if (!this.dcc) this.dcc = new DigiCamControlAdapter()
      this.dcc.startLiveview(onFrame)
      firstFrameOk = true
    } else {
      log.info(`[DslrManager] Using gphoto2 backend — mode=${liveviewMode}`)
      this.gphoto2Stream = new Gphoto2LiveviewStream(onFrame, this.selectedPort, this.cameraModel)
      const forcePolling = liveviewMode === 'polling'
      firstFrameOk = await this.gphoto2Stream.start(15000, 15000, forcePolling)
    }

    if (!firstFrameOk) {
      log.error('[DslrManager] Liveview failed — no frames received. Check USB cable.')
      this.liveviewActive = false
      this.gphoto2Stream = null
      return false
    }

    this.startDisconnectPoll()
    this.pushStatus()
    log.ok(`[DslrManager] startLiveview() confirmed — first frame received (mode=${liveviewMode})`)
    return true
  }

  /** Stop the live preview stream. */
  async stopLiveview(): Promise<void> {
    return this.enqueue(() => this.stopLiveviewInternal())
  }

  private async stopLiveviewInternal(): Promise<void> {
    const wasActive = this.liveviewActive
    const t0 = Date.now()
    log.info(`[DslrManager] stopLiveview() called (liveviewActive=${wasActive})`)

    this.liveviewActive = false
    if (wasActive) {
      this.stopDisconnectPoll()
    }

    if (this.isWindows) {
      this.dcc?.stopLiveview()
    } else {
      // CRITICAL: await the stream stop so the USB interface is fully released
      // before we issue the next gphoto2 command (viewfinder=0 or capture).
      // stop() uses SIGKILL and waits for the process to exit + 300 ms settle.
      if (this.gphoto2Stream) {
        const ts = Date.now()
        await this.gphoto2Stream.stop()
        this.gphoto2Stream = null
        log.info(`[DslrManager] ⏱ stream.stop() took ${Date.now() - ts} ms`)
      }

      // Deactivate liveview on the camera side (drop the mirror).
      // Always attempt this for Canon cameras — even if liveviewActive was
      // already false, the camera may still have the mirror up.
      if (this.cameraModel.toLowerCase().includes('canon')) {
        log.info('[DslrManager] Dropping Canon mirror (viewfinder=0) to deactivate liveview...')
        let portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
        let success = false
        for (let i = 0; i < 3 && !success; i++) {
          const res = await this.execGphoto2(['--set-config', '/main/actions/viewfinder=0', ...portArgs], 5000)
          if (res.code === 0) {
            log.ok('[DslrManager] Canon mirror dropped successfully')
            success = true
          } else if (i === 0 && portArgs.length > 0 && (res.stderr.includes('not found') || res.stderr.includes('Could not claim'))) {
            // Port may have changed after SIGKILL: retry without a specific port
            // (gphoto2 will auto-detect the camera) before doing a full re-detect.
            log.warn(`[DslrManager] Canon mirror drop failed on port ${this.selectedPort} — retrying without port`)
            portArgs = []
          } else {
            log.warn(`[DslrManager] Canon mirror drop failed (attempt ${i + 1}/3): ${res.stderr.trim()}`)
            if (i < 2) await new Promise(r => setTimeout(r, 1000))
          }
        }
      }
    }

    this.pushStatus()
    log.ok(`[DslrManager] stopLiveview() complete — total ${Date.now() - t0} ms`)
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
    return this.enqueue(async () => {
      const t0 = Date.now()
      log.info(`[DslrManager] ⏱ prepCapture() START (connected=${this.connected}, liveviewActive=${this.liveviewActive})`)
      // Always set the flag — the renderer already called dslrPreview.stop() (which
      // sends stop-dslr-liveview) before invoking this IPC, so camera liveview may
      // already be off. capture() needs _prepDone=true to know it should resume
      // liveview after the shot even though liveviewActive is now false.
      this._prepDone = true
      if (this.liveviewActive) {
        // stopLiveview() handles viewfinder=0 (mirror drop) for Canon cameras.
        const ts = Date.now()
        await this.stopLiveviewInternal()
        log.info(`[DslrManager] ⏱ stopLiveviewInternal() in prepCapture took ${Date.now() - ts} ms`)
      }

      // Trigger autofocus only for Canon DSLRs (phase-detect AF with mirror).
      // Sony Alpha / mirrorless cameras autofocus during the capture command itself
      // (contrast/phase-detect on the sensor). Running autofocusdrive=1 here on
      // Sony has a 6-second blocking timeout that delays the shutter without benefit.
      const isSony = this.cameraModel.toLowerCase().includes('sony') || this.cameraModel.toLowerCase().includes('alpha')
      const isCanon = this.cameraModel.toLowerCase().includes('canon')
      if (!this.isWindows && this.connected && isCanon && !isSony) {
        log.info('[DslrManager] prepCapture() — triggering autofocus (Canon phase-detect, mirror down)...')
        const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []
        const afRes = await this.execGphoto2(['--set-config', '/main/actions/autofocusdrive=1', ...portArgs], 6000)
        if (afRes.code === 0) {
          log.ok('[DslrManager] prepCapture() — autofocus triggered successfully')
        } else {
          log.warn(`[DslrManager] prepCapture() — AF trigger returned code=${afRes.code} (non-fatal): ${afRes.stderr.trim().slice(0, 100)}`)
        }
      }
      log.info(`[DslrManager] ⏱ prepCapture() DONE — total ${Date.now() - t0} ms`)
    })
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
    return this.enqueue(async () => {
      const t0 = Date.now()
      log.info(`[DslrManager] ⏱ capture() START (connected=${this.connected}, capturing=${this.capturing}, liveviewActive=${this.liveviewActive}, wasPrepped=${this._prepDone})`)
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
        log.info('[DslrManager] capture() — stopping liveview (prepCapture was NOT called)...')
        const ts = Date.now()
        await this.stopLiveviewInternal()
        log.info(`[DslrManager] ⏱ stopLiveview in capture() took ${Date.now() - ts} ms`)
        log.info('[DslrManager] Waiting 300 ms for PTP session to release...')
        await new Promise((r) => setTimeout(r, 300))
      } else {
        log.info(`[DslrManager] capture() — liveview already stopped by prepCapture (skipping stop+wait), t+${Date.now() - t0} ms`)
      }

      this.capturing = true
      let result: CaptureResult

      if (this.isWindows) {
        log.info('[DslrManager] Triggering capture via DigiCamControl...')
        result = await this.captureWindows(options?.targetPath)
      } else {
        log.info(`[DslrManager] ⏱ Triggering gphoto2 capture at t+${Date.now() - t0} ms from capture() start`)
        result = await this.captureGphoto2(options)
      }

      this.capturing = false
      if (result.success) {
        log.ok(`[DslrManager] ⏱ capture() SUCCESS — total ${Date.now() - t0} ms. File: ${result.path}`)
      } else {
        log.error(`[DslrManager] ⏱ capture() FAILED after ${Date.now() - t0} ms — ${result.error}`)
      }

      log.info('[DslrManager] capture() complete — liveview restart delegated to renderer')

      return result
    })
  }

  /** Run a gphoto2 command and collect stdout/stderr/exit code. */
  private execGphoto2(args: string[], timeoutMs = 15000): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const t0 = Date.now()
      const label = args.slice(0, 3).join(' ')  // e.g. '--set-config /main/...' (truncated)
      log.info(`[DslrManager] ⏱ exec START: gphoto2 ${label}${args.length > 3 ? ' …' : ''}`)
      const proc = this._trackChild(spawn('gphoto2', args))
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      const timer = setTimeout(() => {
        log.warn(`[DslrManager] ⏱ exec TIMEOUT after ${timeoutMs} ms: gphoto2 ${label}`)
        proc.kill()
        resolve({ code: null, stdout, stderr })
      }, timeoutMs)
      proc.on('close', (code) => {
        clearTimeout(timer)
        log.info(`[DslrManager] ⏱ exec DONE (${Date.now() - t0} ms, code=${code}): gphoto2 ${label}`)
        resolve({ code, stdout, stderr })
      })
      proc.on('error', () => {
        clearTimeout(timer)
        log.warn(`[DslrManager] ⏱ exec ERROR after ${Date.now() - t0} ms: gphoto2 ${label}`)
        resolve({ code: null, stdout, stderr })
      })
    })
  }

  /**
   * Gracefully shut down the DSLR manager.
   *
   * Call this from app 'before-quit' and on SIGINT/SIGTERM to ensure all
   * child gphoto2 processes are killed and the USB interface is released
   * before the Electron process exits. Without this, spawned gphoto2
   * subprocesses outlive the app and hold the camera USB claim, causing
   * "Could not claim the USB device" errors on the next launch.
   */
  async shutdown(): Promise<void> {
    log.info(`[DslrManager] shutdown() — killing ${this._childProcs.size} tracked child(ren) + liveview stream`)

    // Stop the liveview stream (kills MJPEG proc or stops polling timer)
    if (this.gphoto2Stream) {
      try { await this.gphoto2Stream.stop() } catch {}
      this.gphoto2Stream = null
    }
    this.liveviewActive = false

    // Stop disconnect polling
    if (this.disconnectPollTimer) {
      clearTimeout(this.disconnectPollTimer)
      this.disconnectPollTimer = null
    }

    // SIGKILL every tracked child (fetchConfigChoices, applyExposure, capture, etc.)
    for (const proc of this._childProcs) {
      try { proc.kill('SIGKILL') } catch {}
    }
    this._childProcs.clear()

    // Final sweep: any gphoto2 we may have missed (e.g. from Gphoto2LiveviewStream internals)
    if (process.platform !== 'win32') {
      try {
        require('child_process').execSync(
          'pkill -9 -f gphoto2 2>/dev/null; exit 0',
          { stdio: 'ignore' }
        )
      } catch {}
    }

    log.ok('[DslrManager] shutdown() complete — USB interface released')
  }

  private captureGphoto2(options?: { targetPath?: string; iso?: string; shutterSpeed?: string; aperture?: string }): Promise<CaptureResult> {
    return new Promise((resolve) => {
      const tCapStart = Date.now()
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

      const doCapture = async () => {
        const portArgs = this.selectedPort ? [`--port=${this.selectedPort}`] : []

        // For Sony Alpha cameras: set image quality to Fine (JPEG) before capture.
        // The camera defaults to RAW, which produces .ARW files that are harder
        // to handle downstream. Best-effort — not fatal if it fails.
        if (this.cameraModel.toLowerCase().includes('sony') || this.cameraModel.toLowerCase().includes('alpha')) {
          const qualRes = await this.execGphoto2(['--set-config', '/main/capturesettings/imagequality=Fine', ...portArgs], 5000)
          if (qualRes.code === 0) {
            log.ok('[DslrManager] Set image quality to Fine (JPEG)')
          } else {
            log.warn(`[DslrManager] Failed to set image quality (non-fatal): ${qualRes.stderr.trim().slice(0, 80)}`)
          }
        }

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
          await new Promise((r) => setTimeout(r, 300))
        }

        let args: string[]
        if (this.cameraModel.toLowerCase().includes('sony') || this.cameraModel.toLowerCase().includes('alpha')) {
          // Sony PTP capture is very slow with --capture-image-and-download due to unnecessary
          // state wait loops inside gphoto2. Using the direct capture=1 action forces an instant
          // shutter trigger, dropping capture delay from 5.5s down to 2.6s total (shutter is instant).
          args = [
            '--set-config', '/main/actions/capture=1',
            '--wait-event-and-download=4s',
            `--filename=${path.join(downloadDir, filenameTemplate)}`,
            '--force-overwrite',
            ...portArgs,
            '--set-config', '/main/actions/capture=0',
          ]
        } else {
          args = [
            '--capture-image-and-download',
            '--keep',
            `--filename=${path.join(downloadDir, filenameTemplate)}`,
            '--force-overwrite',
            ...portArgs,
          ]
        }

        log.info(`[DslrManager] ⏱ gphoto2 capture args: ${args.join(' ')}`)
        log.info(`[DslrManager] ⏱ SHUTTER COMMAND launching at t+${Date.now() - tCapStart} ms from captureGphoto2() entry`)
        log.info(`[DslrManager] Download dir: ${downloadDir}`)

        const tShutter = Date.now()
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

        const captureTimeout = setTimeout(() => {
          if (this.capturing) {
            log.error(`[DslrManager] ⏱ Capture timed out after 30 s (t+${Date.now() - tCapStart} ms) — killing gphoto2`)
            proc.kill()
            this.resetCameraAfterFailure()
            resolve({ success: false, error: 'Capture timeout (30 s)' })
          }
        }, 30000)

        proc.on('close', (code: number | null) => {
          clearTimeout(captureTimeout)
          log.info(`[DslrManager] ⏱ gphoto2 capture command exited code=${code} after ${Date.now() - tShutter} ms (total captureGphoto2: ${Date.now() - tCapStart} ms)`)

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
          clearTimeout(captureTimeout)
          log.error(`[DslrManager] gphoto2 spawn error during capture: ${err.message}`)
          this.resetCameraAfterFailure()
          resolve({ success: false, error: err.message })
        })
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
      // skipConfigFetch=true: the poll must not spawn 3 gphoto2 --get-config
      // processes every 5 s. Those hold the USB interface and race with capture
      // prep (viewfinder=0, autofocusdrive=1, --capture-image-and-download).
      // The disconnect poll only needs --auto-detect (which does NOT claim the
      // USB interface), so config choices are never re-fetched here.
      await this.detect(true)
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

    const afValue = mode === 'auto' ? '0' : '3'
    const configPaths = [
      `/main/capturesettings/focusmode2=${afValue}`,
      `/main/capturesettings/focusmode=${afValue}`,
      `/main/settings/focusmode=${afValue}`,
      `/main/actions/focusmode=${afValue}`,
    ]

    // Try without stopping liveview first — most cameras support live config changes.
    for (const cfg of configPaths) {
      const res = await this.execGphoto2(['--set-config', cfg, ...portArgs], 5000)
      if (res.code === 0) {
        log.ok(`[DslrManager] Focus mode set to ${mode} (in-place, liveview kept active)`)
        return { success: true }
      }
    }

    log.warn('[DslrManager] In-place focus mode change failed — falling back to stop/restart')

    const wasLiveview = this.liveviewActive
    if (wasLiveview) {
      await this.stopLiveview()
      await new Promise(r => setTimeout(r, 500))
    }

    try {
      require('child_process').execSync('pkill -9 -f PTPCamera 2>/dev/null; pkill -9 -f ptpcamerad 2>/dev/null')
    } catch (e) {}

    let success = false
    for (const cfg of configPaths) {
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
      log.ok(`[DslrManager] Focus mode set to ${mode} (after fallback)`)
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
