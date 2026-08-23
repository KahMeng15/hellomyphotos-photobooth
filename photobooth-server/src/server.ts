import express from 'express'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'
import jwt from 'jsonwebtoken'

import authRoutes from './routes/auth'
import uploadRoutes from './routes/upload'
import adminRoutes from './routes/admin'
import boothRoutes from './routes/booth'
import healthRoutes from './routes/health'
import shareRoutes from './routes/share'

import { authMiddleware } from './middleware/authMiddleware'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { csrfProtection, setCsrfToken } from './middleware/csrfMiddleware'
import { config, projectRoot } from './config'
import { logger } from './utils/logger'
import { getEventByOtp } from './db'

const app = express()

// Trust the reverse proxy (Nginx) so req.ip is correct for rate limiting
app.set('trust proxy', 1)

const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: {
    origin: config.allowedOrigins,
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
})

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))
app.use(compression())
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
}))

// Reduce limit to prevent DoS, 10mb is plenty for JSON payloads
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))
app.use(cookieParser())
app.use(setCsrfToken)
app.use(requestLogger)

const publicPath = path.join(projectRoot, 'public');
const staticOpts = { maxAge: '1y', etag: false, immutable: true };

app.use(express.static(publicPath, staticOpts));

// Fallback: Also mount on /hellomyphotos-photobooth-test in case Nginx regex blocks don't strip the prefix
app.use('/hellomyphotos-photobooth-test', express.static(publicPath, staticOpts));

const apiRouter = express.Router();
// Apply CSRF protection to routes that rely on cookies
import { adminRateLimiter, shareRateLimiter } from './middleware/rateLimit'

apiRouter.use('/auth', adminRateLimiter, csrfProtection, authRoutes)
apiRouter.use('/upload', adminRateLimiter, csrfProtection, authMiddleware, uploadRoutes)
apiRouter.use('/admin', adminRateLimiter, csrfProtection, authMiddleware, adminRoutes)

// Booth and Share do not use session cookies, so CSRF is not applicable
apiRouter.use('/booth', boothRoutes)
apiRouter.use('/share', shareRateLimiter, shareRoutes)

apiRouter.use('/health', healthRoutes)
apiRouter.use('/photos', adminRateLimiter, authMiddleware, express.static(config.storage.photos))

app.use('/api', apiRouter)
app.use('/hellomyphotos-photobooth-test/api', apiRouter)

// Track booth sockets per event
const boothSockets = new Map<string, Set<string>>()
const socketEventMap = new Map<string, string>()

// Track operator subscriptions per event
const operatorSubscriptions = new Map<string, Set<string>>()

io.use((socket, next) => {
  const token = socket.handshake.auth.token
  const otp = socket.handshake.auth.otp

  if (token) {
    jwt.verify(token, config.jwt.secret, (err: any, decoded: any) => {
      if (err) return next(new Error('Invalid token'))
      socket.data.user = decoded
      socket.data.role = 'operator'
      next()
    })
  } else if (otp) {
    const event = getEventByOtp(otp)
    if (!event) return next(new Error('Invalid or expired OTP'))
    socket.data.role = 'booth'
    socket.data.eventId = event.id
    next()
  } else {
    next(new Error('No auth token or OTP'))
  }
})

