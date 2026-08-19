<template>
  <div class="share-page">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading photos...</p>
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
          <img :src="baseUrl + animationPhotos[heroIndex]?.url" alt="Preview animation" />
        </div>

        <div class="photo-grid">
          <div v-for="(photo, i) in session.photos" :key="photo.id" class="photo-card">
            <img :src="baseUrl + (photo.thumbnail || photo.url)" :alt="'Photo'" loading="lazy" @click="openPhoto(i)" />
            <a :href="downloadUrl(photo.id)" class="download-btn" download>
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

        <img :src="baseUrl + session.photos[selectedPhotoIndex].url" alt="Photo" class="lightbox-img" />

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
            <div style="white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; color: #ccc;">{{ session?.contactInfo }}</div>
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

function downloadUrl(photoId: string) {
  if (!route.params.token) return '#'
  return baseUrl + `/api/share/${route.params.token}/photo/${photoId}?download=1`
}

async function downloadAll() {
  if (!session.value) return
  const token = route.params.token as string
  const link = document.createElement('a')
  link.href = `/api/share/${token}/download-all`
  link.download = ''
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<style scoped>
.share-page {
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
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
  color: #888;
  font-size: 0.75rem;
  margin-top: 0.75rem;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  gap: 1rem;
  color: #888;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #2a2a2a;
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 4rem 2rem;
  color: #888;
}

.error h2 {
  color: #f44336;
  margin-bottom: 0.5rem;
}

.share-header {
  text-align: center;
  padding: 2rem 1rem;
  border-bottom: 1px solid #1a1a1a;
}

.share-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
}

.subtitle {
  color: #666;
  font-size: 0.875rem;
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
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  border: 1px solid #333;
}

.btn-download-all {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0;
  padding: 0.625rem 1.25rem;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-download-all:hover {
  opacity: 0.9;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.photo-card {
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #2a2a2a;
  transition: transform 0.15s;
}

.photo-card:hover {
  transform: translateY(-2px);
}

.photo-card img {
  width: 100%;
  height: auto;
  display: block;
  cursor: pointer;
}

.download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #2a2a2a;
  color: #ccc;
  text-decoration: none;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.download-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.share-footer {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-size: 0.75rem;
  line-height: 1.5;
}

.share-footer a {
  color: #aaa;
  text-decoration: underline;
  text-decoration-color: #444;
  text-underline-offset: 3px;
  transition: color 0.2s, text-decoration-color 0.2s;
}

.share-footer a:hover {
  color: #fff;
  text-decoration-color: #fff;
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
  color: #fff;
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
  border-radius: 50%;
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
    background: linear-gradient(to top, #0f0f0f, transparent);
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
    grid-template-columns: 1fr;
    padding: 1rem;
    gap: 1rem;
  }
  .actions-wrapper {
    order: 4;
  }
  .lightbox-prev { left: 0.5rem; padding: 0.5rem; }
  .lightbox-next { right: 0.5rem; padding: 0.5rem; }
}

.lightbox-img {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: 8px;
}

.contact-link {
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.contact-link:hover {
  color: #fff;
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
  background: #1a1a1a;
  border-radius: 12px;
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
  border-bottom: 1px solid #2a2a2a;
}

.modal-header h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0 1rem;
  color: #fff;
}

.back-btn {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border-radius: 4px;
}
.back-btn:hover { background: #333; color: #fff; }

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}
</style>
