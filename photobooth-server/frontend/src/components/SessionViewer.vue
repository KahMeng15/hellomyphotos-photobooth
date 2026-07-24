<template>
  <Teleport to="body">
    <div v-show="fullscreenPhotoIndex === null" class="overlay" @click.self="$emit('close')">
      <div class="viewer">
        <button class="close-btn" @click="$emit('close')">✕</button>

        <div class="session-header">
          <h2>{{ session.photoCount }} Photo{{ session.photoCount !== 1 ? 's' : '' }}</h2>
          <span class="session-time">{{ formatTime(session.createdAt) }}</span>
        </div>

        <div class="photo-grid">
          <img
            v-for="(photo, i) in session.photos"
            :key="photo.id"
            :src="photo.url"
            :alt="'Photo ' + (i + 1)"
            class="grid-img"
            @click="openFullscreen(i)"
          />
        </div>

        <div class="viewer-actions">
          <button @click="copyShareLink" class="btn-action">
            {{ linkCopied ? 'Copied!' : 'Copy Share Link' }}
          </button>
          <button @click="showQr" class="btn-action">QR Code</button>
          <button @click="downloadAll" class="btn-action">Download All</button>
          <button @click="deleteSession" class="btn-action btn-danger">Delete</button>
        </div>

        <div v-if="shareError" class="share-error">{{ shareError }}</div>
      </div>
    </div>

    <div v-if="fullscreenPhotoIndex !== null" class="fs-overlay" @click="handleFullscreenClick" @mousemove="resetControlsTimer" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
      <transition name="fade">
        <button v-show="showControls" class="fs-close-btn" @click.stop="closeFullscreen">✕</button>
      </transition>
      
      <transition name="fade">
        <button v-show="showControls && fullscreenPhotoIndex > 0" class="fs-nav-btn fs-prev" @click.stop="prevPhoto">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </transition>
      
      <img
        :src="session.photos[fullscreenPhotoIndex].url"
        class="fs-image"
        :alt="'Fullscreen Photo ' + (fullscreenPhotoIndex + 1)"
      />
      
      <transition name="fade">
        <button v-show="showControls && fullscreenPhotoIndex < session.photos.length - 1" class="fs-nav-btn fs-next" @click.stop="nextPhoto">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </transition>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showQrCode" class="qr-overlay" @click.self="showQrCode = false">
      <div class="qr-modal">
        <button class="close-btn" @click="showQrCode = false">✕</button>
        <canvas ref="qrCanvas"></canvas>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import QRCode from 'qrcode'
import { usePhotosStore } from '../stores/photos'
import type { PhotoSession } from '../stores/photos'

const props = defineProps<{
  session: PhotoSession
  eventId?: string
}>()

const emit = defineEmits<{ close: [] }>()

const photosStore = usePhotosStore()
const linkCopied = ref(false)
const shareError = ref('')
const showQrCode = ref(false)
const qrCanvas = ref<HTMLCanvasElement | null>(null)
let shareUrl = ''

const fullscreenPhotoIndex = ref<number | null>(null)
let touchStartX = 0

const showControls = ref(true)
let controlsTimeout: number | null = null

function resetControlsTimer() {
  showControls.value = true
  if (controlsTimeout) clearTimeout(controlsTimeout)
  controlsTimeout = window.setTimeout(() => {
    showControls.value = false
  }, 3000)
}

function handleFullscreenClick(e: MouseEvent | TouchEvent) {
  if (!showControls.value) {
    e.preventDefault()
    e.stopPropagation()
    resetControlsTimer()
    return
  }
  
  if (e.target === e.currentTarget) {
    closeFullscreen()
  } else {
    resetControlsTimer()
  }
}

function openFullscreen(index: number) {
  fullscreenPhotoIndex.value = index
  resetControlsTimer()
}

function closeFullscreen() {
  fullscreenPhotoIndex.value = null
  if (controlsTimeout) clearTimeout(controlsTimeout)
}

function prevPhoto() {
  if (fullscreenPhotoIndex.value !== null && fullscreenPhotoIndex.value > 0) {
    fullscreenPhotoIndex.value--
    resetControlsTimer()
  }
}

