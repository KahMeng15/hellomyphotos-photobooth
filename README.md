# hellomyphoto

Self-hosted photo booth system. Two-node: Electron capture client + Express/Vue 3 operator hub.

```
Booth Client (Electron) ──HTTP/WS──→ Server (Express + Vue 3 + Sharp + Socket.IO)
```

## Quick Start

```bash
# Server (Docker)
cd photobooth-server && cp .env.example .env
docker compose up -d --build

# Client (build installer)
cd photobooth-client && npm install && npm run make
```

## Development

### Server (2 terminals)

```bash
cd photobooth-server

# Terminal 1 — Express API + WebSocket (hot-reload, logs all requests)
npm run dev

# Terminal 2 — Vue 3 frontend with HMR (auto-opens at http://localhost:5173)
npm run dev:frontend
```

API calls from the frontend are proxied to the Express server automatically. Open `http://localhost:5173` for the operator dashboard.

### Electron Client (1 terminal)

```bash
cd photobooth-client
npm run dev
```

Compiles TypeScript and launches the booth in a framed window with DevTools open.

## Auth

Default: `operator@hellomyphoto.local` / `admin123`

## Docs

- `docs/DEPLOYMENT.md` — Local + public hosting
- `docs/SECURITY.md` — OAuth2, JWT, CSRF, headers
- `docs/BANDWIDTH.md` — Image compression, caching, targets
- `nginx.conf` — Nginx reverse proxy config for kmeng.com
