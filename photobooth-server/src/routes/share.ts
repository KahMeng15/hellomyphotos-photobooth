import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
const archiver = require('archiver')
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { logger } from '../utils/logger'
import { authMiddleware } from '../middleware/authMiddleware'
import { getEvent, getPhotoSessionByShareId, getPhotoSession, logShareAnalytics } from '../db'
import { UAParser } from 'ua-parser-js'
import { getActiveFrames } from '../utils/frames'

const router = Router()

// In-memory share tokens for events
const shareTokens = new Map<string, string>() // token → eventId

function extractSessionId(filename: string): string | null {
  const match = filename.match(/^(.+)_(\d+)\.\w+$/)
  return match ? match[1] : null
}

function getExpiryDate(event: any): Date | null {
  if (event.expiry_type !== 'none' && event.expiry_value) {
    if (event.expiry_type === 'absolute') {
      return new Date(event.expiry_value)
    } else if (event.expiry_type === 'relative') {
      const eventStart = new Date(event.created_at).getTime()
      let ms = 0
      const [valStr, unit] = event.expiry_value.split('_')
      const val = parseInt(valStr) || 0
      if (unit.startsWith('year')) ms = val * 365 * 24 * 60 * 60 * 1000
      else if (unit.startsWith('month')) ms = val * 30 * 24 * 60 * 60 * 1000
      else if (unit.startsWith('week')) ms = val * 7 * 24 * 60 * 60 * 1000
      else if (unit.startsWith('day')) ms = val * 24 * 60 * 60 * 1000
      else if (unit.startsWith('hour')) ms = val * 60 * 60 * 1000
      else if (unit.startsWith('minute')) ms = val * 60 * 1000
      
      return new Date(eventStart + ms)
    }
  }
  return null
}

