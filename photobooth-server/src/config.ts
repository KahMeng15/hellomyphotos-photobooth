import path from 'path'

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

  operator: {
    email: process.env.OPERATOR_EMAIL || 'operator@hellomyphoto.local',
    password: process.env.OPERATOR_PASSWORD || 'admin123',
  },

  storage: {
    photos: path.join(__dirname, '../../storage/photos'),
    frames: path.join(__dirname, '../../storage/frames'),
    logs: path.join(__dirname, '../../storage/logs'),
  },

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
    avifQuality: 60,
    thumbnailQuality: 60,
    stripQuality: 78,
    maxConcurrent: 3,
    thumbnailSize: 400,
    gifFrameDelay: 500,
    gifMaxSize: 5 * 1024 * 1024,
  },
}
