# Bandwidth Optimization

## Target: <2 Mbps sustained for 10 concurrent sessions

### Client-Side
- JPEG → WebP at 75% quality (~2–4 MB per photo)
- Batch upload: all photos as single multipart request
- Offline queuing: buffer uploads if bandwidth limited

### Server-Side
- gzip + Brotli compression on all JSON responses
- HTTP cache headers: 1 year for immutable assets, 1 hour for latest
- Thumbnail lazy loading: 400px thumbnails first, click for full
- WebSocket binary frames with delta compression

### Measurements
- Single photo upload: ~3 MB (WebP 75%)
- 4-photo session: ~12 MB total
- Processing: <2s for 4 photos + strip
- WebSocket overhead: <1 KB per update
