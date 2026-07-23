import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { randomInt } from 'crypto'
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
    dslr_focus_mode TEXT NOT NULL DEFAULT 'auto'
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

// Seed defaults row
db.exec(`
  INSERT OR IGNORE INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode)
  VALUES (1, 4, 5, 1, 2, 'auto', 'auto', 'auto', 'auto')
`)

try { db.exec(`ALTER TABLE photo_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`) } catch {}

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

const insertEvent = db.prepare(`
  INSERT INTO events (id, name, date, description, otp, status, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode)
  VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateEvent = db.prepare(`
  UPDATE events SET name = ?, date = ?, description = ?, photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ? WHERE id = ?
`)

const updateEventSettings = db.prepare(`
  UPDATE events SET photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ? WHERE id = ?
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
  INSERT INTO photo_sessions (id, event_id) VALUES (?, ?)
`)

const findPhotoSession = db.prepare('SELECT * FROM photo_sessions WHERE id = ?')

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

export function createEvent(name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string }) {
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
  insertEvent.run(id, name, date, description, otp, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode)
  logger.info(`Event created: ${id} (${name}) otp=${otp}`)
  return { id, otp }
}

export function updateEventById(id: string, name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string }) {
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
    id
  )
}

export function updateEventSettingsById(id: string, settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string }) {
  const existing = getEvent(id)!
  updateEventSettings.run(settings.photoCount, settings.countdown, settings.captureInterval, settings.postCapturePreview, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? existing.dslr_focus_mode, id)
}

export function getEvent(id: string) {
  return findEventById.get(id) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; photo_count: number; countdown: number;
    capture_interval: number; post_capture_preview: number;
    dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string;
    dslr_focus_mode: string;
    created_at: string
  } | undefined
}

export function getEventByOtp(otp: string) {
  return findEventByOtp.get(otp) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; photo_count: number; countdown: number;
    capture_interval: number; post_capture_preview: number;
    dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string;
    dslr_focus_mode: string;
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
    dslr_focus_mode: string;
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
  if (existing) return
  insertPhotoSession.run(sessionId, eventId)
}

export function getPhotoSession(sessionId: string) {
  return findPhotoSession.get(sessionId) as {
    id: string; event_id: string; created_at: string
  } | undefined
}

export function listEventPhotoSessions(eventId: string, includeArchived = false) {
  const stmt = includeArchived ? listPhotoSessionsByEvent : listActivePhotoSessionsByEvent
  return stmt.all(eventId) as Array<{
    id: string; event_id: string; created_at: string; archived: number
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
  INSERT INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    photo_count = excluded.photo_count,
    countdown = excluded.countdown,
    capture_interval = excluded.capture_interval,
    post_capture_preview = excluded.post_capture_preview,
    dslr_iso = excluded.dslr_iso,
    dslr_shutterspeed = excluded.dslr_shutterspeed,
    dslr_aperture = excluded.dslr_aperture,
    dslr_focus_mode = excluded.dslr_focus_mode
`)

export function getGlobalSettings() {
  const row = getDefaultsStmt.get() as { photo_count: number; countdown: number; capture_interval: number; post_capture_preview: number; dslr_iso: string; dslr_shutterspeed: string; dslr_aperture: string; dslr_focus_mode: string } | undefined
  return {
    photoCount: row?.photo_count ?? 4,
    countdown: row?.countdown ?? 5,
    captureInterval: row?.capture_interval ?? 1,
    postCapturePreview: row?.post_capture_preview ?? 2,
    dslrIso: row?.dslr_iso ?? 'auto',
    dslrShutterSpeed: row?.dslr_shutterspeed ?? 'auto',
    dslrAperture: row?.dslr_aperture ?? 'auto',
    dslrFocusMode: row?.dslr_focus_mode ?? 'auto',
  }
}

export function updateGlobalSettings(settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string }) {
  upsertDefaultsStmt.run(settings.photoCount, settings.countdown, settings.captureInterval, settings.postCapturePreview, settings.dslrIso, settings.dslrShutterSpeed, settings.dslrAperture, settings.dslrFocusMode ?? 'auto')
  logger.info('Global defaults updated', settings)
}

export function closeDb() {
  db.close()
}
