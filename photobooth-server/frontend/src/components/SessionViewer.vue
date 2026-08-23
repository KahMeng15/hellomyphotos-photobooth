<template>
  <Teleport to="body">
    <div v-show="fullscreenPhotoIndex === null" class="overlay" @click.self="$emit('close')">
      <div class="viewer">
        <div class="session-header">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button class="btn-back" @click="$emit('close')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <h1 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #fff;">
              {{ session.photoCount }} Photo{{ session.photoCount !== 1 ? 's' : '' }}
              <span style="color: #888; font-weight: 400; margin-left: 0.5rem; font-size: 0.9rem;">/ {{ formatTime(session.createdAt) }}</span>
            </h1>
          </div>
        </div>
        <div class="viewer-body">

        <div v-if="isLoadingPhotos" class="photo-grid">
          <div 
            v-for="i in (props.session.photoCount || 4)" 
            :key="'skeleton-'+i" 
            class="grid-img skeleton-pulse" 
            :style="skeletonStyle"
          ></div>
        </div>
        <div v-else-if="displayPhotos.length > 0" class="photo-grid">
          <img
            v-for="(photo, i) in displayPhotos"
            :key="photo.id"
            :src="baseUrl + (photo.thumbnail || photo.url)"
            :alt="'Photo ' + (i + 1)"
            class="grid-img"
            loading="lazy"
            @load="$event.target.classList.add('loaded')"
            @click="openFullscreen(i)"
          />
        </div>
        <div v-else class="empty-state">
          <p>No framed photos available. Please ensure you have run the Backfill process for this frame.</p>
        </div>

        <div class="viewer-actions">
          <div v-if="activeFrames.length > 0" class="frame-toggle">
            <select v-model="selectedFrameId" @change="fetchFramedPhotos" class="frame-select">
              <option value="">Original Photos</option>
              <option v-for="frame in activeFrames" :key="frame.id" :value="frame.id">{{ frame.name }}</option>
            </select>
          </div>
          
          <button @click="copyPrimaryShare" class="btn-action">
            {{ linkCopied ? 'Copied!' : 'Copy Share Link' }}
          </button>
          <button @click="showPrimaryQr" class="btn-action">QR Code</button>

          <div class="dropdown-wrapper">
            <button class="btn-icon" @click="showMenu = !showMenu">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
            <div v-if="showMenu" class="dropdown-menu">
              <a @click="openManageShares">Manage Share Links</a>
              <a v-if="activeFrames.length > 0" @click="applyAllActiveFrames">Regenerate Frames</a>
              <a @click="downloadAll">Download All</a>
              <a @click="deleteSession" class="text-danger">Delete Session</a>
            </div>
          </div>
        </div>

        <div v-if="shareError" class="share-error">{{ shareError }}</div>
        </div>
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
      
      <div class="fs-image-wrap">
        <img
          v-if="currentThumb"
          :src="currentThumb"
          class="fs-thumb"
          :class="{ 'thumb-hidden': fsImageLoaded }"
          aria-hidden="true"
        />
        <img
          ref="fsImgRef"
          :src="currentFullSrc"
          class="fs-image"
          :class="{ 'fs-loaded': fsImageLoaded }"
          :alt="'Fullscreen Photo ' + (fullscreenPhotoIndex !== null ? fullscreenPhotoIndex + 1 : '')"
          @load="onFsImageLoad"
        />
      </div>
      
      <transition name="fade">
        <button v-show="showControls && fullscreenPhotoIndex < displayPhotos.length - 1" class="fs-nav-btn fs-next" @click.stop="nextPhoto">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </transition>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showManageSharesModal" class="modal-overlay" @click.self="showManageSharesModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>Manage Share Links</h2>
          <button class="btn-icon btn-add" @click="createNewShare" title="New Share Link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
        
        <div v-if="shares.length === 0" class="empty-state">No share links available.</div>
        <div v-else class="share-list">
          <div v-for="share in shares" :key="share.id" class="share-item">
            <div class="share-info">
              <a :href="origin + '/share/' + share.id" target="_blank" class="share-url" title="Open Share Link">/share/{{ share.id }}</a>
              <div class="share-date">{{ new Date(share.created_at).toLocaleString() }}</div>
            </div>
            <div class="share-actions">
              <button @click="toggleShareStatus(share)" class="btn-icon" :title="share.is_active ? 'Disable' : 'Enable'" :class="{ inactive: !share.is_active }">
                <svg v-if="!share.is_active" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button @click="copySpecificShare(share.id)" class="btn-icon" title="Copy Link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button @click="showSpecificQr(share.id)" class="btn-icon" title="View QR Code">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </button>
              <button @click="deleteShare(share.id)" class="btn-icon btn-danger-icon" title="Delete Link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button @click="showManageSharesModal = false" class="btn-secondary">Close</button>
        </div>
      </div>
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
const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import QRCode from 'qrcode'
import axios from 'axios'
import { toast } from 'vue3-toastify'
import { usePhotosStore } from '../stores/photos'
import type { PhotoSession } from '../stores/photos'

