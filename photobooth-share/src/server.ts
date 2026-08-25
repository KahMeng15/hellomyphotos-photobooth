import dotenv from 'dotenv'
dotenv.config({ path: '../.env' }) // Fallback to root .env if running locally

import express from 'express'
import http from 'http'
import compression from 'compression'
import helmet from 'helmet'
import cors from 'cors'
import path from 'path'

import { config, logger, shareRateLimiter } from '@hellomyphotos/shared'
import shareRoutes from './routes/share'

const app = express()

app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(express.json())

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}
app.use(cors(corsOptions))

const basePath = '/snapsync'

app.use(`${basePath}/api/share`, shareRateLimiter, shareRoutes)

const isDev = process.argv.includes('tsx') || __dirname.includes('src');
const publicPath = path.join(__dirname, isDev ? '..' : '../../', 'public');
app.use(`${basePath}/share`, express.static(publicPath))

app.get(`${basePath}/share/*`, (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'))
})

const port = 3001
const server = http.createServer(app)

server.listen(port, () => {
  logger.info(`Share server listening on port ${port}`)
})
