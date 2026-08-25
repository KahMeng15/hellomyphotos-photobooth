const fs = require('fs');

const path = 'photobooth-client/src/renderer/components/Gallery.ts';
let content = fs.readFileSync(path, 'utf8');

// Reject shareId if it starts with session_
content = content.replace(
  /if \(session\.shareId\) \{/g,
  "if (session.shareId && !session.shareId.startsWith('session_')) {"
);

content = content.replace(
  /if \(session\.shareId && paths\.length > 0\) \{/g,
  "if (session.shareId && !session.shareId.startsWith('session_') && paths.length > 0) {"
);

fs.writeFileSync(path, content);
