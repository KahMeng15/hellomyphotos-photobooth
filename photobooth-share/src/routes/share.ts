import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
const archiver = require('archiver')
import { v4 as uuidv4 } from 'uuid'
import { config, logger, getEvent, getPhotoSessionByShareId, getPhotoSession, getSessionUploadStatus, getSessionDimensions, getOrCreateEventShareToken, getEventIdByShareToken, getEventByOtp, getActiveFrames, generateSignedUrl, verifySignedUrl } from '@hellomyphotos/shared'
import { UAParser } from 'ua-parser-js'

const router = Router()

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


router.get('/:token/status', async (req: Request, res: Response) => {
  try {
    const { token } = req.params
    const row = getSessionUploadStatus(token)
    if (!row) return res.status(404).json({ error: 'not found' })
    // Count photos: look up session to get event_id
    let photosReady = 0
    try {
      // Try framed photos dir first, then raw
      let sess = getPhotoSessionByShareId(token)
      if (!sess) sess = getPhotoSession(token) as any
      if (sess?.event_id) {
        const eventDir = config.eventPhotosDir(sess.event_id)
        const files = await fs.readdir(eventDir).catch(() => [])
        const sessionFiles = (files as string[]).filter(f => f.startsWith(sess!.id) && !f.includes('_thumb') && !f.includes('_strip'))
        photosReady = sessionFiles.length
      }
    } catch {}
    res.json({
      status: row.upload_status || 'reserved',
      photosReady,
      shareId: row.share_id,
      uploadStartedAt: row.upload_started_at,
      uploadCompletedAt: row.upload_completed_at,
      sizeBytes: row.upload_size_bytes,
      avgSpeedKbps: row.upload_avg_speed_kbps,
    })
  } catch (error: any) {
    logger.error(`Status endpoint error: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token
    let eventId = getEventIdByShareToken(token)
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
          let frameId = ''
          let frameName = ''
          let isActive = false
          for (const f of activeFrames) {
            if (name.includes(`_${f.id}`)) {
              frameId = f.id
              frameName = f.config.name
              isActive = true
              break
            }
          }

          if (!isActive) return null

          const stat = await fs.stat(path.join(framedDir, name))
          const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
          const thumbExists = framedFiles.includes(thumbName)
          const jpegName = name.replace(/(\.webp)$/, '.jpg')
          const jpegExists = framedFiles.includes(jpegName)

          const isObfuscated = event.obfuscate_links === 1
          const idToUse = isObfuscated ? `framed_idx_${i}` : name
          const thumbIdToUse = isObfuscated ? `framed_idx_${i}_thumb` : thumbName
          const jpegIdToUse = isObfuscated ? `framed_idx_${i}_jpeg` : jpegName

          const matchingFrame = activeFrames.find(f => f.id === frameId)
          return {
            id: idToUse,
            frameId,
            frameName,
            url: generateSignedUrl(token, idToUse, 3600, '/snapsync/api/share'),
            thumbnail: thumbExists ? generateSignedUrl(token, thumbIdToUse, 3600, '/snapsync/api/share') : null,
            downloadUrl: jpegExists ? generateSignedUrl(token, jpegIdToUse, 3600, '/snapsync/api/share') : generateSignedUrl(token, idToUse, 3600, '/snapsync/api/share'),
            size: stat.size,
            width: matchingFrame?.config?.canvasWidth || 0,
            height: matchingFrame?.config?.canvasHeight || 0,
            timestamp: stat.birthtime.toISOString(),
          }
        })
      )
      photos = photos.filter((p) => p !== null)
    }
    
    if ((event as any).share_originals !== 0) {
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

      const rawPhotos = await Promise.all(
        sessionFiles.map(async (name, i) => {
          const stat = await fs.stat(path.join(eventDir, name))
          const thumbName = name.replace(/(\.\w+)$/, '_thumb$1')
          const thumbExists = files.includes(thumbName)
          
          const isObfuscated = event.obfuscate_links === 1
          const idToUse = isObfuscated ? `idx_${i}` : name
          const thumbIdToUse = isObfuscated ? `idx_${i}_thumb` : thumbName

          const sessionDim = getSessionDimensions(isSessionToken ? sessionFilter : extractSessionId(name) || '')
          return {
            id: idToUse,
            url: generateSignedUrl(token, idToUse, 3600, '/snapsync/api/share'),
            thumbnail: thumbExists ? generateSignedUrl(token, thumbIdToUse, 3600, '/snapsync/api/share') : null,
            downloadUrl: generateSignedUrl(token, idToUse, 3600, '/snapsync/api/share'),
            size: stat.size,
            width: sessionDim.width,
            height: sessionDim.height,
            timestamp: stat.birthtime.toISOString(),
            frameId: 'unframed',
            frameName: 'Original Photos'
          }
        })
      )
      photos = [...photos, ...rawPhotos]
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
    
    let eventId = getEventIdByShareToken(token)
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

    fetch((process.env.ADMIN_INTERNAL_URL || 'http://localhost:3000') + '/internal/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || ''
      },
      body: JSON.stringify({ args: [token, ip, deviceType, os, browser, 'view', null, source] })
    }).catch(err => logger.error('Analytics write failed', err))
    res.json({ success: true })
  } catch (error: any) {
    logger.error(`Analytics error: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

router.get('/:token/download-all', async (req: Request, res: Response) => {
  try {
    const token = req.params.token
    let eventId = getEventIdByShareToken(token)
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
    fetch((process.env.ADMIN_INTERNAL_URL || 'http://localhost:3000') + '/internal/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || ''
      },
      body: JSON.stringify({ args: [token, ip, deviceType, os, browser, 'download', 'all'] })
    }).catch(err => logger.error('Analytics write failed', err))

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
    const { exp, sig, otp } = req.query
    let isValidRequest = false

    if (otp) {
      const event = getEventByOtp(otp as string)
      if (event) isValidRequest = true
    }
    
    if (!isValidRequest) {
      if (!verifySignedUrl(token, filename, exp as string, sig as string)) {
        return res.status(403).json({ error: 'Invalid or expired signature' })
      }
    }

    let eventId = getEventIdByShareToken(token)
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
      fetch((process.env.ADMIN_INTERNAL_URL || 'http://localhost:3000') + '/internal/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || ''
      },
      body: JSON.stringify({ args: [token, ip, deviceType, os, browser, 'download', targetFilename] })
    }).catch(err => logger.error('Analytics write failed', err))
      
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
