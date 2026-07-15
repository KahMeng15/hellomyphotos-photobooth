import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      details: err.details,
    })
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    })
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: 'Upload error',
      details: err.message,
    })
  }

  logger.error(`Unhandled error: ${err.message}`, {
    path: req.path,
    method: req.method,
    stack: err.stack,
  })

  res.status(500).json({
    error: 'Internal server error',
  })
}
