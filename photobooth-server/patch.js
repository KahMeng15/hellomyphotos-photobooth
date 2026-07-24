const fs = require('fs')

let dbCode = fs.readFileSync('src/db.ts', 'utf8')

// Add columns to events
dbCode = dbCode.replace(
  "try { db.exec(`ALTER TABLE events ADD COLUMN expiry_value TEXT NOT NULL DEFAULT ''`) } catch {}",
  "try { db.exec(`ALTER TABLE events ADD COLUMN expiry_value TEXT NOT NULL DEFAULT ''`) } catch {}\ntry { db.exec(`ALTER TABLE events ADD COLUMN organizer TEXT NOT NULL DEFAULT ''`) } catch {}\ntry { db.exec(`ALTER TABLE events ADD COLUMN contact_info TEXT NOT NULL DEFAULT ''`) } catch {}"
)

// Add columns to global_settings
dbCode = dbCode.replace(
  "try { db.exec(`ALTER TABLE global_settings ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}",
  "try { db.exec(`ALTER TABLE global_settings ADD COLUMN dslr_whitebalance_kelvin INTEGER NOT NULL DEFAULT 5200`) } catch {}\ntry { db.exec(`ALTER TABLE global_settings ADD COLUMN organizer TEXT NOT NULL DEFAULT ''`) } catch {}\ntry { db.exec(`ALTER TABLE global_settings ADD COLUMN contact_info TEXT NOT NULL DEFAULT ''`) } catch {}"
)

// Seed defaults row
dbCode = dbCode.replace(
  "VALUES (1, 4, 5, 1, 2, 'auto', 'auto', 'auto', 'auto', 'auto', 5200)",
  "VALUES (1, 4, 5, 1, 2, 'auto', 'auto', 'auto', 'auto', 'auto', 5200) /* organizer/contact_info added below */"
)

// createEvent sql
dbCode = dbCode.replace(
  "VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)
dbCode = dbCode.replace(
  "insertEvent.run(id, name, date, description, otp, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, obfuscateLinks, expiryType, expiryValue)",
  "insertEvent.run(id, name, date, description, otp, photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, obfuscateLinks, expiryType, expiryValue, settings?.organizer ?? '', settings?.contactInfo ?? '')"
)
dbCode = dbCode.replace(
  "INSERT INTO events (id, name, date, description, otp, status, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, obfuscate_links, expiry_type, expiry_value)",
  "INSERT INTO events (id, name, date, description, otp, status, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, obfuscate_links, expiry_type, expiry_value, organizer, contact_info)"
)


// updateEvent sql
dbCode = dbCode.replace(
  "obfuscate_links = ?, expiry_type = ?, expiry_value = ? WHERE id = ?",
  "obfuscate_links = ?, expiry_type = ?, expiry_value = ?, organizer = ?, contact_info = ? WHERE id = ?"
)
dbCode = dbCode.replace(
  "settings?.expiryValue ?? existing.expiry_value,\n    id",
  "settings?.expiryValue ?? existing.expiry_value,\n    settings?.organizer ?? existing.organizer,\n    settings?.contactInfo ?? existing.contact_info,\n    id"
)
dbCode = dbCode.replace(
  "settings.expiryValue ?? existing.expiry_value ?? '', id)",
  "settings.expiryValue ?? existing.expiry_value ?? '', settings.organizer ?? existing.organizer ?? '', settings.contactInfo ?? existing.contact_info ?? '', id)"
)


// getGlobalSettings
dbCode = dbCode.replace(
  "dslrWhiteBalanceKelvin: row?.dslr_whitebalance_kelvin ?? 5200,",
  "dslrWhiteBalanceKelvin: row?.dslr_whitebalance_kelvin ?? 5200,\n    organizer: (row as any)?.organizer ?? '',\n    contactInfo: (row as any)?.contact_info ?? '',"
)

// updateGlobalSettings sql
dbCode = dbCode.replace(
  "dslr_whitebalance_kelvin = excluded.dslr_whitebalance_kelvin",
  "dslr_whitebalance_kelvin = excluded.dslr_whitebalance_kelvin,\n    organizer = excluded.organizer,\n    contact_info = excluded.contact_info"
)
dbCode = dbCode.replace(
  "VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)
dbCode = dbCode.replace(
  "INSERT INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin)",
  "INSERT INTO global_settings (id, photo_count, countdown, capture_interval, post_capture_preview, dslr_iso, dslr_shutterspeed, dslr_aperture, dslr_focus_mode, dslr_whitebalance, dslr_whitebalance_kelvin, organizer, contact_info)"
)
dbCode = dbCode.replace(
  "settings.dslrWhiteBalanceKelvin ?? 5200)",
  "settings.dslrWhiteBalanceKelvin ?? 5200, (settings as any).organizer ?? '', (settings as any).contactInfo ?? '')"
)


fs.writeFileSync('src/db.ts', dbCode)
console.log('db.ts patched')

// Update share route to include organizer in event data
let shareCode = fs.readFileSync('src/routes/share.ts', 'utf8')
shareCode = shareCode.replace(
  "eventName: event.name,",
  "eventName: event.name,\n      organizer: (event as any).organizer || '',\n      contactInfo: (event as any).contact_info || '',"
)
fs.writeFileSync('src/routes/share.ts', shareCode)
console.log('share.ts patched')
