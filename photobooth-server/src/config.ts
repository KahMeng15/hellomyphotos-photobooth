import path from 'path'
import fs from 'fs'

function getProjectRoot(startDir: string): string {
  let current = path.resolve(startDir)
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current
    }
    current = path.join(current, '..')
  }
  return startDir
}

const projectRoot = getProjectRoot(__dirname)

export { projectRoot }

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'dev-refresh',
    accessExpiry: '15m',
    refreshExpiry: '7d',
  },

  cookie: {
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: process.env.COOKIE_PATH || '/',
    sameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'strict' | 'none',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  },

  operator: {
    email: process.env.OPERATOR_EMAIL || 'operator@hellomyphoto.local',
    password: process.env.OPERATOR_PASSWORD || 'admin123',
  },

  storage: {
    photos: path.join(projectRoot, 'storage/photos'),
    frames: path.join(projectRoot, 'storage/frames'),
    logs: path.join(projectRoot, 'storage/logs'),
  },

  eventPhotosDir: (eventId: string) => path.join(projectRoot, 'storage/photos', eventId),
  eventFrames: (eventId: string) => path.join(projectRoot, 'storage/frames', eventId),
  eventFramedPhotos: (eventId: string) => path.join(projectRoot, 'storage/photos', eventId, 'framed'),

  upload: {
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 10,
  },

  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],

  rateLimit: {
    login: { max: 5, windowMs: 15 * 60 * 1000 },
    api: { max: 100, windowMs: 60 * 1000 },
  },

  imageProcessing: {
    webpQuality: 75,
    framedJpegQuality: 95,
    avifQuality: 60,
    thumbnailQuality: 60,
    stripQuality: 78,
    maxConcurrent: 3,
    thumbnailSize: 400,
    gifFrameDelay: 500,
    gifMaxSize: 5 * 1024 * 1024,
  },
}
