import os

with open('docker-compose.dev.yml', 'r') as f:
    content = f.read()

# Add COOKIE_PATH and COOKIE_DOMAIN if missing
if 'COOKIE_PATH:' not in content:
    content = content.replace('COOKIE_SECURE: "false"', 'COOKIE_SECURE: "false"\n      COOKIE_PATH: /hellomyphotos-photobooth-test\n      COOKIE_DOMAIN: kmeng.ftp.sh')

with open('docker-compose.dev.yml', 'w') as f:
    f.write(content)

print("patched docker compose")
