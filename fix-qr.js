const fs = require('fs');

const path = 'photobooth-client/src/renderer/components/Gallery.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /color: \{ dark: '#0a0a0a', light: '[^']+' \},/,
  "color: { dark: '#0a0a0a', light: '#ffffff' },"
);

fs.writeFileSync(path, content);
