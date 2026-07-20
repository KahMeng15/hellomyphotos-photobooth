import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
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

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    photo_count INTEGER NOT NULL DEFAULT 0,
    frame_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS share_tokens (
    token TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_share_tokens_session
    ON share_tokens(session_id)
`)

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, photo_count, frame_name)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    photo_count = excluded.photo_count,
    frame_name = excluded.frame_name,
    updated_at = datetime('now')
`)

const getSession = db.prepare('SELECT * FROM sessions WHERE id = ?')

const createToken = db.prepare(`
  INSERT INTO share_tokens (token, session_id)
  VALUES (?, ?)
`)

const getToken = db.prepare(`
  SELECT st.*, s.id as session_id, s.photo_count, s.frame_name, s.created_at
  FROM share_tokens st
  JOIN sessions s ON s.id = st.session_id
  WHERE st.token = ?
`)

const getTokenBySession = db.prepare('SELECT * FROM share_tokens WHERE session_id = ?')

export function ensureSession(sessionId: string, photoCount: number, frameName?: string | null) {
  upsertSession.run(sessionId, photoCount, frameName || null)
}

export function findSession(sessionId: string) {
  return getSession.get(sessionId) as { id: string; photo_count: number; frame_name: string | null; created_at: string } | undefined
}

export function createShareToken(sessionId: string): string {
  const existing = getTokenBySession.get(sessionId) as { token: string } | undefined
  if (existing) return existing.token
  const token = uuidv4()
  createToken.run(token, sessionId)
  return token
}

export function getShareToken(token: string) {
  return getToken.get(token) as {
    token: string
    session_id: string
    photo_count: number
    frame_name: string | null
    created_at: string
  } | undefined
}

export function closeDb() {
  db.close()
}
