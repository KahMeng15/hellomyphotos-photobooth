const fs = require('fs');

function addEnv(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('photobooth-server-dev:') || content.includes('photobooth-server:')) {
    // Add SHARE_BASE_URL to admin server
    content = content.replace(
      /(VITE_BASE_URL:[^\n]+)/g,
      "$1\n      SHARE_BASE_URL: ${SHARE_BASE_URL:-https://kmeng.ftp.sh/snapsync/share}"
    );
    fs.writeFileSync(file, content);
  }
}

addEnv('docker-compose.yml');
addEnv('docker-compose.dev.yml');
