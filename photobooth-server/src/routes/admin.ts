import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
import { config } from '../config'
import { logger } from '../utils/logger'
import { jobQueue } from '../queue'
import { pendingCommands } from './booth'
import { v4 as uuidv4 } from 'uuid'
import { io } from '../server'
import {
  createEvent, updateEventById, getEvent, listEvents,
  endEvent, deleteEvent, listEventPhotoSessions,
  updateEventSettingsById, getGlobalSettings, updateGlobalSettings,
  archiveSession, restoreSession
} from '../db'

const router = Router()

const frameStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.storage.frames),
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}_${sanitized}`)
  },
})

const frameUpload = multer({
  storage: frameStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Frame must be PNG, JPG, or WebP'))
    }
  },
})

// ── Frames ──

router.get('/frames', async (req: Request, res: Response) => {
  try {
    const files = await fs.readdir(config.storage.frames)
    const frames = await Promise.all(
      files
        .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .map(async (name) => {
          const stat = await fs.stat(path.join(config.storage.frames, name))
          return { id: name, name, size: stat.size, createdAt: stat.birthtime }
        })
    )
    frames.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    res.json({ frames })
  } catch (error: any) {
    logger.error('Failed to list frames', { error: error.message })
    res.status(500).json({ error: 'Failed to list frames' })
  }
})

router.post('/frames', frameUpload.single('frame'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No frame file provided' })
    }
    logger.info(`Frame uploaded: ${req.file.filename}`)
    res.json({
      success: true,
      frame: { id: req.file.filename, name: req.file.filename, size: req.file.size },
    })
  } catch (error: any) {
    logger.error(`Frame upload failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/frames/:id', async (req: Request, res: Response) => {
  try {
    const framePath = path.join(config.storage.frames, req.params.id)
    const resolvedPath = path.resolve(framePath)
    if (!resolvedPath.startsWith(path.resolve(config.storage.frames))) {
      return res.status(400).json({ error: 'Invalid path' })
    }
    await fs.unlink(resolvedPath)
    logger.info(`Frame deleted: ${req.params.id}`)
    res.json({ success: true })
  } catch (error: any) {
    logger.error(`Failed to delete frame: ${error.message}`)
    res.status(500).json({ error: 'Failed to delete frame' })
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

  router.patch('/events/:id', async (req: Request, res: Response) => {
    try {
      const event = getEvent(req.params.id)
      if (!event) return res.status(404).json({ error: 'Event not found' })
      const { name, date, description, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, obfuscateLinks, expiryType, expiryValue } = req.body
      updateEventById(req.params.id,
        name ?? event.name,
        date ?? event.date,
        description ?? event.description,
        { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, obfuscateLinks, expiryType, expiryValue }
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
