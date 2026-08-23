import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import { logger } from '../utils/logger'
import { rateLimitLogin } from '../middleware/authMiddleware'
import { findUserByEmail, countUsers, insertUser, getEvent, getEventOperatorByToken } from '../db'

const router = Router()

async function seedAdminIfNeeded() {
  if (countUsers() === 0) {
    const defaultHash = await bcrypt.hash(config.operator.password, 10)
    insertUser(uuidv4(), config.operator.email, defaultHash, 'admin')
    logger.info(`Seeded default admin user: ${config.operator.email}`)
  }
}

router.post('/login', rateLimitLogin, async (req: Request, res: Response) => {
  try {
    await seedAdminIfNeeded()

    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    let userRole = 'operator'
    let eventIdScope = undefined

    if (email.startsWith('evt_')) {
      const event = getEvent(email)
      if (!event || !event.operator_password) {
        return res.status(401).json({ error: 'Invalid event credentials' })
      }
      const isValid = await bcrypt.compare(password, event.operator_password)
      if (!isValid) return res.status(401).json({ error: 'Invalid event credentials' })
      eventIdScope = event.id
    } else {
      const user = findUserByEmail(email)
      if (!user) {
        logger.warn(`Failed login attempt for unknown user: ${email}`)
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      const isValid = await bcrypt.compare(password, user.password_hash)
      if (!isValid) {
        logger.warn(`Failed login attempt for: ${email}`)
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      userRole = user.role
    }

    const sessionId = uuidv4()
    
    const tokenPayload = eventIdScope
      ? { userId: 'event-operator', email: eventIdScope, role: 'operator', eventIdScope, sessionId }
      : { userId: (findUserByEmail(email) as any).id, email, role: userRole, sessionId }

    const accessToken = jwt.sign(
      tokenPayload,
      config.jwt.secret,
      { expiresIn: '15m' }
    )

    const refreshToken = jwt.sign(
      tokenPayload,
      config.jwt.refreshSecret,
      { expiresIn: '7d' }
    )

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      domain: config.cookie.domain,
      path: config.cookie.path,
      maxAge: 15 * 60 * 1000,
    })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      domain: config.cookie.domain,
      path: config.cookie.path,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    logger.info(`${tokenPayload.role} logged in: ${tokenPayload.email}`)

    res.json({
      success: true,
      accessToken,
      user: { email: tokenPayload.email, role: tokenPayload.role },
    })
  } catch (error: any) {
    logger.error('Login error', { error: error.message })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/operator-login', rateLimitLogin, async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' })

    const operator = getEventOperatorByToken(token)
    if (!operator) return res.status(401).json({ error: 'Invalid or expired operator link' })

    const isValid = await bcrypt.compare(password, operator.password_hash)
    if (!isValid) return res.status(401).json({ error: 'Invalid operator credentials' })

    const sessionId = uuidv4()
    const tokenPayload = { userId: operator.id, email: `Operator: ${operator.name}`, role: 'operator', eventIdScope: operator.event_id, sessionId }

    const accessToken = jwt.sign(tokenPayload, config.jwt.secret, { expiresIn: '15m' })
    const refreshToken = jwt.sign(tokenPayload, config.jwt.refreshSecret, { expiresIn: '7d' })

    res.cookie('accessToken', accessToken, { httpOnly: true, secure: config.cookie.secure, sameSite: config.cookie.sameSite, domain: config.cookie.domain, path: config.cookie.path, maxAge: 15 * 60 * 1000 })
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: config.cookie.secure, sameSite: config.cookie.sameSite, domain: config.cookie.domain, path: config.cookie.path, maxAge: 7 * 24 * 60 * 60 * 1000 })

    logger.info(`Operator logged in: ${operator.name} for event ${operator.event_id}`)

    res.json({ success: true, accessToken, user: { email: tokenPayload.email, role: tokenPayload.role, eventId: operator.event_id } })
  } catch (error: any) {
    logger.error('Operator login error', { error: error.message })
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/refresh', (req: Request, res: Response) => {
  try {
    const token = req.cookies.refreshToken
    if (!token) return res.status(401).json({ error: 'No refresh token' })

    const decoded = jwt.verify(token, config.jwt.refreshSecret) as any

    const newAccessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, role: decoded.role, sessionId: decoded.sessionId },
      config.jwt.secret,
      { expiresIn: '15m' }
    )

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      domain: config.cookie.domain,
      path: config.cookie.path,
      maxAge: 15 * 60 * 1000,
    })

    res.json({ success: true, accessToken: newAccessToken })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

router.post('/logout', (req: Request, res: Response) => {
  const options = { domain: config.cookie.domain, path: config.cookie.path }
  res.clearCookie('accessToken', options)
  res.clearCookie('refreshToken', options)
  logger.info('User logged out')
  res.json({ success: true })
})

router.get('/me', (req: Request, res: Response) => {
  const token = req.cookies.accessToken || req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any
    res.json({ user: { email: decoded.email, role: decoded.role, eventId: decoded.eventIdScope } })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
