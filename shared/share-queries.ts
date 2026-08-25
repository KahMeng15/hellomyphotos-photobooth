import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { randomInt, randomBytes } from 'crypto'
import { config } from './config'
import { logger } from './utils/logger'

const dbDir = path.join(config.storage.logs, '..', 'db')
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const dbPath = path.join(dbDir, 'hellomyphoto.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Remove old tables
db.exec(`DROP TABLE IF EXISTS share_tokens`)
db.exec(`DROP TABLE IF EXISTS sessions`)

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    otp TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
    photo_count INTEGER NOT NULL DEFAULT 4,
    countdown INTEGER NOT NULL DEFAULT 5,
    capture_interval INTEGER NOT NULL DEFAULT 1,
    post_capture_preview INTEGER NOT NULL DEFAULT 2,
    dslr_iso TEXT NOT NULL DEFAULT 'auto',
    dslr_shutterspeed TEXT NOT NULL DEFAULT 'auto',
    dslr_aperture TEXT NOT NULL DEFAULT 'auto',
    dslr_focus_mode TEXT NOT NULL DEFAULT 'auto',
    dslr_whitebalance TEXT NOT NULL DEFAULT 'auto',
    dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    share_originals INTEGER NOT NULL DEFAULT 1
  )
`)

try {
  db.exec(`ALTER TABLE events ADD COLUMN share_originals INTEGER NOT NULL DEFAULT 1`)
} catch (e: any) {
  // Column already exists
}

db.exec(`
  CREATE TABLE IF NOT EXISTS global_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    photo_count INTEGER NOT NULL DEFAULT 4,
    countdown INTEGER NOT NULL DEFAULT 5,
    capture_interval INTEGER NOT NULL DEFAULT 1,
    post_capture_preview INTEGER NOT NULL DEFAULT 2,
    dslr_iso TEXT NOT NULL DEFAULT 'auto',
    dslr_shutterspeed TEXT NOT NULL DEFAULT 'auto',
    dslr_aperture TEXT NOT NULL DEFAULT 'auto',
    dslr_focus_mode TEXT NOT NULL DEFAULT 'auto',
    dslr_whitebalance TEXT NOT NULL DEFAULT 'auto',
    dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS camera_settings (
    model TEXT PRIMARY KEY,
    dslr_iso TEXT NOT NULL DEFAULT 'auto',
    dslr_shutterspeed TEXT NOT NULL DEFAULT 'auto',
    dslr_aperture TEXT NOT NULL DEFAULT 'auto',
    dslr_focus_mode TEXT NOT NULL DEFAULT 'auto',
    dslr_whitebalance TEXT NOT NULL DEFAULT 'auto',
    dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    action TEXT NOT NULL,
    ip_address TEXT,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`)

export function logAuditAction(userEmail: string, action: string, ipAddress: string, details?: string) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_log (user_email, action, ip_address, details)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(userEmail, action, ipAddress, details ? JSON.stringify(details) : null)
  } catch (error) {
    logger.error('Failed to write audit log', { error })
  }
}

// Add new columns if missing (for existing DBs)
try { db.exec(`ALTER TABLE events ADD COLUMN photo_count INTEGER NOT NULL DEFAULT 4`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN countdown INTEGER NOT NULL DEFAULT 5`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN capture_interval INTEGER NOT NULL DEFAULT 1`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN post_capture_preview INTEGER NOT NULL DEFAULT 2`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN dslr_iso TEXT NOT NULL DEFAULT 'auto'`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN dslr_shutterspeed TEXT NOT NULL DEFAULT 'auto'`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN dslr_aperture TEXT NOT NULL DEFAULT 'auto'`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN dslr_focus_mode TEXT NOT NULL DEFAULT 'auto'`) } catch {}

try { db.exec(`ALTER TABLE global_settings ADD COLUMN dslr_aperture TEXT NOT NULL DEFAULT 'auto'`) } catch {}
try { db.exec(`ALTER TABLE global_settings ADD COLUMN dslr_focus_mode TEXT NOT NULL DEFAULT 'auto'`) } catch {}

