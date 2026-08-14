import {
  Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import sharp from 'sharp'
import type { Metadata } from 'sharp'
import { config } from '../config'
import { logger } from '../utils/logger'
import { jobQueue } from '../queue'
import { pendingCommands } from './booth'
import { v4 as uuidv4 } from 'uuid'
import { applyFrame } from '../pipeline'
import { io } from '../server'
import bcrypt from 'bcryptjs'
import { requireRole } from '../middleware/authMiddleware'
import {
  createEvent, updateEventById, getEvent, listEvents,
  endEvent, deleteEvent, listEventPhotoSessions,
  updateEventSettingsById, getGlobalSettings, updateGlobalSettings,
  archiveSession, restoreSession, getEventAnalytics,
  getAllUsers, insertUser, deleteUser, findUserByEmail, regenerateSessionShareId, setEventShareOriginals
} from '../db'

const router = Router()

// --- USER MANAGEMENT (RBAC) ---
router.get('/users', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const users = getAllUsers()
    res.json({ users })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/users', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' })
    }
    
    if (findUserByEmail(email)) {
      return res.status(400).json({ error: 'User already exists' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    insertUser(uuidv4(), email, passwordHash, role)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/users/:id', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user
    if (currentUser.userId === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' })
    }
    deleteUser(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// --- END USER MANAGEMENT ---


const tempUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Frame must be PNG, JPG, WebP, or SVG'))
    }
  },
})

// ── Frames ──

router.get('/events/:id/frames', async (req: Request, res: Response) => {
  try {
    const eventId = req.params.id
    const event = getEvent(eventId)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const framesDir = config.eventFrames(eventId)
    
    let frameDirs: string[] = []
    try {
      frameDirs = await fs.readdir(framesDir)
    } catch {
      // Directory might not exist yet
    }

    const frames = []
    
    // Inject the special 'Original Photos' frame
    frames.push({
      id: 'default_original',
      name: 'Original Photos',
      canvasWidth: 'RAW',
      canvasHeight: 'RAW',
      placeholders: [],
      disabled: (event as any).share_originals === 0,
      isSpecial: true
    })

    for (const frameId of frameDirs) {
      const configPath = path.join(framesDir, frameId, 'config.json')
      try {
        const configData = await fs.readFile(configPath, 'utf8')
        frames.push(JSON.parse(configData))
      } catch (err: any) {
        logger.warn(`Could not load frame config for ${frameId}: ${err.message}`)
      }
    }
    
    res.json({ frames })
  } catch (error: any) {
    logger.error(`Failed to list frames: ${error.message}`)
    res.status(500).json({ error: 'Failed to list frames' })
  }
})

