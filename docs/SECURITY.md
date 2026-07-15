# Security Guide

## Authentication
- OAuth2 password grant with JWT
- Access tokens: 15 min expiry
- Refresh tokens: 7 day expiry, stored in HttpOnly cookies
- Rate limiting: 5 login attempts / 15 min per IP

## Token Storage
- `accessToken`: HttpOnly, Secure, SameSite=Strict cookie
- `refreshToken`: HttpOnly, Secure, SameSite=Strict cookie
- CSRF protection via double-submit cookie pattern

## Production Checklist
- [ ] Change default JWT_SECRET and REFRESH_TOKEN_SECRET
- [ ] Change default OPERATOR_PASSWORD
- [ ] Enable HTTPS (Let's Encrypt or self-signed)
- [ ] Restrict port 3000 to LAN subnet
- [ ] Enable rate limiting on all public endpoints
- [ ] Set ALLOWED_ORIGINS to specific domains

## Headers
- Strict-Transport-Security: max-age=31536000
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
