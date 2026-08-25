const fs = require('fs');

const path = 'photobooth-client/src/renderer/components/Gallery.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace the QR shareUrl generation
content = content.replace(
  /const shareUrl = \`\$\{serverUrl\}\/share\/\$\{session\.shareId\}\`/,
  `let shareBase = \`\${serverUrl}/share\`
        try {
          const healthRes = await fetch(\`\${serverUrl}/api/health\`)
          if (healthRes.ok) {
            const healthData = await healthRes.json()
            if (healthData.shareBaseUrl) shareBase = healthData.shareBaseUrl.replace(/\\/$/, '')
          }
        } catch (e) {}
        const shareUrl = \`\${shareBase}/\${session.shareId}\``
);

fs.writeFileSync(path, content);
