import crypto from 'crypto'
import { config } from '../config'

export function generateSignedUrl(shareToken: string, id: string, expiresInSeconds: number = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const payload = `${shareToken}:${id}:${exp}`
  const sig = crypto.createHmac('sha256', config.security.signedUrlSecret).update(payload).digest('hex')
  return `/api/share/${shareToken}/photo/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`
}

export function verifySignedUrl(shareToken: string, id: string, exp: string, sig: string): boolean {
  if (!shareToken || !id || !exp || !sig) return false
  
  const expires = parseInt(exp, 10)
  if (isNaN(expires) || expires < Math.floor(Date.now() / 1000)) {
    return false
  }

  const payload = `${shareToken}:${id}:${exp}`
  const expectedSig = crypto
    .createHmac('sha256', config.security.signedUrlSecret)
    .update(payload)
    .digest('hex')

  if (sig.length !== 64) return false

  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))
}
