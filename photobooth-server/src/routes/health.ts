import { Router, Request, Response } from 'express'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { config } from '@hellomyphotos/shared'
import { jobQueue } from '../queue'
import { io } from '../server'

const router = Router()
const startTime = Date.now()

router.get('/', async (req: Request, res: Response) => {
  try {
    let photoCount = 0
    let frameCount = 0

    try {
      const photos = await fs.readdir(config.storage.photos)
      photoCount = photos.length
    } catch {}

    try {
      const frames = await fs.readdir(config.storage.frames)
      frameCount = frames.length
    } catch {}

    let diskFree = 0
    try {
      const stat = await fs.statfs(config.storage.photos)
      diskFree = (stat.bsize * stat.bfree) / (1024 * 1024 * 1024)
    } catch {}

    const wsConnections = (await io.fetchSockets()).length

    const health = {
      status: 'healthy',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      system: {
        platform: os.platform(),
        memory: {
          total: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`,
          free: `${Math.round(os.freemem() / (1024 * 1024 * 1024))}GB`,
          usagePercent: Math.round((1 - os.freemem() / os.totalmem()) * 100),
        },
        cpu: os.cpus().length,
        loadavg: os.loadavg(),
      },
      storage: {
        photos: photoCount,
        frames: frameCount,
        diskFree: `${diskFree.toFixed(1)}GB`,
      },
      queue: jobQueue.stats,
      connections: {
        websocket: wsConnections,
      },
    }

    res.json(health)
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
    })
  }
})

export default router
