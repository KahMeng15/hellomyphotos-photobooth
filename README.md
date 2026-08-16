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

### Docker (recommended)

Use `docker-compose.dev.yml` to run the server without installing Node locally. It mounts your source files for live-reload and runs both the Express API and the Vue 3 frontend concurrently inside the container.

```bash
# From the repo root
docker compose -f docker-compose.dev.yml up --build
```

| Service | URL |
|---|---|
| Express API + WebSocket | `http://localhost:3000` |
| Vue 3 operator dashboard (HMR) | `http://localhost:5173` |

Default credentials: `operator@hellomyphoto.local` / `admin123`

> **Note** — source files in `./photobooth-server` are bind-mounted into the container, so any edits are reflected immediately without rebuilding. `node_modules` lives in an anonymous volume to prevent host/container OS conflicts.

To stop:

```bash
docker compose -f docker-compose.dev.yml down
```

---

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

## Camera Support

hellomyphoto supports two capture modes, switchable from the Settings panel (`Cmd/Ctrl+Shift+S`):

| Mode | Description |
|---|---|
| **Webcam** (default) | Uses any `getUserMedia`-compatible webcam. Zero setup. |
| **DSLR / Mirrorless** | USB tethered camera. Live preview + hardware shutter fire. |

### DSLR / Mirrorless — Quick Setup

**macOS** — install gphoto2:
```bash
brew install gphoto2
# Kill the macOS PTP daemon before each session:
killall PTPCamera 2>/dev/null
```

**Windows** — install [DigiCamControl](http://digicamcontrol.com/) and ensure it is
running in the system tray before launching the booth.

Tested cameras: **Canon EOS 80D**, **Sony A7RII**. Any gphoto2 / DigiCamControl
compatible camera should work.

→ See [`docs/CAMERAS.md`](docs/CAMERAS.md) for the full guide, camera settings,
and troubleshooting.

## Auth

Default: `operator@hellomyphoto.local` / `admin123`

## Docs

- `docs/CAMERAS.md` — DSLR/mirrorless camera setup (macOS & Windows)
- `docs/DEPLOYMENT.md` — Local + public hosting
- `docs/SECURITY.md` — OAuth2, JWT, CSRF, headers
- `docs/BANDWIDTH.md` — Image compression, caching, targets
- `nginx.conf` — Nginx reverse proxy config for kmeng.com
