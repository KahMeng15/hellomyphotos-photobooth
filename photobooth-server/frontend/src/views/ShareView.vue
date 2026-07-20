<template>
  <div class="share-page">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading photos...</p>
    </div>

    <div v-else-if="error" class="error">
      <h2>Link not found</h2>
      <p>This share link is invalid or has expired.</p>
    </div>

    <template v-else-if="session">
      <header class="share-header">
        <h1>hellomyphoto</h1>
        <p class="subtitle">{{ session.photoCount }} photo{{ session.photoCount > 1 ? 's' : '' }}</p>
      </header>

      <div class="photo-grid">
        <div v-for="photo in session.photos" :key="photo.id" class="photo-card">
          <img :src="photo.thumbnail || photo.url" :alt="'Photo'" loading="lazy" @click="openPhoto(photo)" />
          <a :href="downloadUrl(photo.id)" class="download-btn" download>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download JPEG
          </a>
        </div>
      </div>

      <footer class="share-footer">
        <p>Photos taken with hellomyphoto &mdash; self-hosted photo booth</p>
      </footer>

      <div v-if="selectedPhoto" class="lightbox" @click.self="selectedPhoto = null">
        <button class="lightbox-close" @click="selectedPhoto = null">✕</button>
        <img :src="selectedPhoto.url" alt="Photo" class="lightbox-img" />
        <a :href="downloadUrl(selectedPhoto.id)" class="lightbox-download" download>
          Download JPEG
        </a>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

interface SessionPhoto {
  id: string
  url: string
  thumbnail: string | null
  size: number
}

interface SessionData {
  sessionId: string
  photoCount: number
  frameName: string | null
  createdAt: string
  photos: SessionPhoto[]
}

const route = useRoute()
const loading = ref(true)
const error = ref(false)
const session = ref<SessionData | null>(null)
const selectedPhoto = ref<SessionPhoto | null>(null)

onMounted(async () => {
  const token = route.params.token as string
  if (!token) {
    error.value = true
    loading.value = false
    return
  }
  try {
    const { data } = await axios.get(`/api/share/${token}`)
    session.value = data
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})

function openPhoto(photo: SessionPhoto) {
  selectedPhoto.value = photo
}

function downloadUrl(photoId: string) {
  if (!route.params.token) return '#'
  return `/api/share/${route.params.token}/photo/${photoId}?download=1`
}
</script>

<style scoped>
.share-page {
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  padding: 2rem 1rem 1rem;
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
  margin-top: 0.25rem;
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
  aspect-ratio: 3/4;
  object-fit: cover;
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
  color: #444;
  font-size: 0.75rem;
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
}

.lightbox-close:hover {
  opacity: 1;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: 8px;
}

.lightbox-download {
  padding: 0.625rem 1.25rem;
  background: #2a2a2a;
  color: #ccc;
  text-decoration: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
}

.lightbox-download:hover {
  background: #3a3a3a;
  color: #fff;
}

@media (max-width: 640px) {
  .photo-grid {
    grid-template-columns: 1fr;
    padding: 1rem;
    gap: 1rem;
  }
}
</style>
