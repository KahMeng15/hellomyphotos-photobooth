<template>
  <div class="share-page">
    <div v-if="loading" class="share-content skeleton-loader">
      <header class="share-header skeleton-pulse" style="height: 60px; max-width: 300px; margin: 0 auto 2rem; border-radius: var(--radius-md);"></header>
      <div class="photo-grid">
        <div v-for="i in 3" :key="i" class="photo-card skeleton-pulse" style="aspect-ratio: 2/3;"></div>
      </div>
    </div>

    <div v-else-if="error" class="error">
      <h2>Link not found</h2>
      <p>This share link is invalid or could not be found.</p>
    </div>

    <div v-else-if="expired" class="error expired-msg">
      <h2>Link Expired</h2>
      <p>This share link has expired and is no longer accessible.</p>
    </div>

    <template v-else-if="session">
      <div class="share-content">
        <header class="share-header">
          <h1>Hello there! Here are your photos!</h1>
          <p class="subtitle">
            {{ session.eventName || 'hellomyphotos' }}<template v-if="session.organizer"><br/>
              <a v-if="session.contactInfo" href="#" @click.prevent="showContactModal = true" class="contact-link">{{ session.organizer }}</a>
              <span v-else>{{ session.organizer }}</span>
            </template>
          </p>
        </header>

        <div v-if="animationPhotos.length >= 2" class="hero-preview">
          <img :src="baseUrl + (animationPhotos[heroIndex]?.thumbnail || animationPhotos[heroIndex]?.url)" alt="Preview animation" />
        </div>

        <div class="photo-grid">
          <div v-for="(photo, i) in session.photos" :key="photo.id" class="photo-card">
            <div class="card-img-wrap">
              <div class="blur-bg" :style="{ backgroundImage: `url(${baseUrl + (photo.thumbnail || photo.url)})` }"></div>
              <img :src="baseUrl + (photo.thumbnail || photo.url)" :alt="'Photo'" loading="lazy" class="share-img" @load="$event.target.classList.add('loaded')" @click="openPhoto(i)" />
            </div>
            <a :href="getDownloadUrl(photo)" class="download-btn" download>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download JPEG
            </a>
          </div>
        </div>

        <div class="actions-wrapper">
          <button @click="downloadAll" class="btn-download-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download All
          </button>
          <p v-if="expiryText" class="expiry-text">{{ expiryText }}</p>
        </div>
      </div>

      <footer class="share-footer">
        <p>
          Photos taken with <a href="https://hellomyphotos.vercel.app" target="_blank" rel="noopener noreferrer">hellomyphotos</a>, an app project by <a href="https://kahmeng15.github.io" target="_blank" rel="noopener noreferrer">kahmeng</a>.<br/>
          Learn more about this app at <a href="https://hellomyphotos.vercel.app" target="_blank" rel="noopener noreferrer">hellomyphotos.vercel.app</a>.<br/>
          Have some feedback? Submit it <a href="https://kahmeng15.github.io/feedback/" target="_blank" rel="noopener noreferrer">here</a>.
        </p>
      </footer>

      <div v-if="selectedPhotoIndex !== null" class="lightbox" @click.self="selectedPhotoIndex = null" @mousemove="resetControlsTimeout" @touchstart="resetControlsTimeout" @click="resetControlsTimeout">
        <button class="lightbox-close" :class="{ 'hidden-control': !showControls }" @click="selectedPhotoIndex = null">✕</button>
        
        <button v-if="selectedPhotoIndex > 0" class="lightbox-nav-btn lightbox-prev" :class="{ 'hidden-control': !showControls }" @click.stop="prevPhoto(); resetControlsTimeout()">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <div class="lightbox-img-wrap">
          <div class="blur-bg" v-if="lightboxThumb" :style="{ backgroundImage: `url(${lightboxThumb})` }"></div>
          <img
            v-if="lightboxThumb"
            :src="lightboxThumb"
            class="lightbox-thumb"
            :class="{ 'thumb-hidden': lightboxLoaded }"
            aria-hidden="true"
          />
          <img
            :src="lightboxFullSrc"
            class="lightbox-img"
            :class="{ 'lb-loaded': lightboxLoaded }"
            alt="Photo"
            @load="onLightboxLoad"
          />
        </div>

        <button v-if="selectedPhotoIndex < session.photos.length - 1" class="lightbox-nav-btn lightbox-next" :class="{ 'hidden-control': !showControls }" @click.stop="nextPhoto(); resetControlsTimeout()">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    </template>
    <Teleport to="body">
      <div v-if="showContactModal" class="modal-overlay" @click.self="showContactModal = false">
        <div class="modal-page">
          <div class="modal-header">
            <button class="back-btn" @click="showContactModal = false"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
            <h2>Contact Organizer</h2>
          </div>
          <div class="modal-body">
            <div style="white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; color: var(--color-text);">{{ session?.contactInfo }}</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