try { db.exec(`ALTER TABLE events ADD COLUMN dslr_whitebalance TEXT NOT NULL DEFAULT 'auto'`) } catch {}
try { db.exec(`ALTER TABLE global_settings ADD COLUMN dslr_whitebalance TEXT NOT NULL DEFAULT 'auto'`) } catch {}
try { db.exec(`ALTER TABLE camera_settings ADD COLUMN dslr_whitebalance TEXT NOT NULL DEFAULT 'auto'`) } catch {}

try { db.exec(`ALTER TABLE events ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}

try { db.exec(`ALTER TABLE events ADD COLUMN obfuscate_links INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN expiry_type TEXT NOT NULL DEFAULT 'none'`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN expiry_value TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN organizer TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN contact_info TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE events ADD COLUMN operator_password TEXT`) } catch {}


try { db.exec(`ALTER TABLE global_settings ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}
try { db.exec(`ALTER TABLE global_settings ADD COLUMN organizer TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE global_settings ADD COLUMN contact_info TEXT NOT NULL DEFAULT ''`) } catch {}

// Phase 2: Rate Limits & Bandwidth
try { db.exec(`ALTER TABLE global_settings ADD COLUMN api_rate_limit_admin INTEGER NOT NULL DEFAULT 500`) } catch {}
try { db.exec(`ALTER TABLE global_settings ADD COLUMN api_rate_limit_share INTEGER NOT NULL DEFAULT 300`) } catch {}
try { db.exec(`ALTER TABLE global_settings ADD COLUMN bw_limit_admin INTEGER NOT NULL DEFAULT 1000`) } catch {} // in MB/15m
try { db.exec(`ALTER TABLE global_settings ADD COLUMN bw_limit_share INTEGER NOT NULL DEFAULT 100`) } catch {} // in MB/15m
try { db.exec(`ALTER TABLE global_settings ADD COLUMN lockout_duration INTEGER NOT NULL DEFAULT 5`) } catch {} // in minutes

try { db.exec(`ALTER TABLE camera_settings ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}

// Seed defaults row
db.exec(`
  INSERT OR IGNORE INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin)
  VALUES (1, 4, 5, 1, 2, 'auto', 'auto', 'auto', 'auto', 'auto', 5200) /* organizer/contact_info added below */
`)



db.exec(`
  CREATE TABLE IF NOT EXISTS photo_sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_photo_sessions_event
    ON photo_sessions(event_id)
`)

try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN share_id TEXT`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN upload_status TEXT NOT NULL DEFAULT 'reserved'`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN upload_started_at INTEGER`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN upload_completed_at INTEGER`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN upload_size_bytes INTEGER`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN upload_avg_speed_kbps REAL`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN width INTEGER NOT NULL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN height INTEGER NOT NULL DEFAULT 0`) } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS event_shares (
    token TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_sessions_share_id
    ON photo_sessions(share_id)
    WHERE share_id IS NOT NULL
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS session_shares (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES photo_sessions(id) ON DELETE CASCADE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

try {
  const existingWithShareId = db.prepare('SELECT id, share_id, created_at FROM photo_sessions WHERE share_id IS NOT NULL').all() as any[]
  const checkShare = db.prepare('SELECT 1 FROM session_shares WHERE id = ?')
  const insertShare = db.prepare('INSERT INTO session_shares (id, session_id, is_active, created_at) VALUES (?, ?, 1, ?)')
  db.transaction(() => {
    for (const session of existingWithShareId) {
      if (!checkShare.get(session.share_id)) {
        insertShare.run(session.share_id, session.id, session.created_at)
      }
    }
  })()
} catch (e) {
  logger.error('Migration failed for session_shares', e)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','operator')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS share_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id TEXT NOT NULL,
    ip_address TEXT,
    device_type TEXT,
    os TEXT,
    browser TEXT,
    action TEXT NOT NULL,
    target_file TEXT,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS event_operators (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    access_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
  )
`)

