import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { getEventByOtp } from '../db'
import { logger } from '../utils/logger'

const loginAttempts = new Map<string, { count: number; resetTime: number }>()
const otpAttempts = new Map<string, { count: number; resetTime: number }>()

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
  if (checkOtpRateLimit(req, res)) return

  const otp = req.headers['x-booth-otp'] as string
  if (!otp) {
    return res.status(401).json({ error: 'No OTP provided' })
  }

  const event = getEventByOtp(otp)
  if (!event) {
    recordFailedOtpAttempt(req)
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

export function checkOtpRateLimit(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const attempts = otpAttempts.get(ip)
  if (attempts && Date.now() <= attempts.resetTime && attempts.count >= 20) {
    logger.warn(`OTP rate limit exceeded for IP: ${ip}`)
    res.status(429).json({ error: 'Too many failed OTP attempts. Try again later.' })
    return true
  }
  return false
}

export function recordFailedOtpAttempt(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const attempts = otpAttempts.get(ip) || { count: 0, resetTime: now + 15 * 60 * 1000 }
  
  if (now > attempts.resetTime) {
    attempts.count = 1
    attempts.resetTime = now + 15 * 60 * 1000
  } else {
    attempts.count++
  }
  otpAttempts.set(ip, attempts)
}

