const fs = require('fs')

let adminCode = fs.readFileSync('src/routes/admin.ts', 'utf8')

// create Event
adminCode = adminCode.replace(
  "const { name, date, description, ...settings } = req.body",
  "const { name, date, description, organizer, contactInfo, ...settings } = req.body\n    settings.organizer = organizer\n    settings.contactInfo = contactInfo"
)

// defaults put
adminCode = adminCode.replace(
  "const { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin } = req.body",
  "const { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, organizer, contactInfo } = req.body"
)

adminCode = adminCode.replace(
  "dslrWhiteBalanceKelvin\n    })",
  "dslrWhiteBalanceKelvin,\n      organizer,\n      contactInfo\n    })"
)

// update event settings
adminCode = adminCode.replace(
  "const { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, obfuscateLinks, expiryType, expiryValue } = req.body",
  "const { photoCount, countdown, captureInterval, postCapturePreview, dslrIso, dslrShutterSpeed, dslrAperture, dslrFocusMode, dslrWhiteBalance, dslrWhiteBalanceKelvin, obfuscateLinks, expiryType, expiryValue, organizer, contactInfo } = req.body"
)

adminCode = adminCode.replace(
  "expiryValue\n    })",
  "expiryValue,\n      organizer,\n      contactInfo\n    })"
)

fs.writeFileSync('src/routes/admin.ts', adminCode)
console.log('admin.ts patched')