function nextPhoto() {
  if (fullscreenPhotoIndex.value !== null && fullscreenPhotoIndex.value < props.session.photos.length - 1) {
    fullscreenPhotoIndex.value++
    resetControlsTimer()
  }
}

function handleTouchStart(e: TouchEvent) {
  touchStartX = e.changedTouches[0].screenX
  resetControlsTimer()
}

function handleTouchEnd(e: TouchEvent) {
  const touchEndX = e.changedTouches[0].screenX
  const diffX = touchStartX - touchEndX
  
  if (Math.abs(diffX) > 50) {
    if (diffX > 0) {
      nextPhoto()
    } else {
      prevPhoto()
    }
  }
}

async function copyShareLink() {
  shareError.value = ''
  linkCopied.value = false
  try {
    if (props.eventId) {
      const url = await photosStore.createShareLink(props.eventId)
      shareUrl = url
    } else {
      shareUrl = `${window.location.origin}/share/${(props.session as any).share_id || props.session.sessionId}`
    }
    await navigator.clipboard.writeText(shareUrl)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch (err) {
    shareError.value = 'Failed to create share link'
  }
}

async function showQr() {
  if (!shareUrl) {
    try {
      if (props.eventId) {
        shareUrl = await photosStore.createShareLink(props.eventId)
      } else {
        shareUrl = `${window.location.origin}/share/${(props.session as any).share_id || props.session.sessionId}`
      }
    } catch {
      shareError.value = 'Failed to create share link'
      return
    }
  }
  showQrCode.value = !showQrCode.value
  if (showQrCode.value) {
    await nextTick()
    if (qrCanvas.value) {
      await QRCode.toCanvas(qrCanvas.value, shareUrl, {
        width: 200,
        margin: 2,
      })
    }
  }
}

async function downloadAll() {
  for (const photo of props.session.photos) {
    let href: string
    if (props.eventId) {
      href = `/api/admin/events/${props.eventId}/photo/${photo.id}?download=1`
    } else {
      href = `/api/admin/photos/${photo.id}/download`
    }
    const link = document.createElement('a')
    link.href = href
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    await new Promise((r) => setTimeout(r, 500))
  }
}

async function deleteSession() {
  if (props.eventId) {
    await photosStore.deleteEventSession(props.eventId, props.session.sessionId)
  } else {
    await photosStore.deleteSession(props.session.sessionId)
  }
  emit('close')
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString()
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: #0f0f0f;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 100;
  overflow-y: auto;
}

.viewer {
  background: #0f0f0f;
  border-radius: 0;
  padding: 2rem;
  width: 100%;
  max-width: 800px;
  min-height: 100vh;
  margin: 0 auto;
  position: relative;
}

.close-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  color: #888;
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 10;
}

.close-btn:hover {
  color: #fff;
}

.session-header {
  margin-bottom: 1rem;
}

.session-header h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.session-time {
  font-size: 0.75rem;
  color: #888;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.grid-img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  object-fit: cover;
}

.grid-img:hover {
  transform: scale(1.02);
  opacity: 0.9;
}

.viewer-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-action {
  padding: 0.5rem 1rem;
  background: #2a2a2a;
  color: #ccc;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}

.btn-action:hover {
  background: #3a3a3a;
  color: #fff;
}

.btn-danger {
  color: #f44336;
}

.btn-danger:hover {
  background: #3a1a1a;
  color: #ff6659;
}

.qr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.qr-modal {
  background: #1a1a1a;
  border-radius: 12px;
  padding: 2rem;
  position: relative;
}

.share-error {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #f44336;
}

.fs-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.fs-close-btn {
  position: absolute;
  top: 1.5rem;
  right: 2rem;
  background: none;
  border: none;
  color: #fff;
  font-size: 2rem;
  cursor: pointer;
  z-index: 210;
  opacity: 0.7;
}

.fs-close-btn:hover {
  opacity: 1;
}

.fs-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  font-size: 3rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 210;
  border-radius: 50%;
  opacity: 0.7;
  transition: opacity 0.2s, background 0.2s;
}

.fs-nav-btn:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.8);
}

.fs-prev {
  left: 2rem;
}

.fs-next {
  right: 2rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fs-image {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  object-fit: contain;
  user-select: none;
}
</style>