const insertEvent = db.prepare(`
  INSERT INTO events (id, name, date, description, otp, status, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, obfuscate_links, expiry_type, expiry_value, organizer, contact_info)
  VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateEvent = db.prepare(`
  UPDATE events SET name = ?, date = ?, description = ?, photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ?, obfuscate_links = ?, expiry_type = ?, expiry_value = ?, organizer = ?, contact_info = ? WHERE id = ?
`)

const updateEventSettings = db.prepare(`
  UPDATE events SET photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ?, obfuscate_links = ?, expiry_type = ?, expiry_value = ?, organizer = ?, contact_info = ? WHERE id = ?
`)

const findEventById = db.prepare('SELECT * FROM events WHERE id = ?')

const findEventByOtp = db.prepare('SELECT * FROM events WHERE otp = ? AND status = \'active\'')

const listActiveEvents = db.prepare("SELECT * FROM events WHERE status = 'active' ORDER BY created_at DESC")

const listAllEvents = db.prepare('SELECT * FROM events ORDER BY created_at DESC')

const endEventStmt = db.prepare("UPDATE events SET status = 'ended' WHERE id = ?")

const deleteEventStmt = db.prepare('DELETE FROM events WHERE id = ?')

const archiveSessionStmt = db.prepare("UPDATE photo_sessions SET archived = 1 WHERE id = ?")
const restoreSessionStmt = db.prepare("UPDATE photo_sessions SET archived = 0 WHERE id = ?")

const insertOperatorStmt = db.prepare('INSERT INTO event_operators (id, event_id, name, password_hash, access_token) VALUES (?, ?, ?, ?, ?)')
const listOperatorsStmt = db.prepare('SELECT id, event_id, name, access_token, created_at FROM event_operators WHERE event_id = ? ORDER BY created_at ASC')
const getOperatorByTokenStmt = db.prepare('SELECT * FROM event_operators WHERE access_token = ?')
const deleteOperatorStmt = db.prepare('DELETE FROM event_operators WHERE id = ? AND event_id = ?')

export function addEventOperator(eventId: string, name: string, passwordHash: string, accessToken: string) {
  const id = `op_${Date.now()}_${randomInt(1000, 9999)}`
  insertOperatorStmt.run(id, eventId, name, passwordHash, accessToken)
  return id
}

export function listEventOperators(eventId: string) {
  return listOperatorsStmt.all(eventId) as { id: string; event_id: string; name: string; access_token: string; created_at: string }[]
}

export function getEventOperatorByToken(token: string) {
  return getOperatorByTokenStmt.get(token) as { id: string; event_id: string; name: string; password_hash: string; access_token: string; created_at: string } | undefined
}

export function deleteEventOperator(id: string, eventId: string) {
  deleteOperatorStmt.run(id, eventId)
}

const insertPhotoSession = db.prepare(`
  INSERT INTO photo_sessions (id, event_id, share_id) VALUES (?, ?, ?)
`)

const findPhotoSession = db.prepare('SELECT * FROM photo_sessions WHERE id = ?')
const findPhotoSessionByShareId = db.prepare('SELECT * FROM photo_sessions WHERE share_id = ?')

const listPhotoSessionsByEvent = db.prepare(
  'SELECT * FROM photo_sessions WHERE event_id = ? ORDER BY created_at DESC'
)
const listActivePhotoSessionsByEvent = db.prepare(
  "SELECT * FROM photo_sessions WHERE event_id = ? AND archived = 0 ORDER BY created_at DESC"
)

function generateOtp(): string {
  const digits = randomInt(0, 1000000).toString().padStart(6, '0')
  const exists = db.prepare('SELECT 1 FROM events WHERE otp = ?').get(digits)
  if (exists) return generateOtp()
  return digits
}

export function createEvent(name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string; organizer?: string; contactInfo?: string }) {
  const id = `evt_${Date.now()}_${randomInt(1000, 9999)}`
  const otp = generateOtp()
  const defaults = getGlobalSettings()
  const photoCount = settings?.photoCount ?? defaults.photoCount
  const countdown = settings?.countdown ?? defaults.countdown
  const captureInterval = settings?.captureInterval ?? defaults.captureInterval
  const postCapturePreview = settings?.postCapturePreview ?? defaults.postCapturePreview
  const dslrIso = settings?.dslrIso ?? defaults.dslrIso
  const dslrShutterSpeed = settings?.dslrShutterSpeed ?? defaults.dslrShutterSpeed
  const dslrAperture = settings?.dslrAperture ?? defaults.dslrAperture
  const dslrFocusMode = settings?.dslrFocusMode ?? defaults.dslrFocusMode
  const dslrWhiteBalance = settings?.dslrWhiteBalance ?? defaults.dslrWhiteBalance
  const dslrWhiteBalanceKelvin = settings?.dslrWhiteBalanceKelvin ?? defaults.dslrWhiteBalanceKelvin
  const obfuscateLinks = settings?.obfuscateLinks ?? 0
  const expiryType = settings?.expiryType ?? 'none'
  const expiryValue = settings?.expiryValue ?? ''
  insertEvent.run(id, name, date, description, otp, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, obfuscateLinks, expiryType, expiryValue, settings?.organizer ?? '', settings?.contactInfo ?? '')
  logger.info(`Event created: ${id} (${name}) otp=${otp}`)
  return { id, otp }
}

export function updateEventById(id: string, name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string; organizer?: string; contactInfo?: string }) {
  const existing = getEvent(id)!
  updateEvent.run(
    name, date, description,
    settings?.photoCount ?? existing.photo_count,
    settings?.countdown ?? existing.countdown,
    settings?.captureInterval ?? existing.capture_interval,
    settings?.postCapturePreview ?? existing.post_capture_preview,
    settings?.dslrIso ?? existing.dslr_iso,
    settings?.dslrShutterSpeed ?? existing.dslr_shutterspeed,
    settings?.dslrAperture ?? existing.dslr_aperture,
    settings?.dslrFocusMode ?? existing.dslr_focus_mode,
    settings?.dslrWhiteBalance ?? existing.dslr_whitebalance,
    settings?.dslrWhiteBalanceKelvin ?? existing.dslr_whitebalance_kelvin,
    settings?.obfuscateLinks ?? existing.obfuscate_links,
    settings?.expiryType ?? existing.expiry_type,
    settings?.expiryValue ?? existing.expiry_value,
    settings?.organizer ?? existing.organizer,
    settings?.contactInfo ?? existing.contact_info,
    id
  )
}

export function updateEventSettingsById(id: string, settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string; organizer?: string; contactInfo?: string }) {
  const existing = getEvent(id)!
  updateEventSettings.run(settings.photoCount, settings.countdown, settings.captureInterval, settings.postCapturePreview, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? existing.dslr_focus_mode, settings.dslrWhiteBalance ?? existing.dslr_whitebalance ?? 'auto', settings.dslrWhiteBalanceKelvin ?? existing.dslr_whitebalance_kelvin ?? 5200, settings.obfuscateLinks ?? existing.obfuscate_links ?? 0, settings.expiryType ?? existing.expiry_type ?? 'none', settings.expiryValue ?? existing.expiry_value ?? '', settings.organizer ?? existing.organizer ?? '', settings.contactInfo ?? existing.contact_info ?? '', id)
}

export function getEvent(id: string) {
  return findEventById.get(id) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; photo_count: number; countdown: number;
    capture_interval: number; post_capture_preview: number;
    dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string;
    dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number;
    obfuscate_links: number; expiry_type: string; expiry_value: string; organizer: string; contact_info: string;
    operator_password?: string; created_at: string
  } | undefined
}

export function getEventByOtp(otp: string) {
  return findEventByOtp.get(otp) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; photo_count: number; countdown: number;
    capture_interval: number; post_capture_preview: number;
    dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string;
    dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number;
    obfuscate_links: number; expiry_type: string; expiry_value: string; organizer: string; contact_info: string;
    created_at: string; share_originals: number
  } | undefined
}

export function listEvents(includeEnded = false) {
  const stmt = includeEnded ? listAllEvents : listActiveEvents
  return stmt.all() as Array<{
    id: string; name: string; date: string; description: string;
    otp: string; status: string; photo_count: number; countdown: number;
    capture_interval: number; post_capture_preview: number;
    dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string;
    dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number;
    obfuscate_links: number; expiry_type: string; expiry_value: string; organizer: string; contact_info: string;
    created_at: string; share_originals: number
  }>
}

export function endEvent(id: string) {
  endEventStmt.run(id)
  logger.info(`Event ended: ${id}`)
}

export function deleteEvent(id: string) {
  deleteEventStmt.run(id)
  logger.info(`Event deleted: ${id}`)
}

export function ensurePhotoSession(sessionId: string, eventId: string): string {
  const existing = findPhotoSession.get(sessionId)
  if (existing) {
    const hasShares = db.prepare('SELECT 1 FROM session_shares WHERE session_id = ?').get(sessionId)
    let shareId = (existing as any).share_id
    if (!shareId) {
      shareId = require('uuid').v4()
      db.prepare('UPDATE photo_sessions SET share_id = ? WHERE id = ?').run(shareId, sessionId)
    }
    if (!hasShares) {
      db.prepare("INSERT OR IGNORE INTO session_shares (id, session_id, is_active, created_at) VALUES (?, ?, 1, datetime('now'))").run(shareId, sessionId)
    }
    return shareId
  }
  const shareId = require('uuid').v4()
  insertPhotoSession.run(sessionId, eventId, shareId)
  db.prepare("INSERT INTO session_shares (id, session_id, is_active, created_at) VALUES (?, ?, 1, datetime('now'))").run(shareId, sessionId)
  return shareId
}

export function reservePhotoSession(sessionId: string, eventId: string): string {
  const existing = findPhotoSession.get(sessionId) as any
  if (existing) return existing.share_id as string
  const shareId = require('uuid').v4()
  insertPhotoSession.run(sessionId, eventId, shareId)
  db.prepare("INSERT INTO session_shares (id, session_id, is_active, created_at) VALUES (?, ?, 1, datetime('now'))").run(shareId, sessionId)
  return shareId
}

export function updateUploadStatus(
  sessionId: string,
  status: 'reserved' | 'uploading' | 'complete' | 'failed',
  extra?: {
    upload_started_at?: number
    upload_completed_at?: number
    upload_size_bytes?: number
    upload_avg_speed_kbps?: number
  }
) {
  const fields: string[] = ['upload_status = ?']
  const values: any[] = [status]
  if (extra?.upload_started_at !== undefined) { fields.push('upload_started_at = ?'); values.push(extra.upload_started_at) }
  if (extra?.upload_completed_at !== undefined) { fields.push('upload_completed_at = ?'); values.push(extra.upload_completed_at) }
  if (extra?.upload_size_bytes !== undefined) { fields.push('upload_size_bytes = ?'); values.push(extra.upload_size_bytes) }
  if (extra?.upload_avg_speed_kbps !== undefined) { fields.push('upload_avg_speed_kbps = ?'); values.push(extra.upload_avg_speed_kbps) }
  values.push(sessionId)
  db.prepare(`UPDATE photo_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

const setSessionDimensionsStmt = db.prepare(`UPDATE photo_sessions SET width = ?, height = ? WHERE id = ?`)
export function setSessionDimensions(sessionId: string, width: number, height: number) {
  setSessionDimensionsStmt.run(width, height, sessionId)
}

const getSessionDimensionsStmt = db.prepare('SELECT width, height FROM photo_sessions WHERE id = ?')
export function getSessionDimensions(sessionId: string): { width: number; height: number } {
  const row = getSessionDimensionsStmt.get(sessionId) as any
  return { width: row?.width || 0, height: row?.height || 0 }
}

export function getSessionUploadStatus(token: string): { id: string; upload_status: string; upload_started_at: number | null; upload_completed_at: number | null; upload_size_bytes: number | null; upload_avg_speed_kbps: number | null; share_id: string } | null {
  // Try by shareId via session_shares first
  let row = db.prepare(`
    SELECT ps.id, ps.upload_status, ps.upload_started_at, ps.upload_completed_at,
           ps.upload_size_bytes, ps.upload_avg_speed_kbps, ss.id as share_id
    FROM photo_sessions ps
    JOIN session_shares ss ON ss.session_id = ps.id
    WHERE ss.id = ? AND ss.is_active = 1
  `).get(token) as any
  if (!row) {
    row = db.prepare(`
      SELECT ps.id, ps.upload_status, ps.upload_started_at, ps.upload_completed_at,
             ps.upload_size_bytes, ps.upload_avg_speed_kbps, ss.id as share_id
      FROM photo_sessions ps
      LEFT JOIN session_shares ss ON ss.session_id = ps.id AND ss.is_active = 1
      WHERE ps.id = ?
    `).get(token) as any
  }
  return row || null
}

export function getPhotoSession(sessionId: string) {
  return findPhotoSession.get(sessionId) as {
    id: string; event_id: string; created_at: string
  } | undefined
}

export function listEventPhotoSessions(eventId: string, includeArchived = false) {
  const stmt = includeArchived ? listPhotoSessionsByEvent : listActivePhotoSessionsByEvent
  return stmt.all(eventId) as Array<{
    id: string; event_id: string; created_at: string; archived: number; share_id: string; width: number; height: number
  }>
}

export function archiveSession(sessionId: string) {
  archiveSessionStmt.run(sessionId)
}

export function restoreSession(sessionId: string) {
  restoreSessionStmt.run(sessionId)
}

const getDefaultsStmt = db.prepare('SELECT * FROM global_settings WHERE id = 1')
const upsertDefaultsStmt = db.prepare(`
  INSERT INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, organizer, contact_info, api_rate_limit_admin, api_rate_limit_share, bw_limit_admin, bw_limit_share, lockout_duration)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    photo_count = excluded.photo_count,
    countdown = excluded.countdown,
    capture_interval = excluded.capture_interval,
    post_capture_preview = excluded.post_capture_preview,
    dslr_iso = excluded.dslr_iso,
    dslr_shutterspeed = excluded.dslr_shutterspeed,
    dslr_aperture = excluded.dslr_aperture,
    dslr_focus_mode = excluded.dslr_focus_mode,
    dslr_whitebalance = excluded.dslr_whitebalance,
    dslr_whitebalance_kelvin = excluded.dslr_whitebalance_kelvin,
    organizer = excluded.organizer,
    contact_info = excluded.contact_info,
    api_rate_limit_admin = excluded.api_rate_limit_admin,
    api_rate_limit_share = excluded.api_rate_limit_share,
    bw_limit_admin = excluded.bw_limit_admin,
    bw_limit_share = excluded.bw_limit_share,
    lockout_duration = excluded.lockout_duration
`)

export function getGlobalSettings() {
  const row = getDefaultsStmt.get() as any
  return {
    photoCount: row?.photo_count ?? 4,
    countdown: row?.countdown ?? 5,
    captureInterval: row?.capture_interval ?? 1,
    postCapturePreview: row?.post_capture_preview ?? 2,
    dslrIso: row?.dslr_iso ?? 'auto',
    dslrShutterSpeed: row?.dslr_shutterspeed ?? 'auto',
    dslrAperture: row?.dslr_aperture ?? 'auto',
    dslrFocusMode: row?.dslr_focus_mode ?? 'auto',
    dslrWhiteBalance: row?.dslr_whitebalance ?? 'auto',
    dslrWhiteBalanceKelvin: row?.dslr_whitebalance_kelvin ?? 5200,
    organizer: row?.organizer ?? '',
    contactInfo: row?.contact_info ?? '',
    apiRateLimitAdmin: row?.api_rate_limit_admin ?? 500,
    apiRateLimitShare: row?.api_rate_limit_share ?? 300,
    bwLimitAdmin: row?.bw_limit_admin ?? 1000,
    bwLimitShare: row?.bw_limit_share ?? 100,
    lockoutDuration: row?.lockout_duration ?? 5,
  }
}

export function updateGlobalSettings(settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; organizer?: string; contactInfo?: string; apiRateLimitAdmin?: number; apiRateLimitShare?: number; bwLimitAdmin?: number; bwLimitShare?: number; lockoutDuration?: number }) {
  upsertDefaultsStmt.run(settings.photoCount, settings.countdown, settings.captureInterval, settings.postCapturePreview, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? 'auto', settings.dslrWhiteBalance ?? 'auto', settings.dslrWhiteBalanceKelvin ?? 5200, settings.organizer ?? '', settings.contactInfo ?? '', settings.apiRateLimitAdmin ?? 500, settings.apiRateLimitShare ?? 300, settings.bwLimitAdmin ?? 1000, settings.bwLimitShare ?? 100, settings.lockoutDuration ?? 5)
  logger.info('Global defaults updated', settings)
}

