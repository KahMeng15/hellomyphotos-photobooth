import QRCode from 'qrcode'
import { createButton } from '../utils/UIKit.js'

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
const BG          = 'var(--color-bg)'
const ROW_A       = 'var(--color-surface-alt)'
const ROW_B       = 'var(--color-surface)'
const BORDER      = 'var(--color-border)'
const LABEL_COLOR = 'var(--color-text-sub)'
const TEXT_COLOR  = 'var(--color-text-sub)'

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
        color: 'var(--color-success)',
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      }
    case 'uploading':
      return {
        label: 'Uploading',
        color: 'var(--color-warning)',
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
      }
    case 'failed':
      return {
        label: 'Failed',
        color: 'var(--color-error)',
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
    this.listPage.className = 'g-page g-page-list'

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
    this.listGrid.className = 'g-list-grid'
    listPanel.appendChild(this.listGrid)

    this.listPage.appendChild(listPanel)

    // ---- Detail page ----
    this.detailPage = document.createElement('div')
    this.detailPage.className = 'g-page g-page-detail'

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
                  remotePaths.push(`${sUrl}/api/share/${ss.shareId}/photo/${ss.sessionId}_${i + 1}.webp?otp=${settings.otp || ''}`)
                  remoteThumbPaths.push(`${sUrl}/api/share/${ss.shareId}/photo/${ss.sessionId}_${i + 1}_thumb.webp?otp=${settings.otp || ''}`)
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
        empty.className = 'g-empty-state'
        empty.innerHTML = `
          <p class="g-empty-title">No sessions yet</p>
          <p class="g-empty-desc">Photos will appear here after your first capture.</p>
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
      err.className = 'g-error-state'
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
    thumb.className = 'g-card-thumb'

    if (thumbPath) {
      const img = document.createElement('img')
      img.className = 'g-card-thumb-img'
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
              img.src = `${sUrl}/api/share/${session.shareId}/photo/${session.sessionId}_${paths.length}_thumb.webp?otp=${settings.otp || ''}`
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
        <div class="g-card-thumb-empty">
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
      badge.className = 'g-card-badge'
      badge.textContent = `${paths.length}`
      thumb.appendChild(badge)
    }

    card.appendChild(thumb)

    // --- Info section ---
    const info = document.createElement('div')
    info.className = 'g-card-info'

    const { time, date } = formatDateParts(session.createdAt)

    const timeEl = document.createElement('div')
    timeEl.className = 'g-card-time'
    timeEl.textContent = time

    const dateEl = document.createElement('div')
    dateEl.className = 'g-card-date'
    dateEl.textContent = date

    const { label, color, icon } = statusInfo(session.status)
    const pill = document.createElement('div')
    pill.className = 'g-status-pill'
    pill.style.color = color; pill.style.background = `${color}1a`;
    pill.innerHTML = `<span class="g-status-icon-wrap" style="color:${color};">${icon}</span>${label}`

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
    layout.className = 'g-detail-layout'

    // ---- Left: Photos ----
    const leftCol = document.createElement('div')

    const photosLabel = document.createElement('p')
    photosLabel.className = 'g-section-label'
    photosLabel.textContent = `Photos (${paths.length})`
    leftCol.appendChild(photosLabel)

    if (paths.length > 0) {
      const cols = paths.length > 1 ? 2 : 1;
      const photoCard = document.createElement('div')
      photoCard.className = 'g-photo-card';
      photoCard.dataset.cols = cols.toString()

      paths.forEach((p, i) => {
        const wrap = document.createElement('div')
        wrap.className = 'g-photo-wrap'
        wrap.onmouseenter = () => { wrap.style.opacity = '0.85' }
        wrap.onmouseleave = () => { wrap.style.opacity = '1' }

        const img = document.createElement('img')
        img.alt = `Photo ${i + 1}`
        img.loading = 'lazy'
        img.decoding = 'async'
        img.className = 'g-photo-img'
        img.onerror = () => {
          if (session.shareId) {
            window.hellomyphoto.getSettings().then(settings => {
              const sUrl = normalizeUrl(settings.serverUrl || '')
              if (sUrl) {
                img.onerror = () => {
                  wrap.style.background = '#1f1f1f'
                  img.style.display = 'none'
                }
                img.src = `${sUrl}/api/share/${session.shareId}/photo/${session.sessionId}_${i + 1}_thumb.webp?otp=${settings.otp || ''}`
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
      noPhotos.className = 'g-no-photos'
      noPhotos.textContent = 'No photos available.'
      leftCol.appendChild(noPhotos)
    }

    layout.appendChild(leftCol)

    // ---- Right: QR + Metadata ----
    const rightCol = document.createElement('div')
    rightCol.className = 'g-right-col'

    // QR section
    const qrLabel = document.createElement('p')
    qrLabel.className = 'g-section-label'
    qrLabel.textContent = 'Share Link'
    rightCol.appendChild(qrLabel)

    if (session.shareId) {
      const qrBox = document.createElement('div')
      qrBox.className = 'g-qr-box'

      try {
        const serverConfig = await window.hellomyphoto.getServerConfig()
        const serverUrl = normalizeUrl(serverConfig?.serverUrl || '')
        const shareUrl = `${serverUrl}/share/${session.shareId}`

        const qrDataUrl = await QRCode.toDataURL(shareUrl, {
          width: 240,
          margin: 1,
          color: { dark: '#0a0a0a', light: 'var(--color-text)fff' },
          errorCorrectionLevel: 'M',
        })

        const qrWrap = document.createElement('div')
        qrWrap.className = 'g-qr-wrap'
        const qrImg = document.createElement('img')
        qrImg.src = qrDataUrl
        qrImg.className = 'g-qr-img'
        qrWrap.appendChild(qrImg)
        qrBox.appendChild(qrWrap)

        const scanRow = document.createElement('div')
        scanRow.className = 'g-qr-scan-row'
        scanRow.textContent = shareUrl
        qrBox.appendChild(scanRow)
      } catch (e) {
        console.error('[Gallery] QR error', e)
        const errRow = document.createElement('div')
        errRow.className = 'g-qr-error'
        errRow.textContent = 'Could not generate QR code.'
        qrBox.appendChild(errRow)
      }

      rightCol.appendChild(qrBox)
    } else {
      // Pending / failed / uploading placeholder
      const { color, icon } = statusInfo(session.status)
      const placeholder = document.createElement('div')
      placeholder.className = 'g-placeholder-box'
      
      const iconWrap = document.createElement('span')
      iconWrap.className = 'g-status-icon-wrap'; iconWrap.style.color = color
      iconWrap.innerHTML = icon.replace('width="12"', 'width="28"').replace('height="12"', 'height="28"')
      
      const msg = document.createElement('p')
      msg.className = 'g-placeholder-msg'
      msg.textContent = session.status === 'failed' 
        ? 'Upload failed and no share link is available.'
        : 'No share link is available.'

      // Progress bar container
      const progContainer = document.createElement('div')
      progContainer.className = 'g-prog-container'
      
      const progBarBg = document.createElement('div')
      progBarBg.className = 'g-prog-bar-bg'
      
      const progFill = document.createElement('div')
      const progData = Gallery.progressMap[session.sessionId] || { percent: 0, speed: '--' }
      progFill.className = 'g-prog-fill';
      progFill.style.width = `${progData.percent}%`;
      progFill.style.background = session.status === 'failed' ? 'var(--color-error)' : 'var(--color-warning)'
      progBarBg.appendChild(progFill)
      
      const progText = document.createElement('div')
      progText.className = 'g-prog-text'
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
    metaBox.className = 'g-meta-box'

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
    actionsLabel.className = 'g-section-label g-actions-label'
    rightCol.appendChild(actionsLabel)

    const actionsBox = document.createElement('div')
    actionsBox.className = 'g-actions-box'

    const createBtn = (text: string, onClick: () => void, primary = false) => {
      return createButton(text, { variant: primary ? 'primary' : 'secondary', onClick })
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
    lb.className = 'g-lightbox'

    // Header
    const lbHeader = document.createElement('div')
    lbHeader.className = 'g-header'
    lbHeader.className = 'g-header g-lightbox-header'

    const lbBackBtn = document.createElement('button')
    lbBackBtn.className = 'g-back-btn'
    lbBackBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`
    lbBackBtn.addEventListener('click', () => lb.remove())

    const lbCounter = document.createElement('h2')
    lbCounter.className = 'g-title'
    lbCounter.className = 'g-title g-lightbox-counter'

    lbHeader.appendChild(lbBackBtn)
    lbHeader.appendChild(lbCounter)

    // Nav buttons
    const makeNavBtn = (dir: -1 | 1) => {
      const btn = document.createElement('button')
      btn.className = 'g-nav-btn'
      btn.innerHTML = dir === -1
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
      
      btn.addEventListener('click', () => { current = (current + dir + paths.length) % paths.length; update() })
      if (paths.length <= 1) btn.style.visibility = 'hidden'
      return btn
    }

    const navGroup = document.createElement('div')
    navGroup.className = 'g-nav-group'
    navGroup.appendChild(makeNavBtn(-1))
    navGroup.appendChild(makeNavBtn(1))
    lbHeader.appendChild(navGroup)
    lb.appendChild(lbHeader)

    // Image area
    const imgArea = document.createElement('div')
    imgArea.className = 'g-img-area'

    const img = document.createElement('img')
    img.className = 'g-photo-img'
    imgArea.appendChild(img)
    lb.appendChild(imgArea)

    const update = () => {
      img.onerror = () => {
        if (session.shareId) {
          window.hellomyphoto.getSettings().then(settings => {
            const sUrl = normalizeUrl(settings.serverUrl || '')
            if (sUrl) {
              img.onerror = () => { img.style.display = 'none' }
              img.src = `${sUrl}/api/share/${session.shareId}/photo/${session.sessionId}_${current + 1}.webp?otp=${settings.otp || ''}`
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
