import { Router, Request, Response } from 'express'
import { config, logger, getEvent } from '@hellomyphotos/shared'
// Note: logShareAnalytics was in db.ts but wasn't exported via index? Let's export it.
import Database from 'better-sqlite3'
import path from 'path'
const dbPath = path.join(config.storage.logs, '..', 'db', 'hellomyphoto.db')
const db = new Database(dbPath)

const router = Router()

router.post('/analytics', (req: Request, res: Response) => {
  const secret = req.headers['x-internal-secret']
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' })
  }
  
  try {
    const { args } = req.body
    if (!args || !Array.isArray(args)) return res.status(400).json({ error: 'Invalid payload' })
    
    // args: [shareId, ip, deviceType, os, browser, action, photoId, source]
    db.prepare(`
      INSERT INTO share_analytics (
        id, share_id, ip_address, device_type, os, browser, action, photo_id, source
      ) VALUES (
        lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7])
    
    res.json({ success: true })
  } catch (err: any) {
    logger.error('Internal analytics failed: ' + err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
