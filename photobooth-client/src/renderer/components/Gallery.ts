import QRCode from 'qrcode'

export interface QueuedSession {
  id: number
  sessionId: string
  shareId: string | null
  metadata: string
  imagePaths: string // JSON array
  createdAt: string
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  retryCount?: number
  sizeBytes?: number | null
  avgSpeedKbps?: number | null
  thumbPaths?: string | null
}

// ---------------------------------------------------------------------------
// Design tokens (mirrors Settings.ts)
// ---------------------------------------------------------------------------
const BG          = '#0f0f0f'
const ROW_A       = '#191919'
const ROW_B       = '#111'
const BORDER      = '#2a2a2a'
const LABEL_COLOR = '#888'
const TEXT_COLOR  = '#ccc'

const normalizeUrl = (url: string) => {
  let u = url.trim().replace(/\/+$/, '')
  if (!u.startsWith('http')) u = `http://${u}`
  return u
}
const fileSrc = (p: string) => p.startsWith('http') ? p : `file://${p}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateParts(iso: string): { time: string; date: string } {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  return { time, date }
}

type StatusKey = QueuedSession['status']

function statusInfo(s: StatusKey): { label: string; color: string; icon: string } {
  switch (s) {
    case 'completed':
      return {
        label: 'Uploaded',
        color: '#22c55e',
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      }
    case 'uploading':
      return {
        label: 'Uploading',
        color: '#fbbf24',
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
      }
    case 'failed':
      return {
        label: 'Failed',
        color: '#ef4444',
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      }
    default:
      return {
        label: 'Pending',
        color: '#9ca3af',
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      }
  }
}

// Inject shared styles once
let stylesInjected = false
function ensureStyles() {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes gfadeup {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .g-page {
      position: absolute; inset: 0;
      background: ${BG};
      display: none; flex-direction: column;
      overflow: hidden;
    }
    .g-page.g-visible { display: flex; }
    .g-panel {
      background: ${BG}; padding: 2rem;
      width: 100%; box-sizing: border-box;
      flex: 1; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: #2a2a2a transparent;
    }
    .g-header {
      display: flex; align-items: center; gap: 0.75rem;
      margin-bottom: 1.5rem; flex-shrink: 0;
    }
    .g-back-btn {
      background: none; border: none; color: ${LABEL_COLOR};
      cursor: pointer; padding: 0.25rem;
      display: flex; align-items: center; border-radius: 6px;
      transition: color 150ms;
    }
    .g-back-btn:hover { color: #fff; }
    .g-title {
      font-size: 1.25rem; font-weight: 700; margin: 0; flex: 1; color: #fff;
    }
    .g-section-label {
      font-size: 0.8125rem; font-weight: 600; color: ${LABEL_COLOR};
      margin: 0 0 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .g-card {
      background: ${ROW_A}; border: 1px solid ${BORDER};
      border-radius: 8px; overflow: hidden;
      cursor: pointer;
      transition: border-color 150ms, background 150ms;
      animation: gfadeup 220ms ease both;
    }
    .g-card:hover { background: #1e1e1e; border-color: #3a3a3a; }
    .g-card:active { background: #222; }
    .g-meta-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.625rem 1rem; border-bottom: 1px solid #252525;
      font-size: 0.8125rem;
    }
    .g-meta-row:last-child { border-bottom: none; }
    .g-meta-label { color: ${LABEL_COLOR}; }
    .g-meta-value { color: ${TEXT_COLOR}; font-weight: 500; }
    .g-photo-thumb {
      background: #1a1a1a; overflow: hidden;
      cursor: zoom-in; border-radius: 6px;
      transition: opacity 150ms;
    }
    .g-photo-thumb:hover { opacity: 0.85; }
    .g-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .g-status-pill {
      display: inline-flex; align-items: center; gap: 0.3rem;
      font-size: 0.7rem; font-weight: 600; letter-spacing: 0.03em;
      padding: 0.2rem 0.55rem; border-radius: 100px;
    }
  `
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Gallery — main exported class
// Manages two "pages": list view and detail view
// ---------------------------------------------------------------------------

