const fs = require('fs');

let health = fs.readFileSync('photobooth-server/src/routes/health.ts', 'utf8');
health = health.replace(
  /shareBaseUrl: process\.env\.SHARE_BASE_URL \|\| \`\$\{req\.protocol\}:\/\/\$\{req\.get\('host'\)\}\/share\`,/,
  "shareBaseUrl: (process.env.SHARE_BASE_URL ? `${process.env.SHARE_BASE_URL.replace(/\\/$/, '')}/share` : `${req.protocol}://${req.get('host')}/share`),"
);
fs.writeFileSync('photobooth-server/src/routes/health.ts', health);

let booth = fs.readFileSync('photobooth-server/src/routes/booth.ts', 'utf8');
booth = booth.replace(
  /const baseUrl = process\.env\.SHARE_BASE_URL \|\| \`\$\{req\.protocol\}:\/\/\$\{req\.get\('host'\)\}\/share\`;/,
  "const baseUrl = process.env.SHARE_BASE_URL ? `${process.env.SHARE_BASE_URL.replace(/\\/$/, '')}/share` : `${req.protocol}://${req.get('host')}/share`;"
);
fs.writeFileSync('photobooth-server/src/routes/booth.ts', booth);