io.on('connection', (socket) => {
  if (socket.data.role === 'operator') {
    logger.info(`Operator connected: ${socket.id}`)
    socket.emit('booth-status', getBoothStatus())

    socket.on('subscribe', (eventId: string) => {
      if (!operatorSubscriptions.has(eventId)) {
        operatorSubscriptions.set(eventId, new Set())
      }
      operatorSubscriptions.get(eventId)!.add(socket.id)
      socket.data.subscribedEvents = socket.data.subscribedEvents || []
      socket.data.subscribedEvents.push(eventId)

      const hasBooth = boothSockets.has(eventId) && boothSockets.get(eventId)!.size > 0
      socket.emit('booth-connected', { eventId, connected: hasBooth })
    })

    socket.on('unsubscribe', (eventId: string) => {
      operatorSubscriptions.get(eventId)?.delete(socket.id)
      if (socket.data.subscribedEvents) {
        socket.data.subscribedEvents = socket.data.subscribedEvents.filter((e: string) => e !== eventId)
      }
    })

    socket.on('frame-override', (data: { eventId: string; frameId: string }) => {
      forwardToBooth(data.eventId, { type: 'frame-override', frameId: data.frameId })
    })

    socket.on('trigger-reshot', (data: { eventId: string }) => {
      forwardToBooth(data.eventId, { type: 'reshot' })
    })

    socket.on('booth-pause', (data: { eventId: string; paused: boolean }) => {
      forwardToBooth(data.eventId, { type: 'booth-pause', paused: data.paused })
    })

    socket.on('booth-capture', (data: { eventId: string }) => {
      forwardToBooth(data.eventId, { type: 'capture' })
    })

    socket.on('booth-start', (data: { eventId: string }) => {
      forwardToBooth(data.eventId, { type: 'start' })
    })

    socket.on('booth-go-home', (data: { eventId: string }) => {
      forwardToBooth(data.eventId, { type: 'go-home' })
    })

    socket.on('resolve-booth-error', (data: { eventId: string; errorId: string; action: string }) => {
      forwardToBooth(data.eventId, { type: 'resolve-error', errorId: data.errorId, action: data.action })
      const subs = operatorSubscriptions.get(data.eventId)
      if (subs) {
        for (const sid of subs) {
          if (sid !== socket.id) io.to(sid).emit('booth-error-resolved', { errorId: data.errorId, action: data.action })
        }
      }
    })

    socket.on('disconnect', () => {
      logger.info(`Operator disconnected: ${socket.id}`)
      if (socket.data.subscribedEvents) {
        for (const eventId of socket.data.subscribedEvents) {
          operatorSubscriptions.get(eventId)?.delete(socket.id)
        }
      }
    })
  } else if (socket.data.role === 'booth') {
    const eventId = socket.data.eventId
    logger.info(`Booth connected: ${socket.id} (event=${eventId})`)

    if (!boothSockets.has(eventId)) {
      boothSockets.set(eventId, new Set())
    }
    boothSockets.get(eventId)!.add(socket.id)
    socketEventMap.set(socket.id, eventId)

    socket.emit('authenticated', { eventId, status: 'ok' })

    notifyBoothConnected(eventId, true)

    socket.on('new-media', (data: any) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('new-media', { ...data, eventId })
        }
      }
    })

    socket.on('booth-state', (data: { state: string }) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('booth-state', { ...data, eventId })
        }
      }
    })

    socket.on('booth-error', (data: { errorId: string; message: string; type: string }) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('booth-error', { ...data, eventId })
        }
      }
    })

    socket.on('resolve-booth-error', (data: { errorId: string; action: string }) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('booth-error-resolved', { errorId: data.errorId, action: data.action, eventId })
        }
      }
    })

    socket.on('queue-update', (data: { depth: number; offline?: number }) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('queue-update', { ...data, eventId })
        }
      }
    })

    socket.on('disconnect', () => {
      logger.info(`Booth disconnected: ${socket.id} (event=${eventId})`)
      boothSockets.get(eventId)?.delete(socket.id)
      if (boothSockets.get(eventId)?.size === 0) {
        boothSockets.delete(eventId)
      }
      socketEventMap.delete(socket.id)
      notifyBoothConnected(eventId, false)
    })
  }
})

function forwardToBooth(eventId: string, message: any) {
  const sockets = boothSockets.get(eventId)
  if (!sockets || sockets.size === 0) return
  for (const sid of sockets) {
    io.to(sid).emit('booth-command', message)
  }
}

function notifyBoothConnected(eventId: string, connected: boolean) {
  const subs = operatorSubscriptions.get(eventId)
  if (subs) {
    for (const sid of subs) {
      io.to(sid).emit('booth-connected', { eventId, connected })
    }
  }
}

const BOOTH_TIMEOUT = 30000
function getBoothStatus() {
  return { state: 'offline', online: false }
}

app.use(errorHandler)

app.get('*', (req, res) => {
  const isApi = req.path.startsWith('/api/') || req.path.startsWith('/hellomyphotos-photobooth-test/api/')
  if (isApi) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.sendFile(path.join(projectRoot, 'public', 'index.html'))
})

server.listen(config.port, () => {
  logger.info(`hellomyphoto server running on http://localhost:${config.port}`)
  logger.info(`Environment: ${config.nodeEnv}`)
})

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully...`)
  io.close(() => {
    server.close(() => {
      logger.info('Server closed')
      process.exit(0)
    })
  })
  setTimeout(() => {
    logger.error('Forced shutdown after timeout')
    process.exit(1)
  }, 5000)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export { app, server, io, boothSockets, operatorSubscriptions }
