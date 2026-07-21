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
import { config, projectRoot } from './config'
import { logger } from './utils/logger'
import { getEventByOtp } from './db'

const app = express()
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

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(cookieParser())
app.use(requestLogger)

app.use(express.static(path.join(projectRoot, 'public'), {
  maxAge: '1y',
  etag: false,
  immutable: true,
}))

app.use('/api/auth', authRoutes)
app.use('/api/booth', boothRoutes)
app.use('/api/share', shareRoutes)
app.use('/api/upload', authMiddleware, uploadRoutes)
app.use('/api/admin', authMiddleware, adminRoutes)
app.use('/api/health', healthRoutes)
app.use('/api/photos', authMiddleware, express.static(config.storage.photos))

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
  if (req.path.startsWith('/api/')) {
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
