<template>
  <Teleport to="body">
    <div v-show="fullscreenPhotoIndex === null" class="overlay" @click.self="$emit('close')">
      <div class="viewer">
        <div class="session-header">
          <div class="nav-left">
            <button class="nav-icon" @click="$emit('close')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <h1 class="event-nav-title">
              <span class="event-name">{{ session.photoCount }} Photo{{ session.photoCount !== 1 ? 's' : '' }}</span>
              <span class="nav-divider">/</span>
              <span class="nav-subtitle">{{ formatTime(session.createdAt) }}</span>
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
          <div class="viewer-actions-buttons">
            <AppButton variant="secondary" @click="copyPrimaryShare" style="width: 140px; justify-content: center;">
              {{ linkCopied ? 'Copied!' : 'Copy Share Link' }}
            </AppButton>
            <AppButton variant="secondary" @click="showPrimaryQr">QR Code</AppButton>

            <div class="dropdown-wrapper">
              <AppButton variant="icon" @click="showMenu = !showMenu">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </AppButton>
              <div v-if="showMenu" class="dropdown-menu">
                <a @click="openManageShares">Manage Share Links</a>
                <a v-if="activeFrames.length > 0" @click="applyAllActiveFrames">Regenerate Frames</a>
                <a @click="downloadAll">Download All</a>
                <a @click="deleteSession" class="text-danger">Delete Session</a>
              </div>
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
        <div class="fs-blur-bg" v-if="currentThumb" :style="{ backgroundImage: `url(${currentThumb})` }"></div>
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

  <AppModal v-model="showManageSharesModal">
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <h2 style="margin: 0;">Manage Share Links</h2>
        <AppButton variant="primary" size="sm" @click="createNewShare" title="New Share Link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </AppButton>
      </div>
    </template>
        
    <div v-if="shares.length === 0" class="empty-state">No share links available.</div>
    <div v-else class="share-list">
      <div v-for="share in shares" :key="share.id" class="share-item">
        <div class="share-info">
          <a :href="origin + '/share/' + share.id" target="_blank" class="share-url" title="Open Share Link">/share/{{ share.id }}</a>
          <div class="share-date">{{ new Date(share.created_at).toLocaleString() }}</div>
        </div>
        <div class="share-actions">
          <AppButton variant="icon" @click="toggleShareStatus(share)" :title="share.is_active ? 'Disable' : 'Enable'" :style="share.is_active ? '' : 'color: var(--color-text-sub);'">
            <svg v-if="!share.is_active" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </AppButton>
          <AppButton variant="icon" @click="copySpecificShare(share.id)" title="Copy Link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </AppButton>
          <AppButton variant="icon" @click="showSpecificQr(share.id)" title="View QR Code">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </AppButton>
          <AppButton variant="danger" size="sm" @click="deleteShare(share.id)" title="Delete Link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </AppButton>
        </div>
      </div>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="showManageSharesModal = false">Close</AppButton>
    </template>
  </AppModal>

  <AppModal v-model="showQrCode" size="md">
    <template #header>
      <h2 style="margin: 0;">QR Code</h2>
    </template>
    <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; gap: 1.5rem; padding: 1rem 0;">
      <img v-if="qrDataUrl" :src="qrDataUrl" style="width: 100%; max-width: 250px; height: auto; display: block;" alt="QR Code" />
      <a :href="currentQrLink" target="_blank" style="font-family: monospace; font-size: 0.875rem; color: var(--color-text-sub); text-align: center; word-break: break-all; text-decoration: none;">{{ currentQrLink }}</a>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import AppButton from './ui/AppButton.vue'
