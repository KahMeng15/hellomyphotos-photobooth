<template>
  <div class="share-page">
    <!-- Initial loading -->
    <div v-if="initialLoading" class="state-screen">
      <div class="spinner"></div>
      <p class="state-label">Loading…</p>
    </div>

    <!-- Uploading / reserved -->
    <div v-else-if="uploadStatus === 'uploading' || uploadStatus === 'reserved'" class="state-screen uploading">
      <div class="upload-anim">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 16 12 12 8 16"/>
          <line x1="12" y1="12" x2="12" y2="21"/>
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
        </svg>
      </div>
      <h2>Your photos are on their way…</h2>
      <p class="upload-sub">We're uploading your photos right now.<br>This page will update automatically.</p>
      <p v-if="elapsedDisplay" class="upload-elapsed">{{ elapsedDisplay }}</p>
      <div class="dots"><span/><span/><span/></div>
    </div>

    <!-- Upload failed -->
    <div v-else-if="uploadStatus === 'failed'" class="state-screen error">
      <div class="err-icon">⚠</div>
      <h2>Upload Failed</h2>
      <p>Something went wrong uploading your photos.<br>Please ask the event organiser to retry.</p>
    </div>

    <!-- Link error -->
    <div v-else-if="error" class="state-screen error">
      <div class="err-icon">✕</div>
      <h2>{{ error === 'expired' ? 'Link Expired' : 'Link not found' }}</h2>
      <p>{{ error === 'expired' ? 'This photo link has expired.' : 'This share link is invalid or has been removed.' }}</p>
    </div>

    <!-- Photos ready -->
    <div v-else class="content">
      <header class="share-header">
        <h1 class="brand">hellomyphoto</h1>
        <div v-if="organizer" class="org-info">{{ organizer }}<span v-if="contactInfo"> · {{ contactInfo }}</span></div>
      </header>

      <main>
        <h2 class="greeting">Hello there! Here are your photos!</h2>
        <div class="photo-grid" :class="`cols-${Math.min(photos.length, 2)}`">
          <div v-for="(photo, i) in photos" :key="i" class="photo-item" @click="openLightbox(i)">
            <img :src="baseUrl + (photo.thumbnail || photo.url)" :alt="`Photo ${i+1}`" loading="lazy" />
          </div>
        </div>
        <div class="actions">
          <button class="dl-btn" @click="downloadAll">↓ Download All</button>
        </div>
      </main>

      <Teleport to="body">
        <div v-if="lightboxIdx !== null" class="lightbox" @click.self="closeLightbox">
          <button class="lb-close" @click="closeLightbox">✕</button>
          <button v-if="lightboxIdx > 0" class="lb-prev" @click="lightboxIdx--">‹</button>
          <img :src="baseUrl + photos[lightboxIdx].url" class="lb-img" />
          <button v-if="lightboxIdx < photos.length - 1" class="lb-next" @click="lightboxIdx++">›</button>
          <a :href="baseUrl + (photos[lightboxIdx].downloadUrl || photos[lightboxIdx].url)"
             :download="`photo_${lightboxIdx + 1}`"
             class="lb-dl">↓ Download</a>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const token = route.params.token as string

const initialLoading = ref(true)
const uploadStatus = ref<string | null>(null)
const error = ref<string | null>(null)
const photos = ref<any[]>([])
const organizer = ref('')
const contactInfo = ref('')
const lightboxIdx = ref<number | null>(null)
const uploadStartedAt = ref<number | null>(null)
const elapsedDisplay = ref('')

let pollTimer: ReturnType<typeof setInterval> | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `Started ${s}s ago`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `Started ${m}m ${r > 0 ? r + 's' : ''} ago`
}

function startElapsedTick() {
  if (elapsedTimer) return
  elapsedTimer = setInterval(() => {
    if (uploadStartedAt.value) elapsedDisplay.value = fmt(Date.now() - uploadStartedAt.value)
  }, 1000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
}

async function loadPhotos() {
  const res = await fetch(`${baseUrl}/api/share/${token}`)
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    error.value = d.expired ? 'expired' : 'not_found'
    return
  }
  const d = await res.json()
  if (d.expired) { error.value = 'expired'; return }
  photos.value = d.photos || []
  organizer.value = d.organizer || ''
  contactInfo.value = d.contactInfo || ''
  uploadStatus.value = 'complete'
}

async function checkStatus() {
  try {
    const res = await fetch(`${baseUrl}/api/share/${token}/status`)
    if (res.status === 404) { error.value = 'not_found'; stopPolling(); return }
    if (!res.ok) return
    const d = await res.json()
    uploadStatus.value = d.status
    if (d.uploadStartedAt && !uploadStartedAt.value) {
      uploadStartedAt.value = d.uploadStartedAt
      startElapsedTick()
    }
    if (d.status === 'complete') {
      stopPolling()
      await loadPhotos()
    } else if (d.status === 'failed') {
      stopPolling()
    }
  } catch { /* keep polling on network error */ }
}