function checkExpiry(event: any) {
  const expiryDate = getExpiryDate(event)
  if (expiryDate && expiryDate.getTime() < Date.now()) return true
  return false
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
    const token = req.params.token
    let eventId = shareTokens.get(token)
    let isSessionToken = false
    let sessionFilter = ''

    if (!eventId) {
      let sess = getPhotoSessionByShareId(token)
      if (!sess) sess = getPhotoSession(token) as any
      if (sess) {
        eventId = sess.event_id
        isSessionToken = true
        sessionFilter = sess.id
      }
    }

    if (!eventId) return res.status(404).json({ error: 'Share link not found' })

    const event = getEvent(eventId)
    if (!event) return res.status(404).json({ error: 'Event not found' })

    if (checkExpiry(event)) {
      return res.json({ expired: true })
    }

    const activeFrames = await getActiveFrames(eventId)

    let photos: any[] = []

    if (activeFrames.length > 0) {
      const framedDir = config.eventFramedPhotos(eventId)
      let framedFiles: string[] = []
      try {
        framedFiles = await fs.readdir(framedDir)
      } catch {
        framedFiles = []
      }

      const sessionFiles = framedFiles
        .filter((f) => !f.includes('_thumb') && f.endsWith('.webp'))
        .filter((f) => isSessionToken ? f.startsWith(sessionFilter) : true)
        .sort()

      photos = await Promise.all(
        sessionFiles.map(async (name, i) => {
          const stat = await fs.stat(path.join(framedDir, name))
          const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
          const thumbExists = framedFiles.includes(thumbName)
          const jpegName = name.replace(/(\.webp)$/, '.jpg')
          const jpegExists = framedFiles.includes(jpegName)

          let frameId = ''
          let frameName = ''
          for (const f of activeFrames) {
            if (name.includes(`_${f.id}`)) {
              frameId = f.id
              frameName = f.config.name
              break
            }
          }

          const isObfuscated = event.obfuscate_links === 1
          const idToUse = isObfuscated ? `framed_idx_${i}` : name
          const thumbIdToUse = isObfuscated ? `framed_idx_${i}_thumb` : thumbName
          const jpegIdToUse = isObfuscated ? `framed_idx_${i}_jpeg` : jpegName

          return {
            id: idToUse,
            frameId,
            frameName,
            url: `/api/share/${token}/photo/${idToUse}`,
            thumbnail: thumbExists ? `/api/share/${token}/photo/${thumbIdToUse}` : null,
            downloadUrl: jpegExists ? `/api/share/${token}/photo/${jpegIdToUse}` : `/api/share/${token}/photo/${idToUse}`,
            size: stat.size,
            width: 0,
            height: 0,
          }
        })
      )
    } else {
      const eventDir = config.eventPhotosDir(eventId)
      let files: string[] = []
      try {
        files = await fs.readdir(eventDir)
      } catch {
        files = []
      }

      const sessionFiles = files
        .filter((f) => !f.includes('_thumb') && !f.includes('_strip'))
        .filter((f) => isSessionToken ? f.startsWith(sessionFilter) : true)
        .sort()

      photos = await Promise.all(
        sessionFiles.map(async (name, i) => {
          const stat = await fs.stat(path.join(eventDir, name))
          const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
          const thumbExists = files.includes(thumbName)
          
          const isObfuscated = event.obfuscate_links === 1
          const idToUse = isObfuscated ? `idx_${i}` : name
          const thumbIdToUse = isObfuscated ? `idx_${i}_thumb` : thumbName

          return {
            id: idToUse,
            url: `/api/share/${token}/photo/${idToUse}`,
            thumbnail: thumbExists ? `/api/share/${token}/photo/${thumbIdToUse}` : null,
            downloadUrl: `/api/share/${token}/photo/${idToUse}`,
            size: stat.size,
            width: 0,
            height: 0,
          }
        })
      )
    }

    const expiryDate = getExpiryDate(event)

    res.json({
      eventId: event.id,
      eventName: event.name,
      organizer: (event as any).organizer || '',
      contactInfo: (event as any).contact_info || '',
      eventDate: event.date,
      photoCount: photos.length,
      expiresAt: expiryDate ? expiryDate.toISOString() : null,
      photos,
    })
  } catch (error: any) {
    logger.error(`Share link access failed: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.post('/:token/analytics', async (req: Request, res: Response) => {
  try {
    const token = req.params.token
    const { source } = req.body
    
    let eventId = shareTokens.get(token)
    if (!eventId) {
      let sess = getPhotoSessionByShareId(token)
      if (!sess) sess = getPhotoSession(token) as any
      if (sess) eventId = sess.event_id
    }
    if (!eventId) return res.status(404).json({ error: 'Not found' })

    const parser = new UAParser(req.headers['user-agent'])
    const deviceType = parser.getDevice().type || 'Desktop'
    const os = parser.getOS().name || 'Unknown OS'
    const browser = parser.getBrowser().name || 'Unknown Browser'
    const ip = req.ip || req.socket.remoteAddress || 'Unknown IP'

    logShareAnalytics(token, ip, deviceType, os, browser, 'view', null, source)
    res.json({ success: true })
  } catch (error: any) {
    logger.error(`Analytics error: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:token/download-all', async (req: Request, res: Response) => {
  try {
    const token = req.params.token
    let eventId = shareTokens.get(token)
    let isSessionToken = false
    let sessionFilter = ''

    if (!eventId) {
      let sess = getPhotoSessionByShareId(token)
      if (!sess) sess = getPhotoSession(token) as any
      if (sess) {
        eventId = sess.event_id
        isSessionToken = true
        sessionFilter = sess.id
      }
    }

    if (!eventId) return res.status(404).json({ error: 'Share link not found' })

    const event = getEvent(eventId)
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (checkExpiry(event)) return res.status(403).json({ error: 'Expired' })

    const eventDir = config.eventPhotosDir(eventId)
    let files: string[] = []
    try { files = await fs.readdir(eventDir) } catch {}

    const sessionFiles = files
      .filter((f) => !f.includes('_thumb') && !f.includes('_strip'))
      .filter((f) => isSessionToken ? f.startsWith(sessionFilter) : true)
      .sort()

    if (sessionFiles.length === 0) {
      return res.status(404).json({ error: 'No photos found' })
    }

    const safeEventName = event.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const zipFilename = `${eventId}_${safeEventName}_photos.zip`

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`)

    const archive = new archiver.ZipArchive({ zlib: { level: 9 } })
    archive.on('error', (err: Error) => { throw err })
    archive.pipe(res)

    for (let i = 0; i < sessionFiles.length; i++) {
      const filename = sessionFiles[i]
      const filePath = path.join(eventDir, filename)
      const indexMatch = filename.match(/_(\d+)\.\w+$/)
      const photoNum = indexMatch ? indexMatch[1] : (i + 1).toString()
      const ext = path.extname(filename).toLowerCase()

      try {
        if (ext === '.webp') {
          const webpBuf = await fs.readFile(filePath)
          const jpegBuf = await sharp(webpBuf).jpeg({ quality: 85 }).toBuffer()
          archive.append(jpegBuf, { name: `${eventId}_${safeEventName}_image_${photoNum}.jpg` })
        } else {
          archive.file(filePath, { name: `${eventId}_${safeEventName}_image_${photoNum}${ext}` })
        }
      } catch (err) {
        logger.error(`Error adding file to zip: ${filename}`, err)
      }
    }

    const parser = new UAParser(req.headers['user-agent'])
    const deviceType = parser.getDevice().type || 'Desktop'
    const os = parser.getOS().name || 'Unknown OS'
    const browser = parser.getBrowser().name || 'Unknown Browser'
    const ip = req.ip || req.socket.remoteAddress || 'Unknown IP'
    logShareAnalytics(token, ip, deviceType, os, browser, 'download', 'all')

    await archive.finalize()
  } catch (error: any) {
    logger.error(`Download all failed: ${error.message}`)
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    }
  }
})

router.get('/:token/photo/:filename', async (req: Request, res: Response) => {
  try {
    const token = req.params.token
    const filename = req.params.filename

    let eventId = shareTokens.get(token)
    let isSessionToken = false
    let sessionFilter = ''

    if (!eventId) {
      let sess = getPhotoSessionByShareId(token)
      if (!sess) sess = getPhotoSession(token) as any
      if (sess) {
        eventId = sess.event_id
        isSessionToken = true
        sessionFilter = sess.id
      }
    }

    if (!eventId) return res.status(404).json({ error: 'Share link not found' })

    const event = getEvent(eventId)
    if (!event) return res.status(404).json({ error: 'Event not found' })
    if (checkExpiry(event)) return res.status(403).json({ error: 'Expired' })

    let targetFilename = filename
    const isObfuscated = event.obfuscate_links === 1
    const isFramedRequest = filename.includes('_frm_') || filename.startsWith('framed_idx_')

    const baseDir = isFramedRequest ? config.eventFramedPhotos(eventId) : config.eventPhotosDir(eventId)

    if (isObfuscated) {
      if (!filename.startsWith('idx_') && !filename.startsWith('framed_idx_')) {
        return res.status(403).json({ error: 'Direct file access disabled' })
      }
      
      let files: string[] = []
      try { files = await fs.readdir(baseDir) } catch {}

      const match = filename.match(/^(framed_)?idx_(\d+)(_thumb|_jpeg)?$/)
      if (!match) return res.status(404).json({ error: 'Not found' })
      const idx = parseInt(match[2])
      const modifier = match[3]

      const sessionFiles = files
        .filter((f) => !f.includes('_thumb') && !f.includes('_strip') && (!isFramedRequest || f.endsWith('.webp')))
        .filter((f) => isSessionToken ? f.startsWith(sessionFilter) : true)
        .sort()

      const baseFile = sessionFiles[idx]
      if (!baseFile) return res.status(404).json({ error: 'Photo not found' })

      if (modifier === '_thumb') {
        targetFilename = baseFile.replace(/(\.\w+)$/, '_thumb$1')
      } else if (modifier === '_jpeg') {
        targetFilename = baseFile.replace(/(\.\w+)$/, '.jpg')
      } else {
        targetFilename = baseFile
      }
    }

    const filePath = path.join(baseDir, targetFilename)
    const resolvedPath = path.resolve(filePath)

    if (!resolvedPath.startsWith(path.resolve(baseDir))) {
      return res.status(400).json({ error: 'Invalid path' })
    }

    const download = req.query.download !== undefined

    if (download) {
      const parser = new UAParser(req.headers['user-agent'])
      const deviceType = parser.getDevice().type || 'Desktop'
      const os = parser.getOS().name || 'Unknown OS'
      const browser = parser.getBrowser().name || 'Unknown Browser'
      const ip = req.ip || req.socket.remoteAddress || 'Unknown IP'
      logShareAnalytics(token, ip, deviceType, os, browser, 'download', targetFilename)
      
      const safeEventName = event.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      const indexMatch = targetFilename.match(/_(\d+)\.\w+$/)
      const photoNum = indexMatch ? indexMatch[1] : '1'

      const ext = path.extname(targetFilename).toLowerCase()
      if (ext === '.webp') {
        const downloadFilename = `${eventId}_${safeEventName}_image_${photoNum}.jpg`

        const webpBuf = await fs.readFile(filePath)
        const jpegBuf = await sharp(webpBuf).jpeg({ quality: 85 }).toBuffer()

        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`)
        res.setHeader('Content-Length', jpegBuf.length.toString())
        return res.send(jpegBuf)
      } else {
         const downloadFilename = `${eventId}_${safeEventName}_image_${photoNum}${ext}`
         res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`)
      }
    }

    try {
      await fs.stat(filePath)
    } catch {
      return res.status(404).json({ error: 'Photo not found' })
    }

    const ext = path.extname(targetFilename).toLowerCase()
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