interface SessionPhoto {
  id: string
  url: string
  thumbnail: string | null
  size: number
  frameId?: string
  frameName?: string
}

interface SessionData {
  sessionId: string
  photoCount: number
  frameName: string | null
  createdAt: string
  expiresAt?: string | null
  photos: SessionPhoto[]
  organizer?: string
  contactInfo?: string
}

const route = useRoute()
const loading = ref(true)
const error = ref(false)
const showContactModal = ref(false)
const expired = ref(false)
const session = ref<SessionData | null>(null)
const selectedPhotoIndex = ref<number | null>(null)
const heroIndex = ref(0)
let heroInterval: number | null = null

const showControls = ref(true)
let controlsTimeout: number | null = null

function resetControlsTimeout() {
  showControls.value = true
  if (controlsTimeout !== null) window.clearTimeout(controlsTimeout)
  controlsTimeout = window.setTimeout(() => {
    showControls.value = false
  }, 2500)
}

watch(selectedPhotoIndex, (newVal) => {
  if (newVal !== null) {
    resetControlsTimeout()
  } else {
    if (controlsTimeout !== null) window.clearTimeout(controlsTimeout)
  }
})

const lightboxLoaded = ref(false)

const lightboxFullSrc = computed(() => {
  if (selectedPhotoIndex.value === null || !session.value) return ''
  return baseUrl + session.value.photos[selectedPhotoIndex.value].url
})

const lightboxThumb = computed(() => {
  if (selectedPhotoIndex.value === null || !session.value) return ''
  const photo = session.value.photos[selectedPhotoIndex.value]
  return baseUrl + (photo.thumbnail || photo.url)
})

function onLightboxLoad() {
  lightboxLoaded.value = true
}

watch(selectedPhotoIndex, (idx) => {
  lightboxLoaded.value = false
  if (idx === null || !session.value) return
  const toPreload = [idx + 1, idx - 1].filter(i => i >= 0 && i < session.value!.photos.length)
  for (const i of toPreload) {
    const photo = session.value!.photos[i]
    if (photo) {
      const img = new Image()
      img.src = baseUrl + photo.url
    }
  }
})

const animationPhotos = computed(() => {
  if (!session.value || !session.value.photos) return []
  const groups: Record<string, SessionPhoto[]> = {}
  for (const photo of session.value.photos) {
    const fid = photo.frameId || 'unframed'
    if (!groups[fid]) groups[fid] = []
    groups[fid].push(photo)
  }
  for (const fid in groups) {
    if (groups[fid].length >= 2) {
      return groups[fid]
    }
  }
  return session.value.photos
})

const expiryText = computed(() => {
  if (!session.value || !session.value.expiresAt) return null
  const d = new Date(session.value.expiresAt)
  const today = new Date()
  
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }
  return `Link expires on ${d.toLocaleString(undefined, opts)}`
})

onUnmounted(() => {
  if (heroInterval) window.clearInterval(heroInterval)
  window.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showContactModal.value) showContactModal.value = false
    if (selectedPhotoIndex.value !== null) selectedPhotoIndex.value = null
    return
  }

  if (selectedPhotoIndex.value === null) return
  if (e.key === 'ArrowRight') {
    nextPhoto()
  } else if (e.key === 'ArrowLeft') {
    prevPhoto()
  }
}

onMounted(async () => {
  document.title = 'hellomyphotos'
  window.addEventListener('keydown', handleKeydown)
  
  const token = route.params.token as string
  if (!token) {
    error.value = true
    loading.value = false
    return
  }
  try {
    const { data } = await axios.get(`/api/share/${token}`)
    if (data.expired) {
      expired.value = true
    } else {
      session.value = data
      
      // Ping analytics in background
      const source = route.query.ref === 'qr' ? 'qr' : 'direct'
      axios.post(`/api/share/${token}/analytics`, { source }).catch(() => {})

      if (animationPhotos.value.length >= 2) {
        heroInterval = window.setInterval(() => {
          if (animationPhotos.value.length >= 2) {
            heroIndex.value = (heroIndex.value + 1) % animationPhotos.value.length
          }
        }, 500)
      }
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})

function openPhoto(index: number) {
  selectedPhotoIndex.value = index
}

function nextPhoto() {
  if (selectedPhotoIndex.value !== null && session.value && selectedPhotoIndex.value < session.value.photos.length - 1) {
    selectedPhotoIndex.value++
  }
}

function prevPhoto() {
  if (selectedPhotoIndex.value !== null && selectedPhotoIndex.value > 0) {
    selectedPhotoIndex.value--
  }
}

function getDownloadUrl(photo: any) {
  if (!photo.downloadUrl) return '#'
  const separator = photo.downloadUrl.includes('?') ? '&' : '?'
  return baseUrl + photo.downloadUrl + separator + 'download=1'
}

async function downloadAll() {
  if (!session.value) return
  const token = route.params.token as string
  const link = document.createElement('a')
  link.href = `${baseUrl}/api/share/${token}/download-all`
  link.download = ''
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<style scoped>
.share-page {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}

.share-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.actions-wrapper {
  text-align: center;
  padding: 1rem;
  margin-bottom: 2rem;
}

.expiry-text {
  color: var(--color-text-sub);
  font-size: var(--text-xs);
  margin-top: 0.75rem;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  gap: 1rem;
  color: var(--color-text-sub);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-text);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-sub);
}

.error h2 {
  color: var(--color-error);
  margin-bottom: 0.5rem;
}

.share-header {
  text-align: center;
  padding: 2rem 1rem;
  border-bottom: 1px solid var(--color-surface);
}

.share-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
}

