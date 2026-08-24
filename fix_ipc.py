import os

filepath = 'photobooth-client/src/main/ipc.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Fix 1: Remove the redeclaration of `const s`
content = content.replace("const hw = await dslrManager.getHardwareSettings()\n      const s = getSettingsSync()\n", "const hw = await dslrManager.getHardwareSettings()\n")

# Fix 2: Replace syncOtp with merged.otp || ''
content = content.replace("'x-booth-otp': syncOtp", "'x-booth-otp': merged.otp || ''")

with open(filepath, 'w') as f:
    f.write(content)

print("ipc.ts fixed.")
