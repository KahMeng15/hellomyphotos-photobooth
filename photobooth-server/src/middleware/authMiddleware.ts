import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { getEventByOtp } from '../db'
import { logger } from '../utils/logger'

export interface AuthRequest extends Request {
  user?: any
  eventId?: string
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1]
  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  jwt.verify(token, config.jwt.secret, (err: any, decoded: any) => {
    if (err) return res.status(401).json({ error: 'Invalid token' })
    ;(req as any).user = decoded
    next()
  })
}

export function boothAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const otp = req.headers['x-booth-otp'] as string
  if (!otp) {
    return res.status(401).json({ error: 'No OTP provided' })
  }

  const event = getEventByOtp(otp)
  if (!event) {
    return res.status(401).json({ error: 'Invalid or expired OTP' })
  }

  ;(req as any).eventId = event.id
  next()
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    if (!roles.includes(user.role)) {
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
