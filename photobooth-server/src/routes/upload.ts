import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { logger } from '../utils/logger'
import { jobQueue } from '../queue'
import { io, operatorSubscriptions } from '../server'
import { ensurePhotoSession } from '../db'

const router = Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const eventId = (req as any).body?.eventId
    if (eventId) {
      const dir = config.eventPhotosDir(eventId)
      fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir)).catch((err) => cb(err, ''))
    } else {
      cb(null, config.storage.photos)
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: config.upload.maxFiles,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.avif']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${ext}`))
    }
  },
})

router.post('/', upload.array('photos', config.upload.maxFiles), async (req: Request, res: Response) => {
  const startTime = Date.now()

  try {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' })
    }

    const { eventId, sessionId: reqSessionId, frameName, watermarkText, photoCount } = req.body
    const sessionId = reqSessionId || uuidv4()
    const count = parseInt(photoCount || String(files.length), 10)

    logger.info(`Upload received: ${files.length} photos, session=${sessionId}${eventId ? `, event=${eventId}` : ''}`)

    if (eventId) {
      ensurePhotoSession(sessionId, eventId)
    }

    const results: any[] = []
    const dir = eventId ? config.eventPhotosDir(eventId) : config.storage.photos

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const outputName = `${sessionId}_${i + 1}.webp`
      const thumbName = `${sessionId}_${i + 1}_thumb.webp`

      results.push({
        raw: file.filename,
        output: outputName,
        thumbnail: thumbName,
      })

      jobQueue.enqueue({
        id: `${sessionId}-process-${i}`,
        type: 'process-photo',
        data: {
          rawPath: file.path,
          frameName: frameName || null,
          outputName,
          eventDir: dir,
          watermarkText,
        },
        priority: 1,
      })

      jobQueue.enqueue({
        id: `${sessionId}-thumb-${i}`,
        type: 'generate-thumbnail',
        data: {
          inputPath: file.path,
          outputName: thumbName,
          eventDir: dir,
        },
        priority: 2,
      })
    }

    if (files.length >= 2) {
      const stripName = `${sessionId}_strip.webp`
      results.push({ strip: stripName })

      jobQueue.enqueue({
        id: `${sessionId}-strip`,
        type: 'compile-strip',
        data: {
          imagePaths: files.slice(0, count).map((f) => f.path),
          photoCount: Math.min(count, files.length),
          outputName: stripName,
          eventDir: dir,
        },
        priority: 0,
      })
    }

    const newMediaPayload = {
      eventId: eventId || null,
      sessionId,
      photoCount: files.length,
      frameName: frameName || null,
      timestamp: new Date().toISOString(),
      results: results.map((r) => ({
        output: r.output,
        thumbnail: r.thumbnail,
        strip: r.strip,
      })),
    }
    if (eventId) {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('new-media', newMediaPayload)
        }
      }
    } else {
      io.emit('new-media', newMediaPayload)
    }

    const processingTime = Date.now() - startTime
    logger.info(`Upload processed in ${processingTime}ms: session=${sessionId}`)

    res.json({
      success: true,
      sessionId,
      photoCount: files.length,
      results,
      processingTime,
    })
  } catch (error: any) {
    logger.error(`Upload failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router
