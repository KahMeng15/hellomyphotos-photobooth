import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
import { config } from '../config'
import { logger } from '../utils/logger'
import { authMiddleware } from '../middleware/authMiddleware'
import { ensureSession, createShareToken, getShareToken } from '../db'

const router = Router()

function extractSessionId(filename: string): string | null {
  const match = filename.match(/^(.+)_(\d+)\.\w+$/)
  return match ? match[1] : null
}

router.post('/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' })
    }

    const files = await fs.readdir(config.storage.photos)
    const sessionFiles = files.filter((f) => f.startsWith(sessionId) && !f.includes('_thumb') && !f.includes('_strip'))
    const photoCount = sessionFiles.length

    ensureSession(sessionId, photoCount, req.body.frameName || null)
    const token = createShareToken(sessionId)

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${token}`
    logger.info(`Share link created for session ${sessionId}: ${shareUrl}`)

    res.json({ success: true, token, url: shareUrl })
  } catch (error: any) {
    logger.error(`Share link creation failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const data = getShareToken(req.params.token)
    if (!data) {
      return res.status(404).json({ error: 'Share link not found' })
    }

    const files = await fs.readdir(config.storage.photos)
    const sessionFiles = files
      .filter((f) => f.startsWith(data.session_id) && !f.includes('_thumb') && !f.includes('_strip'))
      .sort()

    const photos = await Promise.all(
      sessionFiles.map(async (name) => {
        const stat = await fs.stat(path.join(config.storage.photos, name))
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
      sessionId: data.session_id,
      photoCount: data.photo_count,
      frameName: data.frame_name,
      createdAt: data.created_at,
      photos,
    })
  } catch (error: any) {
    logger.error(`Share link access failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:token/photo/:filename', async (req: Request, res: Response) => {
  try {
    const data = getShareToken(req.params.token)
    if (!data) {
      return res.status(404).json({ error: 'Share link not found' })
    }

    const filename = req.params.filename
    const filePath = path.join(config.storage.photos, filename)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(path.resolve(config.storage.photos))) {
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