const props = defineProps<{
  session: PhotoSession
  eventId?: string
  event?: any
}>()

const emit = defineEmits<{ close: [] }>()

const skeletonStyle = computed(() => ({
  width: '100%',
  aspectRatio: props.session.photoWidth && props.session.photoHeight
    ? `${props.session.photoWidth}/${props.session.photoHeight}`
    : '2/3'
}))


const photosStore = usePhotosStore()
const linkCopied = ref(false)
const applyingFrame = ref(false)
const shareError = ref('')
const showQrCode = ref(false)
const qrCanvas = ref<HTMLCanvasElement | null>(null)
let shareUrl = ''

const showMenu = ref(false)
const showManageSharesModal = ref(false)
const shares = ref<any[]>([])

const origin = window.location.origin

const activeFrames = ref<any[]>([])
const selectedFrameId = ref<string>('')
const framedPhotos = ref<any[]>([])

const displayPhotos = computed(() => {
  if (selectedFrameId.value) {
    return framedPhotos.value
  }
  return props.session.photos
})

onMounted(async () => {
  if (props.eventId) {
    try {
      const res = await axios.get(`/api/admin/events/${props.eventId}/frames`)
      activeFrames.value = res.data.frames.filter((f: any) => !f.disabled && !f.isSpecial)
      
      // Auto-select first active frame if available
      if (activeFrames.value.length > 0) {
        selectedFrameId.value = activeFrames.value[0].id
        await fetchFramedPhotos()
      }
    } catch (e) {
      console.error('Failed to load frames for session viewer', e)
    }
  }
  await fetchShares()
})

async function fetchShares() {
  try {
    const res = await axios.get(`/api/admin/events/${props.eventId}/sessions/${props.session.sessionId}/shares`)
    shares.value = res.data.shares || []
  } catch (e) {
    console.error('Failed to fetch shares', e)
  }
}

async function createNewShare() {
  try {
    await axios.post(`/api/admin/events/${props.eventId}/sessions/${props.session.sessionId}/shares`)
    toast.success('Share link created!')
    await fetchShares()
  } catch (e) {
    console.error('Failed to create share', e)
    toast.error('Failed to create share link')
  }
}

async function toggleShareStatus(share: any) {
  try {
    const nextStatus = !share.is_active
    await axios.patch(`/api/admin/events/${props.eventId}/sessions/${props.session.sessionId}/shares/${share.id}`, { isActive: nextStatus })
    toast.success(nextStatus ? 'Share link enabled' : 'Share link disabled')
    await fetchShares()
  } catch (e) {
    console.error('Failed to toggle share status', e)
    toast.error('Failed to update share link')
  }
}

async function deleteShare(shareId: string) {
  if (!confirm('Are you sure you want to delete this share link?')) return
  try {
    await axios.delete(`/api/admin/events/${props.eventId}/sessions/${props.session.sessionId}/shares/${shareId}`)
    toast.success('Share link deleted')
    await fetchShares()
  } catch (e) {
    console.error('Failed to delete share', e)
    toast.error('Failed to delete share link')
  }
}

function openManageShares() {
  showMenu.value = false
  showManageSharesModal.value = true
}

const isLoadingPhotos = ref(false)

async function fetchFramedPhotos() {
  if (!selectedFrameId.value) {
    framedPhotos.value = []
    return
  }
  isLoadingPhotos.value = true
  try {
    const res = await axios.get(`/api/admin/events/${props.eventId}/sessions/${props.session.sessionId}/framed?frameId=${selectedFrameId.value}`)
    framedPhotos.value = res.data.photos || []
  } catch (e) {
    console.error('Failed to load framed photos', e)
    framedPhotos.value = []
  } finally {
    isLoadingPhotos.value = false
  }
}

