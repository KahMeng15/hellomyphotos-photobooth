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

io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (!token) return next(new Error('No auth token'))

  jwt.verify(token, config.jwt.secret, (err: any, decoded: any) => {
    if (err) return next(new Error('Invalid token'))
    socket.data.user = decoded
    next()
  })
})

let boothLastSeen = 0
const BOOTH_TIMEOUT = 30000

export function updateBoothHeartbeat() {
  boothLastSeen = Date.now()
  io.emit('booth-status', { state: 'online', online: true })
}

function getBoothStatus() {
  const online = Date.now() - boothLastSeen < BOOTH_TIMEOUT
  return { state: online ? 'online' : 'offline', online }
}

setInterval(() => {
  io.emit('booth-status', getBoothStatus())
}, 10000)

io.on('connection', (socket) => {
  logger.info(`Operator connected: ${socket.id}`)

  socket.emit('booth-status', getBoothStatus())

  socket.on('frame-override', (data: { frameId: string }) => {
    io.emit('booth-command', { type: 'frame-override', frameId: data.frameId })
  })

  socket.on('trigger-reshot', () => {
    io.emit('booth-command', { type: 'reshot' })
  })

  socket.on('booth-pause', (data: { paused: boolean }) => {
    io.emit('booth-command', { type: 'booth-pause', paused: data.paused })
  })

  socket.on('new-media', (data: any) => {
    io.emit('new-media', data)
  })

  socket.on('queue-update', (data: { depth: number; offline?: number }) => {
    io.emit('queue-update', data)
  })

  socket.on('disconnect', () => {
    logger.info(`Operator disconnected: ${socket.id}`)
  })
})

app.use(errorHandler)

app.get('/share/*', (req, res) => {
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

export { app, server, io }
