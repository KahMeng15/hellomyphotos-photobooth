import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { logger } from '../utils/logger'
import { boothAuthMiddleware } from '../middleware/authMiddleware'
import { io, operatorSubscriptions } from '../server'
import { processSinglePhoto, generateThumbnail, compileVerticalStrip, applyFrame } from '../pipeline'
import { getActiveFrames } from '../utils/frames'
import { ensurePhotoSession, getEventByOtp, updateEventSettingsById, getCameraSettings, updateCameraSettings, reservePhotoSession, updateUploadStatus } from '../db'

const router = Router()

export const pendingCommands: { id: string; type: string; settings?: any; createdAt: number }[] = []

function ensureEventDir(eventId: string): Promise<string> {
  const dir = config.eventPhotosDir(eventId)
  return fs.mkdir(dir, { recursive: true }).then(() => dir)
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const eventId = (req as any).eventId
    if (!eventId) return cb(new Error('No event ID'), '')
    try {
      const dir = await ensureEventDir(eventId)
      cb(null, dir)
    } catch (err: any) {
      cb(err, '')
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize, files: config.upload.maxFiles },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.avif']
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, allowed.includes(ext))
  },
})

router.post('/session/reserve', boothAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = req.body.sessionId as string
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
    const eventId = (req as any).eventId
    const shareId = reservePhotoSession(sessionId, eventId)
    const shareUrl = `${req.protocol}://${req.get('host')}/share/${shareId}`
    res.json({ shareId, shareUrl, sessionId })
  } catch (error: any) {
    logger.error(`Session reserve error: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/frames', boothAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const eventId = (req as any).eventId
    const activeFrames = await getActiveFrames(eventId)
    
    const frames = activeFrames.map(f => ({
      ...f.config,
      imageUrl: `/api/booth/frames/${f.id}/image`
    }))

    res.json({ frames })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list frames' })
  }
})

router.get('/frames/:frameId/image', boothAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const eventId = (req as any).eventId
    const frameId = req.params.frameId
    
    const framePath = path.join(config.eventFrames(eventId), frameId, 'frame.png')
    const resolvedPath = path.resolve(framePath)
    if (!resolvedPath.startsWith(path.resolve(config.eventFrames(eventId)))) {
      return res.status(400).json({ error: 'Invalid path' })
    }
    
    res.sendFile(framePath)
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to serve frame image' })
  }
})

router.post('/upload', boothAuthMiddleware, upload.array('photos', config.upload.maxFiles), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' })
    }

    const eventId = (req as any).eventId
    const { photoCount } = req.body
    const sessionId = req.body.sessionId || uuidv4()
    const count = parseInt(photoCount || String(files.length), 10)

    logger.info(`Booth upload: ${files.length} photos, event=${eventId}, session=${sessionId}`)

    const shareId = ensurePhotoSession(sessionId, eventId)

    const uploadStartTime = Date.now()
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0)
    updateUploadStatus(sessionId, 'uploading', { upload_started_at: uploadStartTime })

    const results: any[] = []
    const eventDir = config.eventPhotosDir(eventId)
    const framedDir = config.eventFramedPhotos(eventId)

    // Process original photos
    const rawPaths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const outputName = `${sessionId}_${i + 1}.webp`
      const thumbName = `${sessionId}_${i + 1}_thumb.webp`

      await processSinglePhoto(file.path, outputName, eventDir)
      await generateThumbnail(file.path, thumbName, eventDir)

      rawPaths.push(path.join(eventDir, outputName))

      results.push({
        raw: file.filename,
        output: outputName,
        thumbnail: thumbName,
      })
    }

    if (files.length >= 2) {
      const stripName = `${sessionId}_strip.webp`
      results.push({ strip: stripName })
      await compileVerticalStrip(
        files.slice(0, count).map((f) => f.path),
        Math.min(count, files.length),
        stripName,
        eventDir
      )
    }

    // Apply active frames
    const activeFrames = await getActiveFrames(eventId)
    const framedResults: { frameId: string; output: string; thumbnail: string }[] = []

    if (activeFrames.length > 0) {
      for (const frame of activeFrames) {
        try {
          if (frame.config.placeholders.length === 1 && rawPaths.length > 1) {
            for (let j = 0; j < rawPaths.length; j++) {
              const outputBaseName = `${sessionId}_${frame.id}_${j + 1}`
              await applyFrame([rawPaths[j]], frame.config, frame.imagePath, outputBaseName, framedDir)
              framedResults.push({
                frameId: frame.id,
                output: `${outputBaseName}.webp`,
                thumbnail: `${outputBaseName}_thumb.webp`
              })
            }
          } else if (rawPaths.length >= frame.config.placeholders.length) {
            const outputBaseName = `${sessionId}_${frame.id}`
            await applyFrame(rawPaths.slice(0, frame.config.placeholders.length), frame.config, frame.imagePath, outputBaseName, framedDir)
            framedResults.push({
              frameId: frame.id,
              output: `${outputBaseName}.webp`,
              thumbnail: `${outputBaseName}_thumb.webp`
            })
          } else {
            logger.warn(`Skipping frame ${frame.id}: Session has ${rawPaths.length} photos, but frame requires ${frame.config.placeholders.length}`)
          }
        } catch (err: any) {
          logger.error(`Failed to apply frame ${frame.id}: ${err.message}`)
        }
      }
    }

    const newMediaPayload = {
      eventId,
      sessionId,
      shareId,
      photoCount: files.length,
      timestamp: new Date().toISOString(),
      results: results.map((r) => ({
        output: r.output,
        thumbnail: r.thumbnail,
        strip: r.strip,
      })),
      framed: framedResults,
    }
    // Notify operator subscriptions for this event
    const subs = operatorSubscriptions.get(eventId)
    if (subs) {
      for (const sid of subs) {
        io.to(sid).emit('new-media', newMediaPayload)
      }
    }
    // Also broadcast to all connected sockets as fallback
    io.emit('new-media', newMediaPayload)

    for (const file of files) {
      await fs.unlink(file.path).catch(() => {})
    }

    const uploadElapsedMs = Date.now() - uploadStartTime
    const avgSpeedKbps = uploadElapsedMs > 0 ? (totalBytes / uploadElapsedMs) : 0
    updateUploadStatus(sessionId, 'complete', {
      upload_completed_at: Date.now(),
      upload_size_bytes: totalBytes,
      upload_avg_speed_kbps: avgSpeedKbps
    })

    res.json({ success: true, eventId, sessionId, shareId, photoCount: files.length, results })
  } catch (error: any) {
    logger.error(`Upload error: ${error.stack || error.message}`)
    try { updateUploadStatus(req.body.sessionId, 'failed') } catch {}
    res.status(500).json({ error: error.message })
  }
})

router.post('/heartbeat', (req: Request, res: Response) => {
  res.json({ online: true, serverTime: new Date().toISOString() })
})

router.get('/status', (req: Request, res: Response) => {
  res.json({
    online: true,
    serverTime: new Date().toISOString(),
    version: '3.0.0',
  })
})

router.post('/remote-capture', (req: Request, res: Response) => {
  const id = uuidv4()
  pendingCommands.push({ id, type: 'capture', createdAt: Date.now() })
  logger.info(`Remote capture command queued: ${id}`)
  res.json({ success: true, commandId: id })
})

router.post('/remote-start', (req: Request, res: Response) => {
  const id = uuidv4()
  pendingCommands.push({ id, type: 'start', createdAt: Date.now() })
  logger.info(`Remote start command queued: ${id}`)
  res.json({ success: true, commandId: id })
})

router.post('/remote-go-home', (req: Request, res: Response) => {
  const id = uuidv4()
  pendingCommands.push({ id, type: 'go-home', createdAt: Date.now() })
  logger.info(`Remote go-home command queued: ${id}`)
  res.json({ success: true, commandId: id })
})

router.post('/remote-pause', (req: Request, res: Response) => {
  const id = uuidv4()
  const paused = req.body?.paused !== false
  pendingCommands.push({ id, type: paused ? 'pause' : 'resume', createdAt: Date.now() })
  logger.info(`Remote pause command queued: ${id} (paused=${paused})`)
  res.json({ success: true, commandId: id })
})

router.get('/commands', (req: Request, res: Response) => {
  const commands = pendingCommands.splice(0)
  res.json({ commands })
})

router.get('/validate-otp', (req: Request, res: Response) => {
  const otp = (req.query.otp || '').toString().trim()
  if (!otp || otp.length !== 6) {
    return res.status(400).json({ valid: false, error: 'Invalid OTP format' })
  }
  const event = getEventByOtp(otp)
  if (!event) {
    return res.json({ valid: false, error: 'OTP not found or expired' })
  }
  res.json({
    valid: true,
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      description: event.description,
    },
  })
})

router.get('/camera-settings', async (req: Request, res: Response) => {
  const model = req.query.model as string
  if (!model) return res.status(400).json({ error: 'Model required' })
  const settings = getCameraSettings(model)
  if (settings) {
    res.json({ success: true, settings })
  } else {
    res.json({ success: false })
  }
})

router.post('/camera-settings', async (req: Request, res: Response) => {
  const { model, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin } = req.body
  if (!model) return res.status(400).json({ error: 'Model required' })
  updateCameraSettings(model, { dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin })
  res.json({ success: true })
})

router.get('/settings', async (req: Request, res: Response) => {
  const otp = (req.query.otp as string || '').trim()
  if (otp.length !== 6) {
    return res.status(400).json({ error: 'OTP required as query param' })
  }
  const event = getEventByOtp(otp)
  if (!event) {
    return res.status(404).json({ error: 'Event not found for OTP' })
  }
  res.json({
    photoCount: event.photo_count,
    countdown: event.countdown,
    captureInterval: event.capture_interval,
    postCapturePreview: event.post_capture_preview,
    dslrIso: event.dslr_iso,
    dslrShutterSpeed: event.dslr_shutterspeed,
    dslrAperture: event.dslr_aperture,
    dslrFocusMode: event.dslr_focus_mode,
    dslrWhiteBalance: event.dslr_whitebalance,
    dslrWhiteBalanceKelvin: event.dslr_whitebalance_kelvin,
  })
})

router.post('/settings', async (req: Request, res: Response) => {
  const { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, otp } = req.body
  if (!otp) {
    return res.status(400).json({ error: 'OTP required' })
  }
  const event = getEventByOtp(otp)
  if (!event) {
    return res.status(404).json({ error: 'Event not found for OTP' })
  }
  const settings: any = {
    photoCount: Math.max(1, Math.min(4, photoCount ?? event.photo_count)),
    countdown: Math.max(3, Math.min(10, countdown ?? event.countdown)),
    captureInterval: Math.max(0, Math.min(5, captureInterval ?? event.capture_interval)),
    postCapturePreview: Math.max(1, Math.min(5, postCapturePreview ?? event.post_capture_preview)),
  }
  
  settings.dslrIso = dslrIso ?? event.dslr_iso
  settings.dslrShutterSpeed = dslrShutterSpeed ?? event.dslr_shutterspeed
  settings.dslrAperture = dslrAperture ?? event.dslr_aperture
  settings.dslrFocusMode = dslrFocusMode ?? event.dslr_focus_mode
  settings.dslrWhiteBalance = dslrWhiteBalance ?? event.dslr_whitebalance
  settings.dslrWhiteBalanceKelvin = dslrWhiteBalanceKelvin ?? event.dslr_whitebalance_kelvin
  
  updateEventSettingsById(event.id, settings)
  logger.info('Booth settings synced to event', { eventId: event.id, ...settings })
  io.emit('settings-updated', { eventId: event.id, settings })
  res.json({ success: true, settings })
})

export default router
