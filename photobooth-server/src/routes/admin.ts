import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { config } from '../config'
import { logger } from '../utils/logger'
import { jobQueue } from '../queue'
import { pendingCommands } from './booth'
import { v4 as uuidv4 } from 'uuid'
import { io } from '../server'

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

router.get('/settings', async (req: Request, res: Response) => {
  const settingsPath = path.join(config.storage.logs, 'booth-settings.json')
  try {
    const data = await fs.readFile(settingsPath, 'utf-8')
    res.json(JSON.parse(data))
  } catch {
    res.json({ photoCount: 4, countdown: 5, captureInterval: 1 })
  }
})

router.post('/settings', async (req: Request, res: Response) => {
  const settingsPath = path.join(config.storage.logs, 'booth-settings.json')
  const { photoCount, countdown, captureInterval } = req.body
  const settings = {
    photoCount: Math.max(1, Math.min(4, photoCount || 4)),
    countdown: Math.max(3, Math.min(10, countdown || 5)),
    captureInterval: Math.max(0, Math.min(5, captureInterval ?? 1)),
  }
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
  logger.info('Booth settings updated', settings)
  pendingCommands.push({
    id: uuidv4(),
    type: 'settings-update',
    settings,
    createdAt: Date.now(),
  })
  io.emit('settings-updated', settings)
  res.json({ success: true, settings })
})

router.get('/queue', (req: Request, res: Response) => {
  res.json({ queue: jobQueue.stats })
})

router.get('/events', async (req: Request, res: Response) => {
  try {
    const eventsPath = path.join(config.storage.logs, 'events.json')
    let events: any[] = []
    try {
      const data = await fs.readFile(eventsPath, 'utf-8')
      events = JSON.parse(data)
    } catch {
      events = []
    }
    res.json({ events })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/events', async (req: Request, res: Response) => {
  try {
    const { name, date, defaultPhotoCount, frameSet } = req.body
    if (!name) return res.status(400).json({ error: 'Event name required' })

    const eventsPath = path.join(config.storage.logs, 'events.json')
    let events: any[] = []
    try {
      const data = await fs.readFile(eventsPath, 'utf-8')
      events = JSON.parse(data)
    } catch {
      events = []
    }

    const event = {
      id: `event-${Date.now()}`,
      name,
      date: date || new Date().toISOString().split('T')[0],
      defaultPhotoCount: defaultPhotoCount || 4,
      frameSet: frameSet || [],
      createdAt: new Date().toISOString(),
    }

    events.push(event)
    await fs.writeFile(eventsPath, JSON.stringify(events, null, 2))
    logger.info(`Event created: ${event.name}`)
    res.json({ success: true, event })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
