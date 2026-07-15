# hellomyphoto

Self-hosted photo booth system. Two-node: Electron capture client + Express/Vue 3 operator hub.

```
Booth Client (Electron) ──HTTP/WS──→ Server (Express + Vue 3 + Sharp + Socket.IO)
```

## Quick Start

```bash
# Server (Docker — everything in one command)
cd photobooth-server
cp .env.example .env
docker compose up -d --build

# Client (build installer)
cd photobooth-client
npm install
npm run make
```

## Development

All commands use `npm run` so tools resolve from the local project (not global `npx`).

### Server (2 terminals)

```bash
cd photobooth-server

# Terminal 1 — Express backend with hot-reload + request/error logs
npm run dev

# Terminal 2 — Vue 3 frontend HMR (updates on save)
npm run dev:frontend
```

- Backend: `http://localhost:3000` logs all requests, image processing, and WebSocket events
- Frontend: Vite dev server proxies API calls to the backend
- If you only need the backend, just run `npm run dev` (frontend must be built first via `npm run build`)

### Electron Client (1 terminal)

```bash
cd photobooth-client
npm run dev
```

This compiles TypeScript then launches Electron in a framed window with DevTools auto-opened. All logs stream to the terminal (main process) and DevTools console (renderer).

## Auth

Default: `operator@hellomyphoto.local` / `admin123`

## Docs

- `docs/DEPLOYMENT.md` — Local + public hosting
- `docs/SECURITY.md` — OAuth2, JWT, CSRF, headers
- `docs/BANDWIDTH.md` — Image compression, caching, targets
- `nginx.conf` — Nginx reverse proxy config for kmeng.com
