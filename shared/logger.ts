import winston from 'winston'
import path from 'path'
import DailyRotateFile from 'winston-daily-rotate-file'
import { config } from './config'

const logDir = config.storage.logs

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : ''
    return `${timestamp} [${level}]: ${message} ${metaStr}`
  })
)

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    ),
  }),
  new DailyRotateFile({
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    format: logFormat,
    symlinkName: 'latest.log',
    createSymlink: true
  }),
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    level: 'error',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    format: logFormat,
    symlinkName: 'latest-error.log',
    createSymlink: true
  })
]

export const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  transports,
})