async function applyAllActiveFrames() {
  if (activeFrames.value.length === 0) return
  showMenu.value = false
  applyingFrame.value = true
  shareError.value = ''
  toast.info('Regeneration started...', { autoClose: 2000 })
  try {
    for (const frame of activeFrames.value) {
      await axios.post(`/api/admin/events/${props.eventId}/sessions/${props.session.sessionId}/frames/${frame.id}/apply`)
    }
    toast.success('Frames regenerated successfully!')
    await fetchFramedPhotos()
  } catch (e: any) {
    shareError.value = e.response?.data?.error || 'Failed to regenerate some frames'
    toast.error(shareError.value)
  }
  applyingFrame.value = false
}

const fullscreenPhotoIndex = ref<number | null>(null)

const fsImgRef = ref<HTMLImageElement | null>(null)
const fsImageLoaded = ref(false)

const currentFullSrc = computed(() => {
  if (fullscreenPhotoIndex.value === null) return ''
  return baseUrl + (displayPhotos.value[fullscreenPhotoIndex.value]?.url || '')
})

const currentThumb = computed(() => {
  if (fullscreenPhotoIndex.value === null) return ''
  const photo = displayPhotos.value[fullscreenPhotoIndex.value]
  return photo ? baseUrl + (photo.thumbnail || photo.url) : ''
})

function onFsImageLoad() {
  fsImageLoaded.value = true
}

