import re

filepath = 'photobooth-server/src/middleware/rateLimit.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Fix lockout check block
old_check = """  if (data.lockedUntil && now < data.lockedUntil) {
    return res.status(429).json({ error: 'You have been temporarily blocked due to excessive requests. Try again later.' })
  } else if (data.lockedUntil && now >= data.lockedUntil) {"""

new_check = """  if (data.lockedUntil && now < data.lockedUntil) {
    const remainingMs = data.lockedUntil - now
    const remainingMinutes = Math.ceil(remainingMs / 60000)
    const plural = remainingMinutes > 1 ? 's' : ''
    return res.status(429).json({ error: `You have been temporarily blocked due to excessive requests. Try again in ${remainingMinutes} minute${plural}.` })
  } else if (data.lockedUntil && now >= data.lockedUntil) {"""
content = content.replace(old_check, new_check)

# Fix lockout initiation block
old_init = """    return res.status(429).json({ error: 'Rate limit or bandwidth exceeded. You have been locked out.' })"""

new_init = """    const lockoutMins = Math.ceil(lockoutDur / 60000)
    const plural = lockoutMins > 1 ? 's' : ''
    return res.status(429).json({ error: `You have been temporarily blocked due to excessive requests. Try again in ${lockoutMins} minute${plural}.` })"""
content = content.replace(old_init, new_init)

with open(filepath, 'w') as f:
    f.write(content)
