import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

export interface QueuedSession {
  id: number
  sessionId: string
  metadata: string
  imagePaths: string
  createdAt: string
  retryCount: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
}

export class OfflineQueue {
  private db: Database.Database
  private retryTimers: Map<number, NodeJS.Timeout> = new Map()

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
        metadata TEXT,
        image_paths TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending'
      )
    `)
  }

  enqueue(sessionId: string, metadata: any, imagePaths: string[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO pending_uploads (session_id, metadata, image_paths)
      VALUES (?, ?, ?)
    `)
    stmt.run(sessionId, JSON.stringify(metadata), JSON.stringify(imagePaths))
  }

  getPending(): QueuedSession[] {
    const stmt = this.db.prepare("SELECT * FROM pending_uploads WHERE status = 'pending' ORDER BY created_at ASC")
    return stmt.all() as QueuedSession[]
  }

  markCompleted(id: number): void {
    const stmt = this.db.prepare("UPDATE pending_uploads SET status = 'completed' WHERE id = ?")
    stmt.run(id)
  }

  markFailed(id: number): void {
    const stmt = this.db.prepare("UPDATE pending_uploads SET retry_count = retry_count + 1, status = 'failed' WHERE id = ?")
    stmt.run(id)
  }

  markRetrying(id: number): void {
    const stmt = this.db.prepare("UPDATE pending_uploads SET status = 'pending' WHERE id = ?")
    stmt.run(id)
  }

  getDepth(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM pending_uploads WHERE status = 'pending'")
    const row = stmt.get() as { count: number }
    return row.count
  }

  getBackoffDelay(retryCount: number): number {
    const delays = [5000, 10000, 20000, 60000]
    return delays[Math.min(retryCount, delays.length - 1)]
  }

  scheduleRetry(id: number, retryCount: number): void {
    const delay = this.getBackoffDelay(retryCount)
    const timer = setTimeout(() => {
      this.markRetrying(id)
      this.retryTimers.delete(id)
    }, delay)
    this.retryTimers.set(id, timer)
  }

  clearRetries(): void {
    for (const [, timer] of this.retryTimers) {
      clearTimeout(timer)
    }
    this.retryTimers.clear()
  }

  close(): void {
    this.clearRetries()
    this.db.close()
  }
}