const getCameraSettingsStmt = db.prepare('SELECT * FROM camera_settings WHERE model = ?')
const upsertCameraSettingsStmt = db.prepare(`
  INSERT INTO camera_settings (model, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET
    dslr_iso = excluded.dslr_iso,
    dslr_shutterspeed = excluded.dslr_shutterspeed,
    dslr_aperture = excluded.dslr_aperture,
    dslr_focus_mode = excluded.dslr_focus_mode,
    dslr_whitebalance = excluded.dslr_whitebalance,
    dslr_whitebalance_kelvin = excluded.dslr_whitebalance_kelvin,
    updated_at = excluded.updated_at
`)

export function getCameraSettings(model: string) {
  const row = getCameraSettingsStmt.get(model) as { dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string; dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number; organizer: string; contact_info: string } | undefined
  if (!row) return null
  return {
    dslrIso: row.dslr_iso,
    dslrShutterSpeed: row.dslr_shutterspeed,
    dslrAperture: row.dslr_aperture,
    dslrFocusMode: row.dslr_focus_mode,
    dslrWhiteBalance: row.dslr_whitebalance,
    dslrWhiteBalanceKelvin: row.dslr_whitebalance_kelvin,
  }
}

export function updateCameraSettings(model: string, settings: { dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; organizer?: string; contactInfo?: string }) {
  upsertCameraSettingsStmt.run(model, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? 'auto', settings.dslrWhiteBalance ?? 'auto', settings.dslrWhiteBalanceKelvin ?? 5200)
  logger.info(`Camera settings updated for model ${model}`, settings)
}