.subtitle {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin: 0;
  margin-top: 0.25rem;
}

.hero-preview {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-preview img {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  border: 1px solid var(--color-border);
}

.btn-download-all {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0;
  padding: 0.625rem 1.25rem;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: 20px;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-download-all:hover {
  opacity: 0.9;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.8; }
  100% { opacity: 0.6; }
}
.skeleton-pulse {
  background-color: var(--color-surface-alt);
  animation: pulse 1.5s infinite ease-in-out;
}
.skeleton-loader {
  width: 100%;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.5rem;
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.photo-card {
  width: 280px;
  max-width: 100%;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
  transition: transform 0.15s;
  display: flex;
  flex-direction: column;
}

.photo-card:hover {
  transform: translateY(-2px);
}

.card-img-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.photo-card .share-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  cursor: pointer;
  background-color: transparent;
  filter: blur(10px);
  transform: scale(1.05);
  transition: transform 0.4s ease-out;
  will-change: filter, transform;
}

.photo-card .share-img.loaded {
  filter: blur(0);
  transform: scale(1);
  position: relative;
  z-index: 1;
}

.download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--color-border);
  color: var(--color-text);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
  margin-top: auto;
}

.download-btn:hover {
  background: #3a3a3a;
  color: var(--color-text);
}

.share-footer {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.share-footer a {
  color: var(--color-text-sub);
  text-decoration: underline;
  text-decoration-color: var(--color-border);
  text-underline-offset: 3px;
  transition: color 0.2s, text-decoration-color 0.2s;
}

.share-footer a:hover {
  color: var(--color-text);
  text-decoration-color: var(--color-text);
}

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  gap: 1rem;
}

.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 1.5rem;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.3s ease;
}

.hidden-control {
  opacity: 0 !important;
  pointer-events: none;
}

.lightbox-close:hover {
  opacity: 1;
}

.lightbox-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: white;
  padding: 1rem;
  cursor: pointer;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.3s ease, background 0.2s;
  z-index: 1010;
}
.lightbox-nav-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}
.lightbox-prev { left: 2rem; }
.lightbox-next { right: 2rem; }

@media (max-width: 640px) {
  .share-header {
    order: 2;
    margin-top: -100px;
    position: relative;
    z-index: 10;
    padding-top: 1.5rem;
    border-bottom: none;
  }
  .hero-preview {
    order: 1;
    padding: 0;
    position: relative;
  }
  .hero-preview::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 160px;
    background: linear-gradient(to top, var(--color-bg), transparent);
    pointer-events: none;
  }
  .hero-preview img {
    border-radius: 0;
    border: none;
    margin: 0;
    width: 100%;
    max-height: 60vh;
    object-fit: cover;
  }
  .photo-grid {
    order: 3;
    padding: 1rem;
    gap: 1rem;
  }
  .actions-wrapper {
    order: 4;
  }
  .lightbox-prev { left: 0.5rem; padding: 0.5rem; }
  .lightbox-next { right: 0.5rem; padding: 0.5rem; }
}

.lightbox-img-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 90vw;
  max-height: 80vh;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.blur-bg {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(15px);
  opacity: 0.4;
  z-index: 0;
}

.lightbox-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--radius-md);
  transition: opacity 0.3s ease;
}

.lightbox-thumb.thumb-hidden {
  opacity: 0;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: var(--radius-md);
  opacity: 0;
  transition: opacity 0.3s ease;
  will-change: opacity;
  position: relative;
  z-index: 1;
}

.lightbox-img.lb-loaded {
  opacity: 1;
}

.contact-link {
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.contact-link:hover {
  color: var(--color-text);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-page {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0 1rem;
  color: var(--color-text);
}

.back-btn {
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
}
.back-btn:hover { background: var(--color-border); color: var(--color-text); }

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}
</style>
