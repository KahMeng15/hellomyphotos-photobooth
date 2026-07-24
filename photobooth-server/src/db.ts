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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

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


try { db.exec(`ALTER TABLE global_settings ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}
try { db.exec(`ALTER TABLE camera_settings ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}

// Seed defaults row
db.exec(`
  INSERT OR IGNORE INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin)
  VALUES (1, 4, 5, 1, 2, 'auto', 'auto', 'auto', 'auto', 'auto', 5200)
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

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_sessions_share_id
    ON photo_sessions(share_id)
    WHERE share_id IS NOT NULL
`)

const insertEvent = db.prepare(`
  INSERT INTO events (id, name, date, description, otp, status, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, obfuscate_links, expiry_type, expiry_value)
  VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateEvent = db.prepare(`
  UPDATE events SET name = ?, date = ?, description = ?, photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ?, obfuscate_links = ?, expiry_type = ?, expiry_value = ? WHERE id = ?
`)

const updateEventSettings = db.prepare(`
  UPDATE events SET photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ?, obfuscate_links = ?, expiry_type = ?, expiry_value = ? WHERE id = ?
`)

const findEventById = db.prepare('SELECT * FROM events WHERE id = ?')

const findEventByOtp = db.prepare('SELECT * FROM events WHERE otp = ? AND status = \'active\'')

const listActiveEvents = db.prepare("SELECT * FROM events WHERE status = 'active' ORDER BY created_at DESC")

const listAllEvents = db.prepare('SELECT * FROM events ORDER BY created_at DESC')

const endEventStmt = db.prepare("UPDATE events SET status = 'ended' WHERE id = ?")

const deleteEventStmt = db.prepare('DELETE FROM events WHERE id = ?')

const archiveSessionStmt = db.prepare("UPDATE photo_sessions SET archived = 1 WHERE id = ?")
const restoreSessionStmt = db.prepare("UPDATE photo_sessions SET archived = 0 WHERE id = ?")

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

export function createEvent(name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string }) {
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
  insertEvent.run(id, name, date, description, otp, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, obfuscateLinks, expiryType, expiryValue)
  logger.info(`Event created: ${id} (${name}) otp=${otp}`)
  return { id, otp }
}

export function updateEventById(id: string, name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string }) {
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
    id
  )
}

export function updateEventSettingsById(id: string, settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string }) {
  const existing = getEvent(id)!
  updateEventSettings.run(settings.photoCount, settings.countdown, settings.captureInterval, settings.postCapturePreview, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? existing.dslr_focus_mode, settings.dslrWhiteBalance ?? existing.dslr_whitebalance ?? 'auto', settings.dslrWhiteBalanceKelvin ?? existing.dslr_whitebalance_kelvin ?? 5200, settings.obfuscateLinks ?? existing.obfuscate_links ?? 0, settings.expiryType ?? existing.expiry_type ?? 'none', settings.expiryValue ?? existing.expiry_value ?? '', id)
}

export function getEvent(id: string) {
  return findEventById.get(id) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; photo_count: number; countdown: number;
    capture_interval: number; post_capture_preview: number;
    dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string;
    dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number;
    obfuscate_links: number; expiry_type: string; expiry_value: string;
    created_at: string
  } | undefined
}

export function getEventByOtp(otp: string) {
  return findEventByOtp.get(otp) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; photo_count: number; countdown: number;
    capture_interval: number; post_capture_preview: number;
    dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string;
    dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number;
    obfuscate_links: number; expiry_type: string; expiry_value: string;
    created_at: string
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
    obfuscate_links: number; expiry_type: string; expiry_value: string;
    created_at: string
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

export function ensurePhotoSession(sessionId: string, eventId: string) {
  const existing = findPhotoSession.get(sessionId)
  if (existing) {
    // Backfill share_id if missing
    if (!(existing as any).share_id) {
      const shareId = randomBytes(4).toString('hex')
      db.prepare('UPDATE photo_sessions SET share_id = ? WHERE id = ?').run(shareId, sessionId)
    }
    return
  }
  const shareId = randomBytes(4).toString('hex')
  insertPhotoSession.run(sessionId, eventId, shareId)
}

export function getPhotoSession(sessionId: string) {
  return findPhotoSession.get(sessionId) as {
    id: string; event_id: string; created_at: string
  } | undefined
}

export function listEventPhotoSessions(eventId: string, includeArchived = false) {
  const stmt = includeArchived ? listPhotoSessionsByEvent : listActivePhotoSessionsByEvent
  return stmt.all(eventId) as Array<{
    id: string; event_id: string; created_at: string; archived: number; share_id: string
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
  INSERT INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    dslr_whitebalance_kelvin = excluded.dslr_whitebalance_kelvin
`)

export function getGlobalSettings() {
  const row = getDefaultsStmt.get() as { photo_count: number; countdown: number; capture_interval: number; post_capture_preview: number; dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string; dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number } | undefined
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
  }
}

export function updateGlobalSettings(settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number }) {
  upsertDefaultsStmt.run(settings.photoCount, settings.countdown, settings.captureInterval, settings.postCapturePreview, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? 'auto', settings.dslrWhiteBalance ?? 'auto', settings.dslrWhiteBalanceKelvin ?? 5200)
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
  const row = getCameraSettingsStmt.get(model) as { dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string; dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number } | undefined
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

export function updateCameraSettings(model: string, settings: { dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number }) {
  upsertCameraSettingsStmt.run(model, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? 'auto', settings.dslrWhiteBalance ?? 'auto', settings.dslrWhiteBalanceKelvin ?? 5200)
  logger.info(`Camera settings updated for model ${model}`, settings)
}

export function closeDb() {
  db.close()
}

export function getPhotoSessionByShareId(shareId: string) {
  return findPhotoSessionByShareId.get(shareId) as {
    id: string; event_id: string; created_at: string; share_id: string; archived: number;
  } | undefined
}
