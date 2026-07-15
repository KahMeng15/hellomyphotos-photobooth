import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { logger } from '../utils/logger'
import { io, updateBoothHeartbeat } from '../server'
import { processSinglePhoto, generateThumbnail, compileVerticalStrip } from '../pipeline'

const router = Router()

const pendingCommands: { id: string; type: string; createdAt: number }[] = []

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.storage.photos),
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
    res.status(500).json({ error: 'Failed to list frames' })
  }
})

router.post('/upload', upload.array('photos', config.upload.maxFiles), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' })
    }

    const { sessionId, frameName, photoCount } = req.body
    const session = sessionId || uuidv4()
    const count = parseInt(photoCount || String(files.length), 10)

    logger.info(`Booth upload: ${files.length} photos, session=${session}`)

    const results: any[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const outputName = `${session}_${i + 1}.webp`
      const thumbName = `${session}_${i + 1}_thumb.webp`

      await processSinglePhoto(file.path, frameName || null, outputName)
      await generateThumbnail(file.path, thumbName)

      results.push({
        raw: file.filename,
        output: outputName,
        thumbnail: thumbName,
      })
    }

    if (files.length >= 2) {
      const stripName = `${session}_strip.webp`
      results.push({ strip: stripName })
      await compileVerticalStrip(
        files.slice(0, count).map((f) => f.path),
        Math.min(count, files.length),
        stripName
      )
    }

    io.emit('new-media', {
      sessionId: session,
      photoCount: files.length,
      frameName: frameName || null,
      timestamp: new Date().toISOString(),
      results: results.map((r) => ({
        output: r.output,
        thumbnail: r.thumbnail,
        strip: r.strip,
      })),
    })

    for (const file of files) {
      await fs.unlink(file.path).catch(() => {})
    }

    res.json({ success: true, sessionId: session, photoCount: files.length, results })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/heartbeat', (req: Request, res: Response) => {
  updateBoothHeartbeat()
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

export default router
