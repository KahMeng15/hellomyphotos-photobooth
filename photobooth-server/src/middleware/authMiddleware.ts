import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '@hellomyphotos/shared'
import { getEventByOtp } from '@hellomyphotos/shared'
import { logger } from '@hellomyphotos/shared'

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

const LOCKOUT_INITIAL_MS = 30 * 1000 // 30s
const MAX_ATTEMPTS = 5

export function checkLoginLockout(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const attempts = loginAttempts.get(ip)

  if (attempts && attempts.count >= MAX_ATTEMPTS) {
    if (now < attempts.resetTime) {
      const waitSec = Math.ceil((attempts.resetTime - now) / 1000)
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${waitSec}s.` })
    }
  }
  next()
}

export function recordFailedLogin(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const attempts = loginAttempts.get(ip) || { count: 0, resetTime: 0 }

  attempts.count += 1

  if (attempts.count >= MAX_ATTEMPTS) {
    const penaltyMultiplier = Math.pow(2, attempts.count - MAX_ATTEMPTS)
    const penaltyMs = Math.min(LOCKOUT_INITIAL_MS * penaltyMultiplier, 24 * 60 * 60 * 1000) // cap 24h
    attempts.resetTime = now + penaltyMs
    logger.warn(`IP ${ip} locked out of login for ${penaltyMs / 1000}s (Attempt ${attempts.count})`)
  }

  loginAttempts.set(ip, attempts)
}

export function clearFailedLogin(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  loginAttempts.delete(ip)
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

