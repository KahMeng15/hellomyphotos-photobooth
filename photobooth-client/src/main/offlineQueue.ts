import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

export interface QueuedSession {
  id: number
  sessionId: string
  shareId: string | null
  metadata: string
  imagePaths: string
  createdAt: string
  retryCount: number
  nextRetryAt: number | null
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  sizeBytes: number | null
  startedAt: number | null
  completedAt: number | null
  avgSpeedKbps: number | null
}

export class OfflineQueue {
  private db: Database.Database

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'queue.db')
    this.db = new Database(dbPath)
    this.init()
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        share_id TEXT,
        metadata TEXT,
        image_paths TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        next_retry_at INTEGER,
        status TEXT DEFAULT 'pending',
        size_bytes INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        avg_speed_kbps REAL
      )
    `)
    // Migrations for existing databases
    const cols = (this.db.prepare('PRAGMA table_info(pending_uploads)').all() as { name: string }[]).map(c => c.name)
    if (!cols.includes('share_id')) this.db.exec(`ALTER TABLE pending_uploads ADD COLUMN share_id TEXT`)
    if (!cols.includes('next_retry_at')) this.db.exec(`ALTER TABLE pending_uploads ADD COLUMN next_retry_at INTEGER`)
    if (!cols.includes('size_bytes')) this.db.exec(`ALTER TABLE pending_uploads ADD COLUMN size_bytes INTEGER`)
    if (!cols.includes('started_at')) this.db.exec(`ALTER TABLE pending_uploads ADD COLUMN started_at INTEGER`)
    if (!cols.includes('completed_at')) this.db.exec(`ALTER TABLE pending_uploads ADD COLUMN completed_at INTEGER`)
    if (!cols.includes('avg_speed_kbps')) this.db.exec(`ALTER TABLE pending_uploads ADD COLUMN avg_speed_kbps REAL`)
    // Handle old column name (image_paths vs imagePaths)
    if (cols.includes('image_paths') && !cols.includes('imagePaths')) {
      // already correct - new schema uses image_paths
    } else if (!cols.includes('image_paths') && cols.includes('imagePaths')) {
      // old schema — add aliased column (can't rename in SQLite < 3.25)
      // We'll just read both in getPending
    }
  }

  enqueue(sessionId: string, metadata: any, imagePaths: string[], shareId?: string): void {
    this.db.prepare(`
      INSERT INTO pending_uploads (session_id, share_id, metadata, image_paths)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, shareId || null, JSON.stringify(metadata), JSON.stringify(imagePaths))
  }

  getPending(): QueuedSession[] {
    const rows = this.db.prepare(`
      SELECT * FROM pending_uploads
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
    `).all(Date.now()) as any[]
    return rows.map(this.normalizeRow)
  }

  getAll(): QueuedSession[] {
    const rows = this.db.prepare(`
      SELECT * FROM pending_uploads WHERE status != 'completed' ORDER BY created_at ASC
    `).all() as any[]
    return rows.map(this.normalizeRow)
  }

  private normalizeRow(r: any): QueuedSession {
    return {
      id: r.id,
      sessionId: r.session_id,
      shareId: r.share_id || null,
      metadata: r.metadata,
      // Support both old (imagePaths TEXT) and new (image_paths TEXT) column names
      imagePaths: r.image_paths ?? r.imagePaths ?? '[]',
      createdAt: r.created_at,
      retryCount: r.retry_count ?? 0,
      nextRetryAt: r.next_retry_at || null,
      status: r.status,
      sizeBytes: r.size_bytes || null,
      startedAt: r.started_at || null,
      completedAt: r.completed_at || null,
      avgSpeedKbps: r.avg_speed_kbps || null,
    }
  }

  markCompleted(id: number): void {
    this.db.prepare(`UPDATE pending_uploads SET status = 'completed', completed_at = ? WHERE id = ?`).run(Date.now(), id)
  }

  markFailed(id: number): void {
    this.db.prepare(`UPDATE pending_uploads SET retry_count = retry_count + 1, status = 'failed' WHERE id = ?`).run(id)
  }

  markRetrying(id: number): void {
    this.db.prepare(`UPDATE pending_uploads SET status = 'pending', next_retry_at = NULL WHERE id = ?`).run(id)
  }

  setNextRetry(id: number, nextRetryAt: number): void {
    this.db.prepare(`UPDATE pending_uploads SET status = 'pending', next_retry_at = ? WHERE id = ?`).run(nextRetryAt, id)
  }

  resetFailed(): void {
    this.db.prepare(`UPDATE pending_uploads SET status = 'pending', retry_count = 0, next_retry_at = NULL WHERE status = 'failed'`).run()
  }

  remove(id: number): void {
    this.db.prepare(`DELETE FROM pending_uploads WHERE id = ?`).run(id)
  }

  clearAll(): void {
    this.db.prepare(`DELETE FROM pending_uploads WHERE status != 'completed'`).run()
  }

  getDepth(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM pending_uploads WHERE status IN ('pending', 'uploading')`).get() as { count: number }
    return row.count
  }

  // Legacy backoff for scheduleRetry compat
  getBackoffDelay(retryCount: number): number {
    return retryCount <= 150 ? 2000 : 10000
  }

  scheduleRetry(id: number, retryCount: number): void {
    const delay = this.getBackoffDelay(retryCount)
    this.setNextRetry(id, Date.now() + delay)
  }

  // ---- NEW: Queue State & Diagnostics ----

  private _isPaused = false

  pause(): void { this._isPaused = true }
  resume(): void { this._isPaused = false }
  isQueuePaused(): boolean { return this._isPaused }

  getRecentUploads(limit = 10): QueuedSession[] {
    const rows = this.db.prepare(`
      SELECT * FROM pending_uploads
      ORDER BY created_at DESC LIMIT ?
    `).all(limit) as any[]
    return rows.map(this.normalizeRow)
  }

  markUploading(id: number, startedAt: number): void {
    this.db.prepare(`UPDATE pending_uploads SET status = 'uploading', started_at = ? WHERE id = ?`).run(startedAt, id)
  }

  updateStats(id: number, sizeBytes: number, speedKbps: number): void {
    this.db.prepare(`UPDATE pending_uploads SET size_bytes = ?, avg_speed_kbps = ? WHERE id = ?`).run(sizeBytes, speedKbps, id)
  }

  close(): void {
    this.db.close()
  }
}