export function closeDb() {
  db.close()
}

export function regenerateSessionShareId(sessionId: string) {
  // Legacy function: We now use createSessionShare
  const newShareId = randomBytes(4).toString('hex')
  db.prepare('UPDATE photo_sessions SET share_id = ? WHERE id = ?').run(newShareId, sessionId)
  db.prepare('INSERT INTO session_shares (id, session_id, is_active, created_at) VALUES (?, ?, 1, datetime("now"))').run(newShareId, sessionId)
  return newShareId
}

export function createSessionShare(sessionId: string) {
  const shareId = randomBytes(4).toString('hex')
  db.prepare('INSERT INTO session_shares (id, session_id, is_active, created_at) VALUES (?, ?, 1, datetime("now"))').run(shareId, sessionId)
  return shareId
}

export function getSessionShares(sessionId: string) {
  return db.prepare('SELECT * FROM session_shares WHERE session_id = ? ORDER BY created_at DESC').all(sessionId) as Array<{
    id: string; session_id: string; is_active: number; created_at: string
  }>
}

export function setSessionShareStatus(shareId: string, isActive: boolean) {
  db.prepare('UPDATE session_shares SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, shareId)
}

export function deleteSessionShare(shareId: string) {
  db.prepare('DELETE FROM session_shares WHERE id = ?').run(shareId)
}

export function getPhotoSessionByShareId(shareId: string) {
  const share = db.prepare('SELECT * FROM session_shares WHERE id = ? AND is_active = 1').get(shareId) as { session_id: string } | undefined
  if (!share) return undefined
  return findPhotoSession.get(share.session_id) as {
    id: string; event_id: string; created_at: string; share_id: string; archived: number;
  } | undefined
}

const insertShareAnalytics = db.prepare(`
  INSERT INTO share_analytics (share_id, ip_address, device_type, os, browser, action, target_file, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

export function logShareAnalytics(
  shareId: string, 
  ipAddress: string | null, 
  deviceType: string | null, 
  os: string | null, 
  browser: string | null, 
  action: string, 
  targetFile: string | null = null,
  source: string | null = null
) {
  insertShareAnalytics.run(shareId, ipAddress, deviceType, os, browser, action, targetFile, source)
}

const getEventShareIds = db.prepare(`
  SELECT share_id FROM photo_sessions WHERE event_id = ? AND share_id IS NOT NULL
`)

export function getEventAnalytics(eventId: string) {
  const shareIds = (getEventShareIds.all(eventId) as { share_id: string }[]).map(r => r.share_id)
  if (shareIds.length === 0) return { totalVisits: 0, uniqueVisitors: 0, logs: [] }

  const placeholders = shareIds.map(() => '?').join(',')
  
  const totalVisits = (db.prepare(`
    SELECT COUNT(*) as count FROM share_analytics WHERE share_id IN (${placeholders}) AND action = 'view'
  `).get(...shareIds) as { count: number }).count

  const uniqueVisitors = (db.prepare(`
    SELECT COUNT(DISTINCT ip_address) as count FROM share_analytics WHERE share_id IN (${placeholders}) AND ip_address IS NOT NULL
  `).get(...shareIds) as { count: number }).count

  const logs = db.prepare(`
    SELECT * FROM share_analytics WHERE share_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 100
  `).all(...shareIds)

  return { totalVisits, uniqueVisitors, logs }
}

const findUserByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?')
const insertUserStmt = db.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
const getAllUsersStmt = db.prepare('SELECT id, email, role, created_at FROM users')
const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?')
const updateUserRoleStmt = db.prepare('UPDATE users SET role = ? WHERE id = ?')

export function findUserByEmail(email: string) {
  return findUserByEmailStmt.get(email) as any
}

export function insertUser(id: string, email: string, passwordHash: string, role: string) {
  insertUserStmt.run(id, email, passwordHash, role)
}

export function getAllUsers() {
  return getAllUsersStmt.all()
}

export function deleteUser(id: string) {
  deleteUserStmt.run(id)
}

export function countUsers() {
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count
}

export function updateUserRole(id: string, role: string) {
  updateUserRoleStmt.run(role, id)
}

export function setEventShareOriginals(id: string, value: number) {
  try {
    db.prepare(`UPDATE events SET share_originals = ? WHERE id = ?`).run(value, id)
  } catch (e: any) {
    logger.error('Failed to update share_originals: ' + e.message)
  }
}

export function getOrCreateEventShareToken(eventId: string): string {
  const existing = db.prepare('SELECT token FROM event_shares WHERE event_id = ?').get(eventId) as any
  if (existing) return existing.token

  const token = require('uuid').v4()
  db.prepare('INSERT INTO event_shares (token, event_id) VALUES (?, ?)').run(token, eventId)
  return token
}

export function getEventIdByShareToken(token: string): string | null {
  const row = db.prepare('SELECT event_id FROM event_shares WHERE token = ?').get(token) as any
  return row ? row.event_id : null
}
