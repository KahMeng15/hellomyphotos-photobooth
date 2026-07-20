import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { logger } from '../utils/logger'
import { authMiddleware } from '../middleware/authMiddleware'
import { getEvent } from '../db'

const router = Router()

// In-memory share tokens for events
const shareTokens = new Map<string, string>() // token → eventId

function extractSessionId(filename: string): string | null {
  const match = filename.match(/^(.+)_(\d+)\.\w+$/)
  return match ? match[1] : null
}

router.post('/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.body
    if (!eventId) {
      return res.status(400).json({ error: 'eventId required' })
    }

    const event = getEvent(eventId)
    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    // Find existing token or create new
    let token: string | undefined
    for (const [t, eid] of shareTokens) {
      if (eid === eventId) { token = t; break }
    }
    if (!token) {
      token = uuidv4()
      shareTokens.set(token, eventId)
    }

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${token}`
    logger.info(`Share link created for event ${eventId}: ${shareUrl}`)

    res.json({ success: true, token, url: shareUrl })
  } catch (error: any) {
    logger.error(`Share link creation failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const eventId = shareTokens.get(req.params.token)
    if (!eventId) {
      return res.status(404).json({ error: 'Share link not found' })
    }

    const event = getEvent(eventId)
    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const eventDir = config.eventPhotosDir(eventId)
    let files: string[] = []
    try {
      files = await fs.readdir(eventDir)
    } catch {
      files = []
    }

    const sessionFiles = files
      .filter((f) => !f.includes('_thumb') && !f.includes('_strip'))
      .sort()

    const photos = await Promise.all(
      sessionFiles.map(async (name) => {
        const stat = await fs.stat(path.join(eventDir, name))
        const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
        const thumbExists = files.includes(thumbName)
        return {
          id: name,
          url: `/api/share/${req.params.token}/photo/${name}`,
          thumbnail: thumbExists ? `/api/share/${req.params.token}/photo/${thumbName}` : null,
          size: stat.size,
          width: 0,
          height: 0,
        }
      })
    )

    res.json({
      eventId: event.id,
      eventName: event.name,
      eventDate: event.date,
      photoCount: photos.length,
      photos,
    })
  } catch (error: any) {
    logger.error(`Share link access failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:token/photo/:filename', async (req: Request, res: Response) => {
  try {
    const eventId = shareTokens.get(req.params.token)
    if (!eventId) {
      return res.status(404).json({ error: 'Share link not found' })
    }

    const eventDir = config.eventPhotosDir(eventId)
    const filename = req.params.filename
    const filePath = path.join(eventDir, filename)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(path.resolve(eventDir))) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    const download = req.query.download !== undefined

    if (download) {
      const ext = path.extname(filename).toLowerCase()
      if (ext === '.webp') {
        const index = filename.match(/_(\d+)\.webp$/)
        const photoNum = index ? index[1] : '1'

        const webpBuf = await fs.readFile(filePath)
        const jpegBuf = await sharp(webpBuf).jpeg({ quality: 85 }).toBuffer()

        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Content-Disposition', `attachment; filename="photo-${photoNum}.jpg"`)
        res.setHeader('Content-Length', jpegBuf.length)
        return res.send(jpegBuf)
      }
    }

    try {
      await fs.stat(filePath)
    } catch {
      return res.status(404).json({ error: 'Photo not found' })
    }

    const ext = path.extname(filename).toLowerCase()
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
    logger.error(`Photo serving failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

export default router