export class Gallery {
  private static progressMap: Record<string, any> = {}
  private static progressListenerAdded = false

  private container: HTMLElement
  private listPage: HTMLDivElement
  private listGrid: HTMLDivElement

  // Page 2: session detail
  private detailPage: HTMLDivElement

  constructor(container: HTMLElement) {
    this.container = container
    ensureStyles()

    if (!Gallery.progressListenerAdded) {
      Gallery.progressListenerAdded = true
      window.hellomyphoto?.onUploadProgress((data) => {
        Gallery.progressMap[data.sessionId] = data
        // Dispatch a custom event so the open detail view can update
        window.dispatchEvent(new CustomEvent('gallery-progress', { detail: data }))
      })
      window.hellomyphoto?.onUploadComplete((data) => {
        if (Gallery.progressMap[data.sessionId]) {
          Gallery.progressMap[data.sessionId].percent = data.success ? 100 : 0
          window.dispatchEvent(new CustomEvent('gallery-progress', { detail: Gallery.progressMap[data.sessionId] }))
        }
      })
    }

    // ---- List page ----
    this.listPage = document.createElement('div')
    this.listPage.className = 'g-page'
    this.listPage.style.zIndex = '45'

    const listPanel = document.createElement('div')
    listPanel.className = 'g-panel'

    // Header
    const listHeader = document.createElement('div')
    listHeader.className = 'g-header'

    const listBackBtn = document.createElement('button')
    listBackBtn.className = 'g-back-btn'
    listBackBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    listBackBtn.addEventListener('click', () => this.hide())

    const listTitle = document.createElement('h2')
    listTitle.className = 'g-title'
    listTitle.textContent = 'Past Sessions'

    listHeader.appendChild(listBackBtn)
    listHeader.appendChild(listTitle)
    listPanel.appendChild(listHeader)

    // Section label + grid
    const sectionLabel = document.createElement('p')
    sectionLabel.className = 'g-section-label'
    sectionLabel.id = 'g-session-count'
    sectionLabel.textContent = 'Loading…'
    listPanel.appendChild(sectionLabel)

    this.listGrid = document.createElement('div')
    this.listGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    `
    listPanel.appendChild(this.listGrid)

    this.listPage.appendChild(listPanel)

    // ---- Detail page ----
    this.detailPage = document.createElement('div')
    this.detailPage.className = 'g-page'
    this.detailPage.style.zIndex = '46'

    this.container.appendChild(this.listPage)
    this.container.appendChild(this.detailPage)
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  public async show() {
    this.listPage.classList.add('g-visible')
    await this.loadSessions()
  }

  public hide() {
    this.listPage.classList.remove('g-visible')
    this.detailPage.classList.remove('g-visible')
  }

  // -------------------------------------------------------------------------
  // Load sessions (list view)
  // Uses last image only for thumbnail to avoid loading all images
  // -------------------------------------------------------------------------

  private async loadSessions() {
    const countEl = document.getElementById('g-session-count')

    try {
      let sessions = await window.hellomyphoto.getRecentUploads(50) as QueuedSession[]
      
      const settings = await window.hellomyphoto.getSettings()
      if (settings.serverUrl && settings.otp) {
        try {
          const res = await fetch(`${normalizeUrl(settings.serverUrl)}/api/booth/sessions`, {
            headers: { 'x-booth-otp': settings.otp }
          })
          if (res.ok) {
            const data = await res.json()
            const serverSessions = data.sessions || []
            const localIds = new Set(sessions.map((s: any) => s.sessionId))
            
            for (const ss of serverSessions) {
              if (!localIds.has(ss.sessionId)) {
                const sUrl = normalizeUrl(settings.serverUrl)
                const remotePaths = []
                const remoteThumbPaths = []
                for (let i = 0; i < (ss.photoCount || 0); i++) {
                  remotePaths.push(`${sUrl}/api/share/${ss.shareId}/photo/${ss.sessionId}_${i + 1}.webp`)
                  remoteThumbPaths.push(`${sUrl}/api/share/${ss.shareId}/photo/${ss.sessionId}_${i + 1}_thumb.webp`)
                }

                sessions.push({
                  id: -1,
                  sessionId: ss.sessionId,
                  shareId: ss.shareId,
                  metadata: '{}',
                  imagePaths: JSON.stringify(remotePaths),
                  thumbPaths: JSON.stringify(remoteThumbPaths),
                  createdAt: ss.createdAt,
                  retryCount: 0,
                  status: 'completed',
                  sizeBytes: null,
                  avgSpeedKbps: null
                })
              }
            }
          }
        } catch (e) {
          console.warn('[Gallery] Failed to fetch server sessions', e)
        }
      }

      sessions.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      this.listGrid.innerHTML = ''

      if (sessions.length === 0) {
        if (countEl) countEl.textContent = '0 sessions'
        const empty = document.createElement('div')
        empty.style.cssText = `
          grid-column: 1 / -1; display: flex; flex-direction: column;
          align-items: flex-start; gap: 0.5rem;
          padding: 2rem 0; color: ${LABEL_COLOR}; font-size: 0.875rem;
        `
        empty.innerHTML = `
          <p style="margin:0;font-size:0.9375rem;font-weight:600;color:#555;">No sessions yet</p>
          <p style="margin:0;color:${LABEL_COLOR};">Photos will appear here after your first capture.</p>
        `
        this.listGrid.appendChild(empty)
        return
      }

      if (countEl) countEl.textContent = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`

      sessions.forEach((session, i) => {
        let paths: string[] = []
        try { paths = JSON.parse(session.imagePaths) } catch { /* ignore */ }
        
        let thumbPathsArray: string[] = []
        if (session.thumbPaths) {
          try { thumbPathsArray = JSON.parse(session.thumbPaths) } catch { /* ignore */ }
        }

        // Use the LAST image thumbnail, falling back to full image if thumbs aren't generated yet
        const displayThumbPath = thumbPathsArray.length > 0 ? thumbPathsArray[thumbPathsArray.length - 1] : (paths.length > 0 ? paths[paths.length - 1] : null)

        const card = this.buildCard(session, paths, displayThumbPath, i, thumbPathsArray)
        this.listGrid.appendChild(card)
      })

    } catch (e) {
      console.error('[Gallery] Failed to load sessions', e)
      this.listGrid.innerHTML = ''
      const err = document.createElement('div')
      err.style.cssText = `color: #ef4444; font-size: 0.875rem; padding: 1rem 0;`
      err.textContent = 'Failed to load sessions.'
      this.listGrid.appendChild(err)
    }
  }

  // -------------------------------------------------------------------------
  // Build session card (list view)
  // -------------------------------------------------------------------------

  private buildCard(
    session: QueuedSession,
    paths: string[],
    thumbPath: string | null,
    index: number,
    thumbPathsArray?: string[]
  ): HTMLDivElement {
    const card = document.createElement('div')
    card.className = 'g-card'
    card.style.animationDelay = `${Math.min(index * 30, 200)}ms`

    // --- Thumbnail (last image, no collage — fast) ---
    const thumb = document.createElement('div')
    thumb.style.cssText = `
      width: 100%; aspect-ratio: 3/2;
      background: #1a1a1a; overflow: hidden; position: relative;
    `

    if (thumbPath) {
      const img = document.createElement('img')
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;'
      img.loading = 'lazy'
      img.decoding = 'async'
      // Defer src assignment slightly so layout doesn't block
      requestAnimationFrame(() => { img.src = fileSrc(thumbPath) })
      img.onerror = () => { 
        if (session.shareId && paths.length > 0) {
          window.hellomyphoto.getSettings().then(settings => {
            const sUrl = normalizeUrl(settings.serverUrl || '')
            if (sUrl) {
              img.onerror = () => { img.style.display = 'none' }
              img.src = `${sUrl}/api/share/${session.shareId}/photo/${session.sessionId}_${paths.length}_thumb.webp`
            } else {
              img.style.display = 'none'
            }
          })
        } else {
          img.style.display = 'none'
        }
      }
      thumb.appendChild(img)
    } else {
      thumb.innerHTML = `
        <div style="width:100%;height:100%;display:flex;align-items:center;
          justify-content:center;color:#333;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
      `
    }

    // Photo count badge
    if (paths.length > 0) {
      const badge = document.createElement('div')
      badge.style.cssText = `
        position: absolute; bottom: 0.4rem; right: 0.4rem;
        background: rgba(0,0,0,0.6); border-radius: 100px;
        padding: 0.15rem 0.45rem;
        font-size: 0.68rem; font-weight: 600; color: #e0e0e0;
        letter-spacing: 0.02em; backdrop-filter: blur(4px);
      `
      badge.textContent = `${paths.length}`
      thumb.appendChild(badge)
    }

    card.appendChild(thumb)

    // --- Info section ---
    const info = document.createElement('div')
    info.style.cssText = 'padding: 0.75rem 0.875rem 0.875rem;'

    const { time, date } = formatDateParts(session.createdAt)

    const timeEl = document.createElement('div')
    timeEl.style.cssText = `
      font-size: 0.875rem; font-weight: 600; color: #e5e5e5; margin-bottom: 0.15rem;
    `
    timeEl.textContent = time

    const dateEl = document.createElement('div')
    dateEl.style.cssText = `
      font-size: 0.75rem; color: ${LABEL_COLOR}; margin-bottom: 0.625rem;
    `
    dateEl.textContent = date

    const { label, color, icon } = statusInfo(session.status)
    const pill = document.createElement('div')
    pill.className = 'g-status-pill'
    pill.style.cssText = `
      display: inline-flex; align-items: center; gap: 0.3rem;
      font-size: 0.7rem; font-weight: 600; letter-spacing: 0.03em;
      padding: 0.2rem 0.55rem; border-radius: 100px;
      color: ${color}; background: ${color}1a;
    `
    pill.innerHTML = `<span style="color:${color};display:flex;">${icon}</span>${label}`

    info.appendChild(timeEl)
    info.appendChild(dateEl)
    info.appendChild(pill)
    card.appendChild(info)

    card.addEventListener('click', () => this.showDetail(session, paths, thumbPathsArray))
    return card
  }

  // -------------------------------------------------------------------------
  // Detail page — full Settings-style layout
  // -------------------------------------------------------------------------

  private async showDetail(session: QueuedSession, paths: string[], thumbPathsArray?: string[]) {
    this.detailPage.innerHTML = ''
    this.detailPage.classList.add('g-visible')

    const panel = document.createElement('div')
    panel.className = 'g-panel'

    // --- Header ---
    const header = document.createElement('div')
    header.className = 'g-header'

    const backBtn = document.createElement('button')
    backBtn.className = 'g-back-btn'
    backBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    backBtn.addEventListener('click', () => this.detailPage.classList.remove('g-visible'))

    const { time, date } = formatDateParts(session.createdAt)
    const detailTitle = document.createElement('h2')
    detailTitle.className = 'g-title'
    detailTitle.textContent = `${time}, ${date}`

    header.appendChild(backBtn)
    header.appendChild(detailTitle)
    panel.appendChild(header)

    // --- Two-column layout ---
    const layout = document.createElement('div')
    layout.style.cssText = `
      display: grid; grid-template-columns: 1fr 280px; gap: 2rem; align-items: start;
    `

    // ---- Left: Photos ----
    const leftCol = document.createElement('div')

    const photosLabel = document.createElement('p')
    photosLabel.className = 'g-section-label'
    photosLabel.textContent = `Photos (${paths.length})`
    leftCol.appendChild(photosLabel)

    if (paths.length > 0) {
      const cols = paths.length > 1 ? 2 : 1;
      const photoCard = document.createElement('div')
      photoCard.style.cssText = `
        border: 1px solid ${BORDER}; border-radius: 8px;
        background: ${ROW_A}; padding: 1rem;
        display: grid; 
        grid-template-columns: repeat(${cols}, 1fr); 
        gap: 1rem;
      `

      paths.forEach((p, i) => {
        const wrap = document.createElement('div')
        wrap.style.cssText = `
          background: #1a1a1a; overflow: hidden;
          cursor: zoom-in; border-radius: 6px;
          transition: opacity 150ms;
          display: flex;
        `
        wrap.onmouseenter = () => { wrap.style.opacity = '0.85' }
        wrap.onmouseleave = () => { wrap.style.opacity = '1' }

        const img = document.createElement('img')
        img.alt = `Photo ${i + 1}`
        img.loading = 'lazy'
        img.decoding = 'async'
        img.style.cssText = `
          width: 100%; height: auto; object-fit: contain; display: block;
        `
        img.onerror = () => {
          if (session.shareId) {
            window.hellomyphoto.getSettings().then(settings => {
              const sUrl = normalizeUrl(settings.serverUrl || '')
              if (sUrl) {
                img.onerror = () => {
                  wrap.style.background = '#1f1f1f'
                  img.style.display = 'none'
                }
                img.src = `${sUrl}/api/share/${session.shareId}/photo/${session.sessionId}_${i + 1}_thumb.webp`
              } else {
                wrap.style.background = '#1f1f1f'
                img.style.display = 'none'
              }
            })
          } else {
            wrap.style.background = '#1f1f1f'
            img.style.display = 'none'
          }
        }

        const displayPath = thumbPathsArray && thumbPathsArray[i] ? thumbPathsArray[i] : p;
        requestAnimationFrame(() => { img.src = fileSrc(displayPath) })

        wrap.addEventListener('click', () => this.openLightbox(session, paths, i))
        wrap.appendChild(img)
        photoCard.appendChild(wrap)
      })

      leftCol.appendChild(photoCard)
    } else {
      const noPhotos = document.createElement('p')
      noPhotos.style.cssText = `color:${LABEL_COLOR};font-size:0.875rem;margin:0;`
      noPhotos.textContent = 'No photos available.'
      leftCol.appendChild(noPhotos)
    }

    layout.appendChild(leftCol)

    // ---- Right: QR + Metadata ----
    const rightCol = document.createElement('div')
    rightCol.style.cssText = 'display: flex; flex-direction: column; gap: 1.5rem;'

    // QR section
    const qrLabel = document.createElement('p')
    qrLabel.className = 'g-section-label'
    qrLabel.textContent = 'Share Link'
    rightCol.appendChild(qrLabel)

    if (session.shareId) {
      const qrBox = document.createElement('div')
      qrBox.style.cssText = `
        border: 1px solid ${BORDER}; border-radius: 8px; overflow: hidden;
      `

      try {
        const serverConfig = await window.hellomyphoto.getServerConfig()
        const serverUrl = normalizeUrl(serverConfig?.serverUrl || '')
        const shareUrl = `${serverUrl}/share/${session.shareId}`

        const qrDataUrl = await QRCode.toDataURL(shareUrl, {
          width: 240,
          margin: 1,
          color: { dark: '#0a0a0a', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        })

        const qrWrap = document.createElement('div')
        qrWrap.style.cssText = `
          background: #fff; padding: 1rem;
          display: flex; align-items: center; justify-content: center;
        `
        const qrImg = document.createElement('img')
        qrImg.src = qrDataUrl
        qrImg.style.cssText = 'width: 100%; max-width: 240px; height: auto; display: block;'
        qrWrap.appendChild(qrImg)
        qrBox.appendChild(qrWrap)

        const scanRow = document.createElement('div')
        scanRow.style.cssText = `
          padding: 0.625rem 1rem; background: ${ROW_A};
          border-top: 1px solid ${BORDER};
          font-size: 0.75rem; color: ${LABEL_COLOR}; text-align: center;
          word-break: break-all; line-height: 1.4;
        `
        scanRow.textContent = shareUrl
        qrBox.appendChild(scanRow)
      } catch (e) {
        console.error('[Gallery] QR error', e)
        const errRow = document.createElement('div')
        errRow.style.cssText = `padding: 1rem; color: #ef4444; font-size: 0.8rem;`
        errRow.textContent = 'Could not generate QR code.'
        qrBox.appendChild(errRow)
      }

      rightCol.appendChild(qrBox)
    } else {
      // Pending / failed / uploading placeholder
      const { color, icon } = statusInfo(session.status)
      const placeholder = document.createElement('div')
      placeholder.style.cssText = `
        border: 1px solid ${BORDER}; border-radius: 8px;
        padding: 1.5rem 1rem; background: ${ROW_A};
        display: flex; flex-direction: column; align-items: center;
        gap: 0.75rem; text-align: center; width: 100%; box-sizing: border-box;
      `
      
      const iconWrap = document.createElement('span')
      iconWrap.style.cssText = `color:${color};display:flex;`
      iconWrap.innerHTML = icon.replace('width="12"', 'width="28"').replace('height="12"', 'height="28"')
      
      const msg = document.createElement('p')
      msg.style.cssText = `margin:0;font-size:0.8rem;color:${LABEL_COLOR};line-height:1.5;`
      msg.textContent = session.status === 'failed' 
        ? 'Upload failed and no share link is available.'
        : 'No share link is available.'

      // Progress bar container
      const progContainer = document.createElement('div')
      progContainer.style.cssText = 'width: 100%; display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem;'
      
      const progBarBg = document.createElement('div')
      progBarBg.style.cssText = 'width: 100%; background: #333; border-radius: 4px; height: 6px; overflow: hidden;'
      
      const progFill = document.createElement('div')
      const progData = Gallery.progressMap[session.sessionId] || { percent: 0, speed: '--' }
      progFill.style.cssText = `width: ${progData.percent}%; background: ${session.status === 'failed' ? '#ef4444' : '#fbbf24'}; height: 100%; transition: width 0.3s ease;`
      progBarBg.appendChild(progFill)
      
      const progText = document.createElement('div')
      progText.style.cssText = 'font-size: 0.7rem; color: #888; display: flex; justify-content: space-between;'
      progText.innerHTML = `<span>${progData.percent}%</span><span>${progData.speed || '--'}</span>`
      
      progContainer.appendChild(progBarBg)
      progContainer.appendChild(progText)

      placeholder.appendChild(iconWrap)
      placeholder.appendChild(msg)
      
      if (session.status === 'uploading' || session.status === 'pending') {
        placeholder.appendChild(progContainer)
      }

      rightCol.appendChild(placeholder)

      // Listen for updates
      const onProg = (e: Event) => {
        const data = (e as CustomEvent).detail
        if (data.sessionId === session.sessionId) {
          progFill.style.width = `${data.percent}%`
          progText.innerHTML = `<span>${data.percent}%</span><span>${data.speed || '--'}</span>`
        }
      }
      window.addEventListener('gallery-progress', onProg)
      // Clean up listener when detail page hides
      const observer = new MutationObserver(() => {
        if (!this.detailPage.classList.contains('g-visible')) {
          window.removeEventListener('gallery-progress', onProg)
          observer.disconnect()
        }
      })
      observer.observe(this.detailPage, { attributes: true, attributeFilter: ['class'] })
    }

    // Metadata section
    const metaLabel = document.createElement('p')
    metaLabel.className = 'g-section-label'
    metaLabel.textContent = 'Details'
    rightCol.appendChild(metaLabel)

    const metaBox = document.createElement('div')
    metaBox.style.cssText = `border: 1px solid ${BORDER}; border-radius: 8px; overflow: hidden;`

    const metaRows: [string, string][] = [
      ['Time', time],
      ['Date', date],
      ['Photos', `${paths.length}`],
      ['Session', `#${session.sessionId.slice(-8).toUpperCase()}`],
      ['Status', statusInfo(session.status).label],
    ]
    if (session.sizeBytes && session.sizeBytes > 0) {
      metaRows.push(['Upload size', `${(session.sizeBytes / 1024 / 1024).toFixed(1)} MB`])
    }

    metaRows.forEach(([k, v], i) => {
      const row = document.createElement('div')
      row.className = 'g-meta-row'
      row.style.background = i % 2 === 0 ? ROW_A : ROW_B
      const lbl = document.createElement('span')
      lbl.className = 'g-meta-label'
      lbl.textContent = k
      const val = document.createElement('span')
      val.className = 'g-meta-value'
      val.textContent = v
      row.appendChild(lbl)
      row.appendChild(val)
      metaBox.appendChild(row)
    })

    rightCol.appendChild(metaBox)

    // Actions section
    const actionsLabel = document.createElement('p')
    actionsLabel.className = 'g-section-label'
    actionsLabel.textContent = 'Actions'
    actionsLabel.style.marginTop = '0.5rem'
    rightCol.appendChild(actionsLabel)

    const actionsBox = document.createElement('div')
    actionsBox.style.cssText = `display: flex; flex-direction: column; gap: 0.5rem;`

    const createBtn = (text: string, onClick: () => void, primary = false) => {
      const btn = document.createElement('button')
      btn.textContent = text
      btn.style.cssText = `
        padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid ${primary ? 'transparent' : BORDER};
        background: ${primary ? '#fff' : ROW_A}; color: ${primary ? '#000' : '#e5e5e5'};
        font-size: 0.875rem; font-weight: 600; cursor: pointer;
        transition: all 150ms; width: 100%; text-align: center;
      `
      btn.onmouseenter = () => { btn.style.background = primary ? '#e5e5e5' : '#222' }
      btn.onmouseleave = () => { btn.style.background = primary ? '#fff' : ROW_A }
      btn.onclick = onClick
      return btn
    }

    const refreshDetail = async () => {
      await this.loadSessions()
      const sessions = await window.hellomyphoto.getRecentUploads(50) as QueuedSession[]
      const newSession = sessions.find((s) => s.id === session.id)
      if (newSession) {
        this.showDetail(newSession, paths)
      } else {
        this.detailPage.classList.remove('g-visible')
      }
    }


    const refetchBtn = createBtn('Refetch Link', async () => {
      try {
        refetchBtn.textContent = 'Refetching...'
        const serverConfig = await window.hellomyphoto.getServerConfig()
        const settings = await window.hellomyphoto.getSettings()
        const serverUrl = normalizeUrl(serverConfig?.serverUrl || '')
        const res = await fetch(`${serverUrl}/api/booth/session/reserve`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(settings.otp ? { 'X-Booth-OTP': settings.otp } : {})
          },
          body: JSON.stringify({ sessionId: session.sessionId }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.shareId) {
            await window.hellomyphoto.updateShareId(session.id, data.shareId)
            refreshDetail()
          }
        } else {
          refetchBtn.textContent = 'Failed'
          setTimeout(() => { refetchBtn.textContent = 'Refetch Link' }, 2000)
        }
      } catch (e) {
        console.error('Failed to refetch link', e)
        refetchBtn.textContent = 'Error'
        setTimeout(() => { refetchBtn.textContent = 'Refetch Link' }, 2000)
      }
    }, session.status === 'completed' && !session.shareId)
    actionsBox.appendChild(refetchBtn)

    if (session.status === 'completed') {
      actionsBox.appendChild(createBtn('Delete & Reupload', async () => {
        if (confirm('Are you sure you want to reupload this session?')) {
          await window.hellomyphoto.retryUploadJob(session.id)
          refreshDetail()
        }
      }))
    } else if (session.status === 'pending' || session.status === 'failed') {
      actionsBox.appendChild(createBtn('Start Upload', async () => {
        await window.hellomyphoto.retryUploadJob(session.id)
        refreshDetail()
      }, true))
      actionsBox.appendChild(createBtn('Delete Upload', async () => {
        if (confirm('Are you sure you want to delete this pending upload?')) {
          await window.hellomyphoto.removeUploadJob(session.id)
          refreshDetail()
        }
      }))
    } else if (session.status === 'uploading') {
      actionsBox.appendChild(createBtn('Stop Upload', async () => {
        await window.hellomyphoto.cancelUploadJob(session.id)
        refreshDetail()
      }))
    }

    rightCol.appendChild(actionsBox)
    layout.appendChild(rightCol)
    panel.appendChild(layout)
    this.detailPage.appendChild(panel)
  }

  // -------------------------------------------------------------------------
  // Lightbox — Settings-style full overlay
  // -------------------------------------------------------------------------

  private openLightbox(session: QueuedSession, paths: string[], startIndex: number) {
    let current = startIndex

    const lb = document.createElement('div')
    lb.style.cssText = `
      position: fixed; inset: 0; z-index: 200;
      background: ${BG};
      display: flex; flex-direction: column; overflow: hidden;
    `

    // Header
    const lbHeader = document.createElement('div')
    lbHeader.className = 'g-header'
    lbHeader.style.cssText = `
      display: flex; align-items: center; gap: 0.75rem;
      padding: 1.5rem 2rem 1rem; flex-shrink: 0;
    `

    const lbBackBtn = document.createElement('button')
    lbBackBtn.className = 'g-back-btn'
    lbBackBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    lbBackBtn.addEventListener('click', () => lb.remove())

    const lbCounter = document.createElement('h2')
    lbCounter.className = 'g-title'
    lbCounter.style.fontSize = '1rem'

    lbHeader.appendChild(lbBackBtn)
    lbHeader.appendChild(lbCounter)

    // Nav buttons
    const makeNavBtn = (dir: -1 | 1) => {
      const btn = document.createElement('button')
      btn.style.cssText = `
        background: none; border: 1px solid ${BORDER}; color: ${LABEL_COLOR};
        border-radius: 8px; padding: 0.4rem 0.75rem; cursor: pointer;
        display: flex; align-items: center; font-size: 0.8rem;
        transition: color 150ms, border-color 150ms;
      `
      btn.innerHTML = dir === -1
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
      btn.onmouseenter = () => { btn.style.color = '#fff'; btn.style.borderColor = '#555' }
      btn.onmouseleave = () => { btn.style.color = LABEL_COLOR; btn.style.borderColor = BORDER }
      btn.addEventListener('click', () => { current = (current + dir + paths.length) % paths.length; update() })
      if (paths.length <= 1) btn.style.visibility = 'hidden'
      return btn
    }

    const navGroup = document.createElement('div')
    navGroup.style.cssText = 'display: flex; gap: 0.5rem; margin-left: auto;'
    navGroup.appendChild(makeNavBtn(-1))
    navGroup.appendChild(makeNavBtn(1))
    lbHeader.appendChild(navGroup)
    lb.appendChild(lbHeader)

    // Image area
    const imgArea = document.createElement('div')
    imgArea.style.cssText = `
      flex: 1; display: flex; align-items: center; justify-content: center;
      padding: 0 2rem 2rem; overflow: hidden; min-height: 0;
    `

    const img = document.createElement('img')
    img.style.cssText = `
      max-width: 100%; max-height: 100%;
      object-fit: contain; border-radius: 4px;
    `
    imgArea.appendChild(img)
    lb.appendChild(imgArea)

    const update = () => {
      img.onerror = () => {
        if (session.shareId) {
          window.hellomyphoto.getSettings().then(settings => {
            const sUrl = normalizeUrl(settings.serverUrl || '')
            if (sUrl) {
              img.onerror = () => { img.style.display = 'none' }
              img.src = `${sUrl}/api/share/${session.shareId}/photo/${session.sessionId}_${current + 1}.webp`
              img.style.display = 'block'
            }
          })
        }
      }
      img.style.display = 'block'
      img.src = fileSrc(paths[current])
      lbCounter.textContent = `Photo ${current + 1} of ${paths.length}`
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey) }
      if (e.key === 'ArrowLeft') { current = (current - 1 + paths.length) % paths.length; update() }
      if (e.key === 'ArrowRight') { current = (current + 1) % paths.length; update() }
    }
    document.addEventListener('keydown', onKey)

    update()
    document.body.appendChild(lb)
  }
}
