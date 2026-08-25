const fs = require('fs');

const path = 'photobooth-server/src/routes/booth.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace shareUrl generation
content = content.replace(
  /const shareUrl = \`\$\{req\.protocol\}\:\/\/\$\{req\.get\('host'\)\}\/share\/\$\{shareId\}\`/,
  "const baseUrl = process.env.SHARE_BASE_URL || `${req.protocol}://${req.get('host')}/share`;\n    const shareUrl = `${baseUrl.replace(/\\/$/, '')}/${shareId}`"
);

fs.writeFileSync(path, content);
