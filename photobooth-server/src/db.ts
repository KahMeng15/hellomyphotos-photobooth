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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
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

const insertEvent = db.prepare(`
  INSERT INTO events (id, name, date, description, otp, status)
  VALUES (?, ?, ?, ?, ?, 'active')
`)

const updateEvent = db.prepare(`
  UPDATE events SET name = ?, date = ?, description = ? WHERE id = ?
`)

const findEventById = db.prepare('SELECT * FROM events WHERE id = ?')

const findEventByOtp = db.prepare('SELECT * FROM events WHERE otp = ? AND status = \'active\'')

const listActiveEvents = db.prepare("SELECT * FROM events WHERE status = 'active' ORDER BY created_at DESC")

const listAllEvents = db.prepare('SELECT * FROM events ORDER BY created_at DESC')

const endEventStmt = db.prepare("UPDATE events SET status = 'ended' WHERE id = ?")

const deleteEventStmt = db.prepare('DELETE FROM events WHERE id = ?')

const insertPhotoSession = db.prepare(`
  INSERT INTO photo_sessions (id, event_id) VALUES (?, ?)
`)

const findPhotoSession = db.prepare('SELECT * FROM photo_sessions WHERE id = ?')

const listPhotoSessionsByEvent = db.prepare(
  'SELECT * FROM photo_sessions WHERE event_id = ? ORDER BY created_at DESC'
)

function generateOtp(): string {
  const digits = randomInt(0, 1000000).toString().padStart(6, '0')
  const exists = db.prepare('SELECT 1 FROM events WHERE otp = ?').get(digits)
  if (exists) return generateOtp()
  return digits
}

export function createEvent(name: string, date: string, description: string) {
  const id = `evt_${Date.now()}_${randomInt(1000, 9999)}`
  const otp = generateOtp()
  insertEvent.run(id, name, date, description, otp)
  logger.info(`Event created: ${id} (${name}) otp=${otp}`)
  return { id, otp }
}

export function updateEventById(id: string, name: string, date: string, description: string) {
  updateEvent.run(name, date, description, id)
}

export function getEvent(id: string) {
  return findEventById.get(id) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; created_at: string
  } | undefined
}

export function getEventByOtp(otp: string) {
  return findEventByOtp.get(otp) as {
    id: string; name: string; date: string; description: string;
    otp: string; status: string; created_at: string
  } | undefined
}

export function listEvents(includeEnded = false) {
  const stmt = includeEnded ? listAllEvents : listActiveEvents
  return stmt.all() as Array<{
    id: string; name: string; date: string; description: string;
    otp: string; status: string; created_at: string
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

export function listEventPhotoSessions(eventId: string) {
  return listPhotoSessionsByEvent.all(eventId) as Array<{
    id: string; event_id: string; created_at: string
  }>
}

export function closeDb() {
  db.close()
}
