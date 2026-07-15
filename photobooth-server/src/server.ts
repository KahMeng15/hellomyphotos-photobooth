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
import healthRoutes from './routes/health'

import { authMiddleware } from './middleware/authMiddleware'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { config } from './config'
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

app.use(express.static(path.join(__dirname, '../../public'), {
  maxAge: '1y',
  etag: false,
  immutable: true,
}))

app.use('/api/auth', authRoutes)
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

io.on('connection', (socket) => {
  logger.info(`Operator connected: ${socket.id}`)

  socket.on('frame-override', (data: { frameId: string }) => {
    io.emit('booth-command', { type: 'frame-override', frameId: data.frameId })
  })

  socket.on('trigger-reshot', () => {
    io.emit('booth-command', { type: 'reshot' })
  })

  socket.on('booth-pause', (data: { paused: boolean }) => {
    io.emit('booth-command', { type: 'booth-pause', paused: data.paused })
  })

  socket.on('booth-status', (data: { state: string; online: boolean }) => {
    io.emit('booth-status', data)
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

server.listen(config.port, () => {
  logger.info(`hellomyphoto server running on http://localhost:${config.port}`)
  logger.info(`Environment: ${config.nodeEnv}`)
})

export { app, server, io }