router.post('/events/:id/frames', tempUpload.single('frame'), async (req: Request, res: Response) => {
  try {
    const eventId = req.params.id
    if (!req.file) return res.status(400).json({ error: 'No frame file provided' })

    const frameId = `frm_${Date.now()}_${uuidv4().split('-')[0]}`
    const frameDir = path.join(config.eventFrames(eventId), frameId)
    await fs.mkdir(frameDir, { recursive: true })

    const framePath = path.join(frameDir, 'frame.png')
    const configPath = path.join(frameDir, 'config.json')

    const ext = path.extname(req.file.originalname).toLowerCase()
    const isSvg = ext === '.svg'

    let metadata: Metadata
    if (isSvg) {
      await sharp(req.file.path).png().toFile(framePath)
      metadata = await sharp(framePath).metadata()
    } else {
      await sharp(req.file.path).png().toFile(framePath)
      metadata = await sharp(framePath).metadata()
    }

    await fs.unlink(req.file.path).catch(() => {})

    const frameConfig = {
      id: frameId,
      name: path.basename(req.file.originalname, ext),
      disabled: false,
      canvasWidth: metadata.width || 2400,
      canvasHeight: metadata.height || 2400,
      layering: 'foreground',
      placeholders: []
    }

    await fs.writeFile(configPath, JSON.stringify(frameConfig, null, 2))

    logger.info(`Frame created: ${frameId} for event ${eventId}`)
    res.json({ success: true, frame: frameConfig })
  } catch (error: any) {
    logger.error(`Frame upload failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/events/:id/frames/:frameId', async (req: Request, res: Response) => {
  try {
    const { id, frameId } = req.params
    const configPath = path.join(config.eventFrames(id), frameId, 'config.json')
    const configData = await fs.readFile(configPath, 'utf8')
    res.json({ frame: JSON.parse(configData) })
  } catch (error: any) {
    res.status(404).json({ error: 'Frame not found' })
  }
})

router.patch('/events/:id/frames/:frameId', async (req: Request, res: Response) => {
  try {
    const { id, frameId } = req.params

    if (frameId === 'default_original') {
      if (typeof req.body.disabled === 'boolean') {
        const value = req.body.disabled ? 0 : 1;
        setEventShareOriginals(id, value);
      }
      return res.json({ success: true });
    }

    const configPath = path.join(config.eventFrames(id), frameId, 'config.json')
    
    const configData = await fs.readFile(configPath, 'utf8')
    const frameConfig = JSON.parse(configData)

    const updates = req.body
    if (updates.name !== undefined) frameConfig.name = updates.name
    if (updates.disabled !== undefined) frameConfig.disabled = updates.disabled
    if (updates.placeholders !== undefined) frameConfig.placeholders = updates.placeholders
    if (updates.layering !== undefined) frameConfig.layering = updates.layering

    await fs.writeFile(configPath, JSON.stringify(frameConfig, null, 2))
    
    res.json({ success: true, frame: frameConfig })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/events/:id/frames/:frameId', async (req: Request, res: Response) => {
  try {
    const { id, frameId } = req.params
    const frameDir = path.join(config.eventFrames(id), frameId)
    await fs.rm(frameDir, { recursive: true, force: true })
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/events/:id/frames/:frameId/image', async (req: Request, res: Response) => {
  try {
    const { id, frameId } = req.params
    const framePath = path.join(config.eventFrames(id), frameId, 'frame.png')
    const resolvedPath = path.resolve(framePath)
    if (!resolvedPath.startsWith(path.resolve(config.eventFrames(id)))) {
      return res.status(400).json({ error: 'Invalid path' })
    }
    res.sendFile(framePath)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/events/:id/frames/:frameId/resize', async (req: Request, res: Response) => {
  try {
    const { id, frameId } = req.params
    const { targetWidth } = req.body
    if (!targetWidth || targetWidth <= 0) return res.status(400).json({ error: 'Valid targetWidth required' })

    const frameDir = path.join(config.eventFrames(id), frameId)
    const configPath = path.join(frameDir, 'config.json')
    const framePath = path.join(frameDir, 'frame.png')

    const configData = await fs.readFile(configPath, 'utf8')
    const frameConfig = JSON.parse(configData)

    const metadata = await sharp(framePath).metadata()
    const origWidth = metadata.width || 2400
    const origHeight = metadata.height || 2400

    const scale = targetWidth / origWidth
    const targetHeight = Math.round(origHeight * scale)

    const tempPath = path.join(frameDir, 'frame_temp.png')
    await sharp(framePath).resize(targetWidth, targetHeight).toFile(tempPath)
    await fs.rename(tempPath, framePath)

    frameConfig.canvasWidth = targetWidth
    frameConfig.canvasHeight = targetHeight
    for (const p of frameConfig.placeholders) {
      p.x = Math.round(p.x * scale)
      p.y = Math.round(p.y * scale)
      p.width = Math.round(p.width * scale)
      p.height = Math.round(p.height * scale)
      p.cropTop = Math.round(p.cropTop * scale)
      p.cropBottom = Math.round(p.cropBottom * scale)
      p.cropLeft = Math.round(p.cropLeft * scale)
      p.cropRight = Math.round(p.cropRight * scale)
      p.borderRadius = Math.round(p.borderRadius * scale)
    }

    await fs.writeFile(configPath, JSON.stringify(frameConfig, null, 2))
    
    res.json({ success: true, frame: frameConfig })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/events/:id/frames/:frameId/test', async (req: Request, res: Response) => {
  try {
    const { id, frameId } = req.params
    const configPath = path.join(config.eventFrames(id), frameId, 'config.json')
    const frameImagePath = path.join(config.eventFrames(id), frameId, 'frame.png')
    
    const configData = await fs.readFile(configPath, 'utf8')
    const frameConfig = JSON.parse(configData)

    const sessions = listEventPhotoSessions(id)
    if (sessions.length === 0) return res.status(400).json({ error: 'No photo sessions available to test with' })

    const latestSession = sessions[0]
    const eventDir = config.eventPhotosDir(id)
    const framedDir = config.eventFramedPhotos(id)

    const rawPaths: string[] = []
    for (let i = 0; i < frameConfig.placeholders.length; i++) {
      const p = path.join(eventDir, `${latestSession.id}_${i + 1}.webp`)
      try {
        await fs.access(p)
        rawPaths.push(p)
      } catch {
        return res.status(400).json({ error: `Latest session does not have enough photos (${frameConfig.placeholders.length} required)` })
      }
    }

    const testBaseName = `test_${frameId}`
    await applyFrame(rawPaths, frameConfig, frameImagePath, testBaseName, framedDir)

    res.json({ success: true, testUrl: `/api/admin/events/${id}/photo/framed/${testBaseName}.webp` })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── Events ──

router.get('/events', async (req: Request, res: Response) => {
  try {
    const includeEnded = req.query.includeEnded === 'true'
    const events = listEvents(includeEnded)
    res.json({ events })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/events', async (req: Request, res: Response) => {
  try {
    const { name, date, description, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance } = req.body
    if (!name) return res.status(400).json({ error: 'Event name required' })

    const { id, otp } = createEvent(name, date || new Date().toISOString().split('T')[0], description || '', { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance })
    const event = getEvent(id)
    logger.info(`Event created: ${name} (${id}) otp=${otp}`)
    res.json({ success: true, event, otp })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })
    res.json({ event })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/events/:id/analytics', async (req: Request, res: Response) => {
  try {
    const analytics = getEventAnalytics(req.params.id)
    res.json(analytics)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

  router.patch('/events/:id', async (req: Request, res: Response) => {
    try {
      const event = getEvent(req.params.id)
      if (!event) return res.status(404).json({ error: 'Event not found' })
      const { name, date, description, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, obfuscateLinks, expiryType, expiryValue, organizer, contactInfo } = req.body
      updateEventById(req.params.id,
        name ?? event.name,
        date ?? event.date,
        description ?? event.description,
        { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, obfuscateLinks, expiryType, expiryValue, organizer, contactInfo }
      )

      // If settings changed, push settings-update command to booth
      const updated = getEvent(req.params.id)!
      const settingsChanged = photoCount !== undefined || countdown !== undefined || captureInterval !== undefined || postCapturePreview !== undefined || dslrIso !== undefined || dslrShutterSpeed !== undefined || dslrAperture !== undefined || dslrFocusMode !== undefined || dslrWhiteBalance !== undefined
      if (settingsChanged) {
        pendingCommands.push({
          id: uuidv4(),
          type: 'settings-update',
          settings: {
            photoCount: updated.photo_count,
            countdown: updated.countdown,
            captureInterval: updated.capture_interval,
            postCapturePreview: updated.post_capture_preview,
            dslrIso: updated.dslr_iso,
            dslrShutterSpeed: updated.dslr_shutterspeed,
            dslrAperture: updated.dslr_aperture,
            dslrFocusMode: updated.dslr_focus_mode,
            dslrWhiteBalance: updated.dslr_whitebalance,
          },
          createdAt: Date.now(),
        })
        io.emit('settings-updated', { eventId: req.params.id, settings: updated })
      }

      res.json({ success: true, event: updated })
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  })

router.post('/events/:eventId/sessions/:sessionId/reset-link', async (req: Request, res: Response) => {
    try {
      const newShareId = regenerateSessionShareId(req.params.sessionId)
      res.json({ shareId: newShareId })
    } catch (err) {
      res.status(500).json({ error: 'Failed to reset link' })
    }
  })

  router.post('/events/:id/end', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })
    endEvent(req.params.id)
    io.emit('event-ended', { eventId: req.params.id })
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/events/:id', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const eventDir = config.eventPhotosDir(req.params.id)
    await fs.rm(eventDir, { recursive: true, force: true })

    deleteEvent(req.params.id)
    logger.info(`Event deleted: ${req.params.id}`)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── Event Photo Sessions (per-person groups inside an event) ──

router.get('/events/:id/photos', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const includeArchived = req.query.includeArchived === 'true'

    const eventDir = config.eventPhotosDir(req.params.id)
    let files: string[] = []
    try {
      files = await fs.readdir(eventDir)
    } catch {
      files = []
    }

    const sessionMap = new Map<string, { photos: any[]; timestamps: string[]; frameName?: string | null }>()

    for (const name of files) {
      if (name.includes('_thumb') || name.includes('_strip')) continue
      const match = name.match(/^(.+)_(\d+)\.\w+$/)
      if (!match) continue
      const sessionId = match[1]
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, { photos: [], timestamps: [] })
      }
      const stat = await fs.stat(path.join(eventDir, name))
      const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
      const thumbExists = files.includes(thumbName)
      sessionMap.get(sessionId)!.photos.push({
        id: name,
        url: `/api/admin/events/${req.params.id}/photo/${name}`,
        thumbnail: thumbExists ? `/api/admin/events/${req.params.id}/photo/${thumbName}` : `/api/admin/events/${req.params.id}/photo/${name}`,
        size: stat.size,
        timestamp: stat.birthtime.toISOString(),
      })
      sessionMap.get(sessionId)!.timestamps.push(stat.birthtime.toISOString())
    }

    // Cross-reference with DB to get archived status
    const dbSessions = listEventPhotoSessions(req.params.id, true)
    const dbSessionMap = new Map(dbSessions.map(s => [s.id, s]))

    let sessions = Array.from(sessionMap.entries())
      .map(([sessionId, data]) => {
        const dbSess = dbSessionMap.get(sessionId)
        return {
          sessionId,
          photoCount: data.photos.length,
          firstPhoto: data.photos[0] || null,
          photos: data.photos,
          timestamps: data.timestamps,
          createdAt: data.timestamps.sort().reverse()[0] || new Date().toISOString(),
          archived: dbSess ? dbSess.archived === 1 : false,
          share_id: dbSess ? (dbSess as any).share_id : null,
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    if (!includeArchived) {
      sessions = sessions.filter(s => !s.archived)
    }

    res.json({ sessions, event })
  } catch (error: any) {
    logger.error(`Failed to list event photos: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.post('/events/:id/frames/:frameId/backfill', async (req: Request, res: Response) => {
  try {
    const { id, frameId } = req.params
    const configPath = path.join(config.eventFrames(id), frameId, 'config.json')
    const frameImagePath = path.join(config.eventFrames(id), frameId, 'frame.png')
    
    const configData = await fs.readFile(configPath, 'utf8')
    const frameConfig = JSON.parse(configData)

    const sessions = listEventPhotoSessions(id)
    if (sessions.length === 0) return res.json({ success: true, count: 0 })

    const eventDir = config.eventPhotosDir(id)
    const framedDir = config.eventFramedPhotos(id)

    // Run this async without blocking response
    setTimeout(async () => {
      logger.info(`Starting frame backfill for event ${id}, frame ${frameId}`)
      let count = 0
      for (const session of sessions) {
        const rawPaths: string[] = []
        let pIndex = 1
        while (true) {
          const p = path.join(eventDir, `${session.id}_${pIndex}.webp`)
          try {
            await fs.access(p)
            rawPaths.push(p)
            pIndex++
          } catch {
            break
          }
        }
        
        try {
          if (frameConfig.placeholders.length === 1 && rawPaths.length > 1) {
            for (let j = 0; j < rawPaths.length; j++) {
              await applyFrame([rawPaths[j]], frameConfig, frameImagePath, `${session.id}_${frameId}_${j + 1}`, framedDir)
              count++
            }
          } else if (rawPaths.length >= frameConfig.placeholders.length) {
            await applyFrame(rawPaths.slice(0, frameConfig.placeholders.length), frameConfig, frameImagePath, `${session.id}_${frameId}`, framedDir)
            count++
          }
        } catch (e: any) {
          logger.error(`Backfill failed for session ${session.id}: ${e.message}`)
        }
      }
      logger.info(`Completed frame backfill for event ${id}, frame ${frameId}. Processed ${count} sessions.`)
    }, 0)

    res.json({ success: true, message: 'Backfill started in background' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/events/:id/sessions/:sessionId/frames/:frameId/apply', async (req: Request, res: Response) => {
  try {
    const { id, sessionId, frameId } = req.params
    const configPath = path.join(config.eventFrames(id), frameId, 'config.json')
    const frameImagePath = path.join(config.eventFrames(id), frameId, 'frame.png')
    
    let configData = ''
    try {
      configData = await fs.readFile(configPath, 'utf8')
    } catch {
      return res.status(404).json({ error: 'Frame not found' })
    }
    const frameConfig = JSON.parse(configData)

    const eventDir = config.eventPhotosDir(id)
    const framedDir = config.eventFramedPhotos(id)

    const rawPaths: string[] = []
    let pIndex = 1
    while (true) {
      const p = path.join(eventDir, `${sessionId}_${pIndex}.webp`)
      try {
        await fs.access(p)
        rawPaths.push(p)
        pIndex++
      } catch {
        break
      }
    }
    
    if (rawPaths.length === 0) {
      return res.status(400).json({ error: 'No photos found for this session' })
    }

    if (frameConfig.placeholders.length === 1 && rawPaths.length > 1) {
      for (let j = 0; j < rawPaths.length; j++) {
        await applyFrame([rawPaths[j]], frameConfig, frameImagePath, `${sessionId}_${frameId}_${j + 1}`, framedDir)
      }
      res.json({ success: true })
    } else if (rawPaths.length >= frameConfig.placeholders.length) {
      await applyFrame(rawPaths.slice(0, frameConfig.placeholders.length), frameConfig, frameImagePath, `${sessionId}_${frameId}`, framedDir)
      res.json({ success: true })
    } else {
      res.status(400).json({ error: `Not enough photos for frame. Frame requires ${frameConfig.placeholders.length}, session has ${rawPaths.length}.` })
    }
  } catch (error: any) {
    logger.error(`Failed to apply frame to session: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/events/:id/sessions/:sessionId/framed', async (req: Request, res: Response) => {
  try {
    const { id: eventId, sessionId } = req.params
    const frameId = req.query.frameId as string
    if (!frameId) return res.status(400).json({ error: 'frameId required' })

    const framedDir = config.eventFramedPhotos(eventId)
    let files: string[] = []
    try {
      files = await fs.readdir(framedDir)
    } catch {
      return res.json({ photos: [] })
    }

    const sessionFiles = files
      .filter((f) => f.startsWith(`${sessionId}_${frameId}`))
      .filter((f) => !f.includes('_thumb'))
      .filter((f) => f.endsWith('.webp'))
      .sort()

    logger.info(`GET /framed - files: ${files.length}, matched: ${sessionFiles.length}, sessionId: ${sessionId}, frameId: ${frameId}`)
    const photos = await Promise.all(
      sessionFiles.map(async (name) => {
        const stat = await fs.stat(path.join(framedDir, name))
        const baseName = name.replace('.webp', '')
        const thumbName = `${baseName}_thumb.webp`
        const thumbExists = files.includes(thumbName)
        const jpegName = `${baseName}.jpg`
        const jpegExists = files.includes(jpegName)

        const v = stat.mtimeMs // Use modification time as cache buster
        return {
          id: name,
          url: `/api/admin/events/${eventId}/photo/framed/${name}?v=${v}`,
          thumbnail: thumbExists ? `/api/admin/events/${eventId}/photo/framed/${thumbName}?v=${v}` : `/api/admin/events/${eventId}/photo/framed/${name}?v=${v}`,
          downloadUrl: jpegExists ? `/api/admin/events/${eventId}/photo/framed/${jpegName}?v=${v}` : `/api/admin/events/${eventId}/photo/framed/${name}?v=${v}`,
          size: stat.size,
          timestamp: stat.birthtime.toISOString(),
        }
      })
    )

    res.json({ photos })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/events/:id/photo/framed/:filename', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const framedDir = config.eventFramedPhotos(req.params.id)
    const filePath = path.join(framedDir, req.params.filename)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(path.resolve(framedDir))) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    const download = req.query.download !== undefined
    if (download && req.params.filename.endsWith('.webp')) {
      const index = req.params.filename.match(/_(\d+)\.webp$/)
      const photoNum = index ? index[1] : '1'
      const webpBuf = await fs.readFile(filePath)
      const jpegBuf = await sharp(webpBuf).jpeg({ quality: 95 }).toBuffer()
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Content-Disposition', `attachment; filename="photo-${photoNum}.jpg"`)
      res.setHeader('Content-Length', jpegBuf.length.toString())
      return res.send(jpegBuf)
    } else if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`)
    }

    try {
      await fs.stat(filePath)
    } catch {
      return res.status(404).json({ error: 'Photo not found' })
    }

    const ext = path.extname(req.params.filename).toLowerCase()
    const mime: Record<string, string> = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    }
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(filePath)
  } catch (error: any) {
    logger.error(`Photo serve failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/events/:id/photo/:filename', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const eventDir = config.eventPhotosDir(req.params.id)
    const filePath = path.join(eventDir, req.params.filename)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(path.resolve(eventDir))) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    const download = req.query.download !== undefined
    if (download && req.params.filename.endsWith('.webp')) {
      const index = req.params.filename.match(/_(\d+)\.webp$/)
      const photoNum = index ? index[1] : '1'
      const webpBuf = await fs.readFile(filePath)
      const jpegBuf = await sharp(webpBuf).jpeg({ quality: 85 }).toBuffer()
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Content-Disposition', `attachment; filename="photo-${photoNum}.jpg"`)
      res.setHeader('Content-Length', jpegBuf.length)
      return res.send(jpegBuf)
    }

    try {
      await fs.stat(filePath)
    } catch {
      return res.status(404).json({ error: 'Photo not found' })
    }

    const ext = path.extname(req.params.filename).toLowerCase()
    const mime: Record<string, string> = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    }
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(filePath)
  } catch (error: any) {
    logger.error(`Photo serve failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/events/:id/photo/:filename', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const eventDir = config.eventPhotosDir(req.params.id)
    const filePath = path.join(eventDir, req.params.filename)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(path.resolve(eventDir))) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    await fs.unlink(resolvedPath)
    logger.info(`Photo deleted from event ${req.params.id}: ${req.params.filename}`)
    res.json({ success: true })
  } catch (error: any) {
    logger.error(`Failed to delete photo: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/events/:id/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const event = getEvent(req.params.id)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const eventDir = config.eventPhotosDir(req.params.id)
    let files: string[] = []
    try {
      files = await fs.readdir(eventDir)
    } catch {
      files = []
    }

    const toDelete = files.filter((f) => f.startsWith(req.params.sessionId))
    if (toDelete.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }
    await Promise.all(toDelete.map((f) => fs.unlink(path.join(eventDir, f))))
    logger.info(`Session deleted from event ${req.params.id}: ${req.params.sessionId} (${toDelete.length} files)`)
    res.json({ success: true, deleted: toDelete.length })
  } catch (error: any) {
    logger.error(`Failed to delete session: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/events/:id/session/:sessionId/archive', async (req: Request, res: Response) => {
  try {
    archiveSession(req.params.sessionId)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/events/:id/session/:sessionId/restore', async (req: Request, res: Response) => {
  try {
    restoreSession(req.params.sessionId)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/events/:id/sessions/batch-archive', async (req: Request, res: Response) => {
  try {
    const { sessionIds } = req.body
    if (!Array.isArray(sessionIds)) return res.status(400).json({ error: 'sessionIds must be an array' })
    for (const sid of sessionIds) archiveSession(sid)
    res.json({ success: true, count: sessionIds.length })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/events/:id/sessions/batch-delete', async (req: Request, res: Response) => {
  try {
    const { sessionIds } = req.body
    if (!Array.isArray(sessionIds)) return res.status(400).json({ error: 'sessionIds must be an array' })
    const eventDir = config.eventPhotosDir(req.params.id)
    const results = await Promise.allSettled(sessionIds.map(async (sid) => {
      let files: string[] = []
      try { files = await fs.readdir(eventDir) } catch {}
      const toDelete = files.filter((f) => f.startsWith(sid))
      await Promise.all(toDelete.map((f) => fs.unlink(path.join(eventDir, f))))
    }))
    const deleted = results.filter(r => r.status === 'fulfilled').length
    res.json({ success: true, deleted })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ── Global photos (legacy — not event-specific, kept for backward compat) ──

router.get('/photos', async (req: Request, res: Response) => {
  try {
    const files = await fs.readdir(config.storage.photos)
    const photos = await Promise.all(
      files
        .filter((f) => /\.(webp|avif|jpg|jpeg|png)$/i.test(f) && !f.includes('_thumb'))
        .map(async (name) => {
          const stat = await fs.stat(path.join(config.storage.photos, name))
          const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
          const thumbExists = files.includes(thumbName)
          return {
            id: name,
            url: `/api/photos/${name}`,
            thumbnail: thumbExists ? `/api/photos/${thumbName}` : `/api/photos/${name}`,
            size: stat.size,
            timestamp: stat.birthtime.toISOString(),
          }
        })
    )
    photos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    res.json({ photos })
  } catch (error: any) {
    logger.error(`Failed to list photos: ${error.message}`)
    res.status(500).json({ error: 'Failed to list photos' })
  }
})

router.delete('/photos/:id', async (req: Request, res: Response) => {
  try {
    const photoPath = path.join(config.storage.photos, req.params.id)
    const resolvedPath = path.resolve(photoPath)
    if (!resolvedPath.startsWith(path.resolve(config.storage.photos))) {
      return res.status(400).json({ error: 'Invalid path' })
    }
    await fs.unlink(resolvedPath)
    logger.info(`Photo deleted: ${req.params.id}`)
    res.json({ success: true })
  } catch (error: any) {
    logger.error(`Failed to delete photo: ${error.message}`)
    res.status(500).json({ error: 'Failed to delete photo' })
  }
})

router.get('/photos/:id/download', async (req: Request, res: Response) => {
  try {
    const filename = req.params.id
    const filePath = path.join(config.storage.photos, filename)
    const resolvedPath = path.resolve(filePath)
    if (!resolvedPath.startsWith(path.resolve(config.storage.photos))) {
      return res.status(400).json({ error: 'Invalid path' })
    }
    if (!filename.endsWith('.webp')) {
      return res.status(400).json({ error: 'Only WebP photos can be downloaded as JPEG' })
    }
    const index = filename.match(/_(\d+)\.webp$/)
    const photoNum = index ? index[1] : '1'
    const webpBuf = await fs.readFile(filePath)
    const jpegBuf = await sharp(webpBuf).jpeg({ quality: 85 }).toBuffer()
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Content-Disposition', `attachment; filename="photo-${photoNum}.jpg"`)
    res.setHeader('Content-Length', jpegBuf.length)
    res.send(jpegBuf)
  } catch (error: any) {
    logger.error(`Photo download failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// ── Global session endpoints (legacy) ──

router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const files = await fs.readdir(config.storage.photos)
    const sessionMap = new Map<string, { photos: any[]; timestamps: string[]; frameName?: string | null }>()

    for (const name of files) {
      if (name.includes('_thumb') || name.includes('_strip')) continue
      const match = name.match(/^(.+)_(\d+)\.\w+$/)
      if (!match) continue
      const sessionId = match[1]
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, { photos: [], timestamps: [] })
      }
      const stat = await fs.stat(path.join(config.storage.photos, name))
      const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
      const thumbExists = files.includes(thumbName)
      sessionMap.get(sessionId)!.photos.push({
        id: name,
        url: `/api/photos/${name}`,
        thumbnail: thumbExists ? `/api/photos/${thumbName}` : `/api/photos/${name}`,
        size: stat.size,
        timestamp: stat.birthtime.toISOString(),
      })
      sessionMap.get(sessionId)!.timestamps.push(stat.birthtime.toISOString())
    }

    const sessions = Array.from(sessionMap.entries())
      .map(([sessionId, data]) => ({
        sessionId,
        photoCount: data.photos.length,
        firstPhoto: data.photos[0] || null,
        photos: data.photos,
        timestamps: data.timestamps,
        createdAt: data.timestamps.sort().reverse()[0] || new Date().toISOString(),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    res.json({ sessions })
  } catch (error: any) {
    logger.error(`Failed to list sessions: ${error.message}`)
    res.status(500).json({ error: 'Failed to list sessions' })
  }
})

router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params
    const files = await fs.readdir(config.storage.photos)
    const toDelete = files.filter((f) => f.startsWith(sessionId))
    if (toDelete.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }
    await Promise.all(toDelete.map((f) => fs.unlink(path.join(config.storage.photos, f))))
    logger.info(`Session deleted: ${sessionId} (${toDelete.length} files)`)
    res.json({ success: true, deleted: toDelete.length })
  } catch (error: any) {
    logger.error(`Failed to delete session: ${error.message}`)
    res.status(500).json({ error: 'Failed to delete session' })
  }
})

// ── Global Defaults ──

router.get('/settings/defaults', (req: Request, res: Response) => {
  res.json({ settings: getGlobalSettings() })
})

router.put('/settings/defaults', (req: Request, res: Response) => {
  const { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance } = req.body
  const settings = {
    photoCount: Math.max(1, Math.min(4, photoCount ?? 4)),
    countdown: Math.max(3, Math.min(10, countdown ?? 5)),
    captureInterval: Math.max(0, Math.min(5, captureInterval ?? 1)),
    postCapturePreview: Math.max(1, Math.min(5, postCapturePreview ?? 2)),
    dslrIso: dslrIso?.toString().trim() || 'auto',
    dslrShutterSpeed: dslrShutterSpeed?.toString().trim() || 'auto',
    dslrAperture: dslrAperture?.toString().trim() || 'auto',
    dslrFocusMode: dslrFocusMode?.toString().trim() || 'auto',
    dslrWhiteBalance: dslrWhiteBalance?.toString().trim() || 'auto',
  }
  updateGlobalSettings(settings)
  res.json({ success: true, settings })
})

// ── Queue ──

router.get('/queue', (req: Request, res: Response) => {
  res.json({ queue: jobQueue.stats })
})

export default router