watch(fullscreenPhotoIndex, (idx) => {
  fsImageLoaded.value = false
  if (idx === null) return
  const toPreload = [idx + 1, idx - 1].filter(i => i >= 0 && i < displayPhotos.value.length)
  for (const i of toPreload) {
    const photo = displayPhotos.value[i]
    if (photo) {
      const img = new Image()
      img.src = baseUrl + photo.url
    }
  }
})

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
    if (e instanceof MouseEvent) {
      const clickX = e.clientX
      if (clickX > window.innerWidth / 2) {
        nextPhoto()
      } else {
        prevPhoto()
      }
    }
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
  if (fullscreenPhotoIndex.value !== null && fullscreenPhotoIndex.value < displayPhotos.value.length - 1) {
    fullscreenPhotoIndex.value++
    resetControlsTimer()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (fullscreenPhotoIndex.value !== null) {
    if (e.key === 'ArrowRight') {
      nextPhoto()
    } else if (e.key === 'ArrowLeft') {
      prevPhoto()
    } else if (e.key === 'Escape') {
      closeFullscreen()
    }
  } else {
    if (e.key === 'Escape') {
      emit('close')
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

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

async function copyPrimaryShare() {
  shareError.value = ''
  linkCopied.value = false
  try {
    if (shares.value.length === 0) {
      await createNewShare()
    }
    const primaryShare = shares.value.find((s: any) => s.is_active) || shares.value[0]
    if (!primaryShare) throw new Error('No shares available')

    shareUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/share/${primaryShare.id}`
    await navigator.clipboard.writeText(shareUrl)
    linkCopied.value = true
    toast.success('Share link copied to clipboard!')
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch (err) {
    shareError.value = 'Failed to copy share link'
    toast.error(shareError.value)
  }
}

async function copySpecificShare(shareId: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/share/${shareId}`)
    toast.success('Link copied to clipboard')
  } catch (err) {
    console.error(err)
    toast.error('Failed to copy link')
  }
}

async function showPrimaryQr() {
  if (shares.value.length === 0) {
    await createNewShare()
  }
  const primaryShare = shares.value.find((s: any) => s.is_active) || shares.value[0]
  if (!primaryShare) return
  
  await showSpecificQr(primaryShare.id)
}

async function showSpecificQr(shareId: string) {
  shareUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/share/${shareId}`
  showQrCode.value = true
  await nextTick()
  if (qrCanvas.value) {
    const qrUrl = shareUrl.includes('?') ? `${shareUrl}&ref=qr` : `${shareUrl}?ref=qr`
    await QRCode.toCanvas(qrCanvas.value, qrUrl, {
      width: 500,
      margin: 2,
    })
  }
}

async function downloadAll() {
  showMenu.value = false
  toast.info('Preparing download...', { autoClose: 1500 })
  let downloadedCount = 0
  for (const photo of displayPhotos.value) {
    let href: string
    if (photo.downloadUrl) {
      href = photo.downloadUrl + '?download=1'
    } else if (props.eventId) {
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
    downloadedCount++
    await new Promise((r) => setTimeout(r, 500))
  }
  toast.success(`Downloaded ${downloadedCount} photos!`)
}

async function deleteSession() {
  if (!confirm('Are you sure you want to delete this entire session?')) return
  try {
    if (props.eventId) {
      await photosStore.deleteEventSession(props.eventId, props.session.sessionId)
    } else {
      await photosStore.deleteSession(props.session.sessionId)
    }
    toast.success('Session deleted')
    emit('close')
  } catch (err) {
    toast.error('Failed to delete session')
  }
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
  overflow: hidden;
}

.viewer {
  background: #0f0f0f;
  border-radius: 0;
  width: 100%;
  max-width: 100%;
  height: 100vh;
  margin: 0 auto;
  position: relative;
  display: flex;
  flex-direction: column;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 2rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  position: sticky;
  top: 0;
  z-index: 50;
}
.frame-toggle {
  display: flex;
  align-items: center;
}
.frame-select {
  padding: 0.5rem 1rem;
  background: #2a2a2a;
  color: #ccc;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: background 0.2s, color 0.2s;
}
.frame-select:hover {
  background: #3a3a3a;
  color: #fff;
}
.frame-select:focus {
  outline: 1px solid #555;
}
.viewer-body {
  padding: 1.5rem 2rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  grid-auto-rows: minmax(0, 1fr);
  gap: 1.5rem;
  margin: 0;
  flex: 1;
  min-height: 0;
}

.empty-state {
  color: #888;
  text-align: center;
  padding: 3rem 1rem;
  margin-bottom: 2rem;
  background: #1a1a1a;
  border-radius: 8px;
  border: 1px dashed #333;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.8; }
  100% { opacity: 0.6; }
}

.skeleton-pulse {
  background-color: #333;
  animation: pulse 1.5s infinite ease-in-out;
}

.grid-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  justify-self: center;
  align-self: center;
  min-height: 0;
  min-width: 0;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  object-fit: contain;
  background-color: #333;
  animation: pulse 1.5s infinite ease-in-out;
  opacity: 0;
}
.grid-img.loaded {
  animation: none;
  background-color: transparent;
  opacity: 1;
}

.grid-img:hover {
  transform: scale(1.02);
  opacity: 0.9;
}

.viewer-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 1.5rem;
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

.dropdown-wrapper {
  position: relative;
  display: inline-block;
}

.btn-icon {
  background: #2a2a2a;
  color: #ccc;
  border: none;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.btn-icon:hover {
  background: #3a3a3a;
  color: #fff;
}

.dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 0.5rem;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  min-width: 180px;
  z-index: 50;
  overflow: hidden;
}

.dropdown-menu a {
  padding: 0.75rem 1rem;
  color: #fff;
  text-decoration: none;
  cursor: pointer;
  font-size: 0.875rem;
}

.dropdown-menu a:hover {
  background: #2a2a2a;
}

.dropdown-menu a.text-danger {
  color: #f44336;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  overflow-y: auto;
}

.modal {
  background: #1a1a1a;
  padding: 2rem;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  border: 1px solid #333;
  color: #fff;
}

.modal h2 {
  margin-top: 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.btn-add {
  background: #2196F3;
  color: #fff;
  border: none;
  padding: 0.375rem;
  border-radius: 6px;
}

.btn-add:hover {
  background: #1976D2;
  color: #fff;
}

.btn-primary {
  background: #2196F3;
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-primary:hover {
  background: #1976D2;
}

.btn-secondary {
  background: #2a2a2a;
  color: #ccc;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-secondary:hover {
  background: #3a3a3a;
  color: #fff;
}

.share-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.share-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2a2a2a;
  padding: 1rem;
  border-radius: 8px;
}

.share-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.share-url {
  font-family: monospace;
  font-size: 0.875rem;
  color: #4CAF50;
  text-decoration: none;
}

.share-url:hover {
  text-decoration: underline;
}

.share-date {
  font-size: 0.75rem;
  color: #888;
}

.share-actions {
  display: flex;
  gap: 0.5rem;
}

.share-actions .btn-icon {
  background: #333;
  border-color: #444;
}

.share-actions .btn-icon:hover {
  background: #444;
  border-color: #666;
}

.share-actions .btn-icon.inactive {
  color: #888;
}

.share-actions .btn-danger-icon {
  color: #f44336;
}

.share-actions .btn-danger-icon:hover {
  background: #4a2a2a;
  border-color: #6a3a3a;
  color: #ff6659;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 2rem;
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
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.qr-modal canvas {
  width: 100% !important;
  height: auto !important;
  max-width: 500px;
  max-height: calc(90vh - 4rem);
  object-fit: contain;
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

.fs-image-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 90vw;
  max-height: 80vh;
}

.fs-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  transition: opacity 0.3s ease;
}

.fs-thumb.thumb-hidden {
  opacity: 0;
}

.fs-image {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.3s ease;
  will-change: opacity;
  position: relative;
  z-index: 1;
}

.fs-image.fs-loaded {
  opacity: 1;
}
</style>