onMounted(async () => {
  await checkStatus()
  initialLoading.value = false
  if (uploadStatus.value === 'uploading' || uploadStatus.value === 'reserved') {
    pollTimer = setInterval(checkStatus, 3000)
  }
})

onUnmounted(stopPolling)

function openLightbox(i: number) { lightboxIdx.value = i }
function closeLightbox() { lightboxIdx.value = null }

async function downloadAll() {
  for (const p of photos.value) {
    const a = document.createElement('a')
    a.href = p.downloadUrl || p.url
    a.download = (p.downloadUrl || p.url).split('/').pop() || 'photo.jpg'
    a.click()
    await new Promise(r => setTimeout(r, 350))
  }
}
</script>

<style scoped>
.share-page {
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ---- State screens ---- */
.state-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 1.25rem;
  padding: 2rem;
  text-align: center;
}

.spinner {
  width: 44px; height: 44px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.state-label { color: #555; font-size: 0.9rem; }

/* Upload animation */
.upload-anim {
  width: 72px; height: 72px;
  background: rgba(255,255,255,0.05);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  animation: pulse 2s ease-in-out infinite;
}
.upload-anim svg { width: 36px; height: 36px; color: rgba(255,255,255,0.8); }
.uploading h2 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.upload-sub { color: #666; line-height: 1.6; margin: 0; }
.upload-elapsed { color: #444; font-size: 0.8rem; margin: 0; }

.dots { display: flex; gap: 6px; margin-top: 4px; }
.dots span {
  width: 7px; height: 7px; border-radius: 50%;
  background: #333;
  animation: dot 1.4s ease-in-out infinite;
}
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }

/* Error */
.error .err-icon { font-size: 2.5rem; opacity: 0.4; }
.error h2 { font-size: 1.4rem; font-weight: 700; margin: 0; }
.error p { color: #666; margin: 0; }

/* ---- Content ---- */
.content {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 5rem;
}

.share-header {
  padding: 1.5rem 0 1.25rem;
  border-bottom: 1px solid #1a1a1a;
  margin-bottom: 2rem;
}
.brand { font-size: 1.1rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 0.2rem; }
.org-info { color: #555; font-size: 0.8rem; }

.greeting { font-size: 1.4rem; font-weight: 700; margin-bottom: 1.5rem; }

.photo-grid {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 2rem;
}
.photo-grid.cols-1 { grid-template-columns: 1fr; }
.photo-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }

.photo-item {
  border-radius: 10px; overflow: hidden;
  aspect-ratio: 4/3; background: #1a1a1a;
  cursor: pointer;
}
.photo-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
.photo-item:hover img { transform: scale(1.03); }

.actions { display: flex; justify-content: center; }
.dl-btn {
  padding: 0.875rem 2.5rem; background: #fff; color: #000;
  border: none; border-radius: 100px; font-weight: 600; font-size: 1rem;
  cursor: pointer; transition: opacity 0.2s;
}
.dl-btn:hover { opacity: 0.85; }

/* ---- Lightbox ---- */
.lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.92);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.lb-img { max-width: 90vw; max-height: 85vh; object-fit: contain; border-radius: 8px; }
.lb-close {
  position: fixed; top: 1.25rem; right: 1.25rem;
  background: rgba(255,255,255,0.1); border: none; color: #fff;
  width: 40px; height: 40px; border-radius: 50%; font-size: 1.1rem; cursor: pointer;
}
.lb-prev, .lb-next {
  position: fixed; top: 50%; transform: translateY(-50%);
  background: rgba(255,255,255,0.1); border: none; color: #fff;
  width: 44px; height: 44px; border-radius: 50%; font-size: 1.6rem; cursor: pointer;
}
.lb-prev { left: 1.25rem; }
.lb-next { right: 1.25rem; }
.lb-dl {
  position: fixed; bottom: 1.75rem; left: 50%; transform: translateX(-50%);
  background: rgba(255,255,255,0.12); color: #fff;
  padding: 0.5rem 1.5rem; border-radius: 100px;
  text-decoration: none; font-size: 0.875rem; font-weight: 600;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.65; transform: scale(0.93); }
}
@keyframes dot {
  0%, 80%, 100% { transform: scale(0.7); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}

@media (max-width: 580px) {
  .photo-grid.cols-2 { grid-template-columns: 1fr; }
  .content { padding: 1rem 0.875rem 4rem; }
}
</style>