import AppModal from './ui/AppModal.vue'
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
const qrDataUrl = ref('')
const currentQrLink = ref('')
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
  const qrUrl = shareUrl.includes('?') ? `${shareUrl}&ref=qr` : `${shareUrl}?ref=qr`
  currentQrLink.value = qrUrl
  qrDataUrl.value = await QRCode.toDataURL(qrUrl, {
    width: 500,
    margin: 2,
  })
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
      href = `${baseUrl}/api/admin/events/${props.eventId}/photo/${photo.id}?download=1`
    } else {
      href = `${baseUrl}/api/admin/photos/${photo.id}/download`
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
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: var(--color-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 100;
  overflow: hidden;
}

.viewer {
  background: var(--color-bg);
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
  color: var(--color-text-sub);
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 10;
}

.close-btn:hover {
  color: var(--color-text);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 50;
  height: 60px;
}
.nav-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.event-nav-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.nav-divider, .nav-subtitle {
  color: var(--color-text-sub);
  font-weight: 400;
}
.nav-icon {
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-sub);
  cursor: pointer;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-base);
}
.nav-icon:hover {
  background: var(--color-surface-alt);
  color: var(--color-text);
}
.frame-toggle {
  display: flex;
  align-items: center;
}
.frame-select {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  outline: none;
  cursor: pointer;
  min-width: 150px;
}
.frame-select:focus {
  border-color: var(--color-text-sub);
}
.viewer-body {
  padding: 1.5rem;
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
  font-size: var(--text-xs);
  color: var(--color-text-sub);
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
  color: var(--color-text-sub);
  text-align: center;
  padding: 3rem 1rem;
  margin-bottom: 2rem;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border);
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.8; }
  100% { opacity: 0.6; }
}

.skeleton-pulse {
  background-color: var(--color-border);
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
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  object-fit: contain;
  background-color: var(--color-border);
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

.dropdown-wrapper {
  position: relative;
  display: inline-block;
}
.dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 0.5rem;
  background: #1e1e1e;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  min-width: 180px;
  z-index: 50;
  overflow: hidden;
}

.dropdown-menu a {
  padding: 0.75rem 1rem;
  color: var(--color-text);
  text-decoration: none;
  cursor: pointer;
  font-size: var(--text-sm);
}

.dropdown-menu a:hover {
  background: var(--color-border);
}

.dropdown-menu a.text-danger {
  color: var(--color-error);
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
  background: var(--color-border);
  padding: 1rem;
  border-radius: var(--radius-md);
}

.share-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.share-url {
  font-family: monospace;
  font-size: var(--text-sm);
  color: #4CAF50;
  text-decoration: none;
}

.share-url:hover {
  text-decoration: underline;
}

.share-date {
  font-size: var(--text-xs);
  color: var(--color-text-sub);
}

.share-actions {
  display: flex;
  gap: 0.5rem;
}

.share-actions .btn-icon {
  background: var(--color-border);
  border-color: var(--color-border);
}

.share-actions .btn-icon:hover {
  background: var(--color-border);
  border-color: var(--color-text-muted);
}

.share-actions .btn-icon.inactive {
  color: var(--color-text-sub);
}

.share-actions .btn-danger-icon {
  color: var(--color-error);
}

.share-actions .btn-danger-icon:hover {
  background: #4a2a2a;
  border-color: #6a3a3a;
  color: #ff6659;
}



.share-error {
  margin-top: 0.5rem;
  font-size: var(--text-xs);
  color: var(--color-error);
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
  color: var(--color-text);
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
  color: var(--color-text);
  border: none;
  font-size: 3rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 210;
  border-radius: var(--radius-full);
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
  overflow: hidden;
  border-radius: var(--radius-md);
}

.fs-blur-bg {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(15px);
  opacity: 0.4;
  z-index: 0;
}

.fs-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--radius-md);
  transition: opacity 0.3s ease;
}

.fs-thumb.thumb-hidden {
  opacity: 0;
}

.fs-image {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: var(--radius-md);
  opacity: 0;
  transition: opacity 0.3s ease;
  will-change: opacity;
  position: relative;
  z-index: 1;
}

.fs-image.fs-loaded {
  opacity: 1;
}

.viewer-actions-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

@media (max-width: 768px) {
  .viewer-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .frame-toggle {
    width: 100%;
  }
  .frame-select {
    width: 100%;
  }
  .viewer-actions-buttons {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
}
</style>
