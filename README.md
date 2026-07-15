# hellomyphoto

Self-hosted photo booth system. Two-node: Electron capture client + Express/Vue 3 operator hub.

## Architecture

```
Booth Client (Electron) ──HTTP/WS──→ Server (Docker: Express + Vue 3)
```

## Quick Start

```bash
# Server
cd photobooth-server
docker compose up -d --build

# Client
cd photobooth-client
npm install && npm run make
```

## Structure

- `photobooth-server/` - Backend (Express + Vue 3 + Sharp + Socket.IO)
- `photobooth-client/` - Electron desktop capture app
- `docs/` - Deployment, security, bandwidth guides
- `nginx.conf` - Nginx config for public hosting

## Auth

Default: `operator@hellomyphoto.local` / `admin123`

See `docs/` for production setup.
