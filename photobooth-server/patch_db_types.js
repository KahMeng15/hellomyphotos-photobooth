const fs = require('fs')
let dbCode = fs.readFileSync('src/db.ts', 'utf8')

// 1. Fix expiryValue settings argument type
dbCode = dbCode.replaceAll(
  "expiryValue?: string }) {",
  "expiryValue?: string; organizer?: string; contactInfo?: string }) {"
)

// 2. Fix getEvent / listEvents return types
dbCode = dbCode.replaceAll(
  "expiry_value: string;",
  "expiry_value: string; organizer: string; contact_info: string;"
)

// 3. Fix getGlobalSettings return type
dbCode = dbCode.replaceAll(
  "dslr_whitebalance_kelvin: number } | undefined",
  "dslr_whitebalance_kelvin: number; organizer: string; contact_info: string } | undefined"
)

// 4. Fix updateGlobalSettings argument type
dbCode = dbCode.replaceAll(
  "dslrWhiteBalanceKelvin?: number }) {",
  "dslrWhiteBalanceKelvin?: number; organizer?: string; contactInfo?: string }) {"
)

fs.writeFileSync('src/db.ts', dbCode)
console.log('Fixed db.ts types again')
