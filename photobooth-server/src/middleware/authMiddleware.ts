import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { logger } from '../utils/logger'

export interface AuthRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
    sessionId: string
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.accessToken || req.headers.authorization?.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' })
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any
    req.user = decoded
    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' })
    }
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

const loginAttempts = new Map<string, { count: number; resetTime: number }>()

export function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()

  const attempts = loginAttempts.get(ip)

  if (!attempts || now > attempts.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + config.rateLimit.login.windowMs })
    return next()
  }

  if (attempts.count >= config.rateLimit.login.max) {
    logger.warn(`Login rate limit exceeded for IP: ${ip}`)
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' })
  }

  attempts.count++
  next()
}
