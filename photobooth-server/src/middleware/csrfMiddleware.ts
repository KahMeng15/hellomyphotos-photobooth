import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { config } from '../config'

const CSRF_COOKIE = 'csrf-token'
const CSRF_HEADER = 'x-csrf-token'

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (config.isProduction) {
    const cookieToken = req.cookies[CSRF_COOKIE]
    const headerToken = req.headers[CSRF_HEADER] as string

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' })
      }
    }
  }
  next()
}

export function setCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex')
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    })
  }
  next()
}
