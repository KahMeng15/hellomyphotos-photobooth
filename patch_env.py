import os

with open('.env', 'r') as f:
    content = f.read()

content = content.replace('COOKIE_PATH=/', 'COOKIE_PATH=/hellomyphotos-photobooth-test')

with open('.env', 'w') as f:
    f.write(content)

print("patched .env")
