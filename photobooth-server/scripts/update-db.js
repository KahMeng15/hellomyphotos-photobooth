const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, '..', 'src', 'db.ts')
let content = fs.readFileSync(dbPath, 'utf8')

// 1. Imports
content = content.replace("import { randomInt } from 'crypto'", "import { randomInt, randomBytes } from 'crypto'")

// 2. Alter tables
const alterTables = `
try { db.exec(\`ALTER TABLE events ADD COLUMN obfuscate_links INTEGER NOT NULL DEFAULT 0\`) } catch {}
try { db.exec(\`ALTER TABLE events ADD COLUMN expiry_type TEXT NOT NULL DEFAULT 'none'\`) } catch {}
try { db.exec(\`ALTER TABLE events ADD COLUMN expiry_value TEXT NOT NULL DEFAULT ''\`) } catch {}
try { db.exec(\`ALTER TABLE photo_sessions ADD COLUMN share_id TEXT UNIQUE\`) } catch {}
`
content = content.replace(
  "try { db.exec(`ALTER TABLE events ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}",
  "try { db.exec(`ALTER TABLE events ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}\n" + alterTables
)

// 3. Queries
content = content.replace(
  "INSERT INTO events (id, name, date, description, otp, status, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin)\n  VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "INSERT INTO events (id, name, date, description, otp, status, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, obfuscate_links, expiry_type, expiry_value)\n  VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

content = content.replace(
  "UPDATE events SET name = ?, date = ?, description = ?, photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ? WHERE id = ?",
  "UPDATE events SET name = ?, date = ?, description = ?, photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ?, obfuscate_links = ?, expiry_type = ?, expiry_value = ? WHERE id = ?"
)

content = content.replace(
  "UPDATE events SET photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ? WHERE id = ?",
  "UPDATE events SET photo_count = ?, countdown = ?, capture_interval = ?, post_capture_preview = ?, dslr_iso = ?, dslr_shutterspeed = ?, dslr_aperture = ?, dslr_focus_mode = ?, dslr_whitebalance = ?, dslr_whitebalance_kelvin = ?, obfuscate_links = ?, expiry_type = ?, expiry_value = ? WHERE id = ?"
)

// 4. insertPhotoSession
content = content.replace(
  "INSERT INTO photo_sessions (id, event_id) VALUES (?, ?)",
  "INSERT INTO photo_sessions (id, event_id, share_id) VALUES (?, ?, ?)"
)

content = content.replace(
  "const findPhotoSession = db.prepare('SELECT * FROM photo_sessions WHERE id = ?')",
  "const findPhotoSession = db.prepare('SELECT * FROM photo_sessions WHERE id = ?')\nconst findPhotoSessionByShareId = db.prepare('SELECT * FROM photo_sessions WHERE share_id = ?')"
)

// 5. createEvent signature
content = content.replace(
  "export function createEvent(name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number }) {",
  "export function createEvent(name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string }) {"
)

// insertEvent.run in createEvent
content = content.replace(
  "const dslrWhiteBalanceKelvin = settings?.dslrWhiteBalanceKelvin ?? defaults.dslrWhiteBalanceKelvin\n  insertEvent.run(id, name, date, description, otp, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin)",
  "const dslrWhiteBalanceKelvin = settings?.dslrWhiteBalanceKelvin ?? defaults.dslrWhiteBalanceKelvin\n  const obfuscateLinks = settings?.obfuscateLinks ?? 0\n  const expiryType = settings?.expiryType ?? 'none'\n  const expiryValue = settings?.expiryValue ?? ''\n  insertEvent.run(id, name, date, description, otp, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, obfuscateLinks, expiryType, expiryValue)"
)

// 6. updateEventById signature
content = content.replace(
  "export function updateEventById(id: string, name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number }) {",
  "export function updateEventById(id: string, name: string, date: string, description: string, settings?: { photoCount?: number; countdown?: number; captureInterval?: number; postCapturePreview?: number; dslrIso?: string; dslrShutterSpeed?: string; dslrAperture?: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string }) {"
)

// updateEvent.run in updateEventById
content = content.replace(
  "settings?.dslrWhiteBalanceKelvin ?? existing.dslr_whitebalance_kelvin,\n    id",
  "settings?.dslrWhiteBalanceKelvin ?? existing.dslr_whitebalance_kelvin,\n    settings?.obfuscateLinks ?? existing.obfuscate_links,\n    settings?.expiryType ?? existing.expiry_type,\n    settings?.expiryValue ?? existing.expiry_value,\n    id"
)

// 7. updateEventSettingsById signature
content = content.replace(
  "export function updateEventSettingsById(id: string, settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number }) {",
  "export function updateEventSettingsById(id: string, settings: { photoCount: number; countdown: number; captureInterval: number; postCapturePreview: number; dslrIso: string; dslrShutterSpeed: string; dslrAperture: string; dslrFocusMode?: string; dslrWhiteBalance?: string; dslrWhiteBalanceKelvin?: number; obfuscateLinks?: number; expiryType?: string; expiryValue?: string }) {"
)

// updateEventSettings.run
content = content.replace(
  "settings.dslrWhiteBalanceKelvin ?? existing.dslr_whitebalance_kelvin ?? 5200, id)",
  "settings.dslrWhiteBalanceKelvin ?? existing.dslr_whitebalance_kelvin ?? 5200, settings.obfuscateLinks ?? existing.obfuscate_links ?? 0, settings.expiryType ?? existing.expiry_type ?? 'none', settings.expiryValue ?? existing.expiry_value ?? '', id)"
)

// 8. Event Types
const eventTypeOriginal = "dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number;"
const eventTypeNew = "dslr_focus_mode: string; dslr_whitebalance: string; dslr_whitebalance_kelvin: number;\n    obfuscate_links: number; expiry_type: string; expiry_value: string;"
content = content.split(eventTypeOriginal).join(eventTypeNew)

// 9. ensurePhotoSession
content = content.replace(
  "export function ensurePhotoSession(sessionId: string, eventId: string) {\n  const existing = findPhotoSession.get(sessionId)\n  if (existing) return\n  insertPhotoSession.run(sessionId, eventId)\n}",
  "export function ensurePhotoSession(sessionId: string, eventId: string) {\n  const existing = findPhotoSession.get(sessionId)\n  if (existing) {\n    // Backfill share_id if missing\n    if (!(existing as any).share_id) {\n      const shareId = randomBytes(4).toString('hex')\n      db.prepare('UPDATE photo_sessions SET share_id = ? WHERE id = ?').run(shareId, sessionId)\n    }\n    return\n  }\n  const shareId = randomBytes(4).toString('hex')\n  insertPhotoSession.run(sessionId, eventId, shareId)\n}"
)

// 10. listEventPhotoSessions
content = content.replace(
  "id: string; event_id: string; created_at: string; archived: number",
  "id: string; event_id: string; created_at: string; archived: number; share_id: string"
)

// 11. getPhotoSessionByShareId function
content += `\nexport function getPhotoSessionByShareId(shareId: string) {
  return findPhotoSessionByShareId.get(shareId) as {
    id: string; event_id: string; created_at: string; share_id: string; archived: number;
  } | undefined
}\n`

fs.writeFileSync(dbPath, content, 'utf8')
console.log('db.ts updated successfully')
