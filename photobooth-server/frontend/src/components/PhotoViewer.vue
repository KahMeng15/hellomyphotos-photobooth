<template>
  <Teleport to="body">
    <div class="overlay" @click.self="$emit('close')">
      <div class="viewer">
        <button class="close-btn" @click="$emit('close')">✕</button>
        <div class="image-wrap">
          <div class="blur-bg" :style="{ backgroundImage: `url(${baseUrl + photo.url})` }"></div>
          <div class="image-skeleton skeleton-pulse" :class="{ 'thumb-hidden': photoLoaded }"></div>
          <img 
            :src="baseUrl + photo.url" 
            :alt="'Photo ' + photo.id" 
            class="full-image"
            :class="{ loaded: photoLoaded }"
            @load="photoLoaded = true"
          />
        </div>
        <div class="viewer-meta">
          <span>{{ formatTime(photo.timestamp) }}</span>
          <span v-if="photo.frameName">Frame: {{ photo.frameName }}</span>
          <span v-if="photo.size">{{ (photo.size / 1024).toFixed(0) }}KB</span>
        </div>
        <div class="viewer-actions">
          <a :href="downloadUrl" class="btn-action">Download JPEG</a>
          <button @click="sharePhoto" class="btn-action">Share</button>
          <button v-if="photo.sessionId" @click="shareSessionLink" class="btn-action">{{ sessionLinkCopied ? 'Copied!' : 'Copy Session Link' }}</button>
          <button @click="showQr" class="btn-action">QR Code</button>
          <button v-if="photo.sessionId" @click="deleteSession" class="btn-action btn-danger">Delete Session</button>
          <button @click="deleteSingle" class="btn-action btn-danger">Delete</button>
        </div>
        <div v-if="showQrCode" class="qr-section" style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
          <img v-if="qrDataUrl" :src="qrDataUrl" style="width: 100%; max-width: 250px; height: auto; display: block;" alt="QR Code" />
          <a :href="currentQrLink" target="_blank" style="font-family: monospace; font-size: 0.875rem; color: var(--color-text-sub); text-align: center; word-break: break-all; text-decoration: none;">{{ currentQrLink }}</a>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
import { computed, ref } from 'vue'
import QRCode from 'qrcode'
import { usePhotosStore } from '../stores/photos'

const props = defineProps<{
  photo: { id: string; url: string; timestamp: string; sessionId?: string; frameName?: string; size?: number }
  eventId?: string
}>()

const emit = defineEmits<{ close: [] }>()

const photosStore = usePhotosStore()

const photoLoaded = ref(false)
const showQrCode = ref(false)
const qrDataUrl = ref('')
const currentQrLink = ref('')
const sessionLinkCopied = ref(false)


const downloadUrl = computed(() => {
  if (props.eventId) {
    return `${baseUrl}/api/admin/events/${props.eventId}/photo/${props.photo.id}?download=1`
  }
  return `${baseUrl}/api/admin/photos/${props.photo.id}/download`
})

async function sharePhoto() {
  const url = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') + props.photo.url
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Booth Photo', url })
    } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(url)
    } catch {}
  }
}

async function shareSessionLink() {
  if (!props.photo.sessionId || !props.eventId) return
  sessionLinkCopied.value = false
  try {
    const url = await photosStore.createShareLink(props.eventId)
    await navigator.clipboard.writeText(url)
    sessionLinkCopied.value = true
    setTimeout(() => { sessionLinkCopied.value = false }, 2000)
  } catch {
    sessionLinkCopied.value = false
  }
}

async function showQr() {
  showQrCode.value = !showQrCode.value
  if (showQrCode.value) {
    const qrUrl = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') + props.photo.url
    currentQrLink.value = qrUrl
    qrDataUrl.value = await QRCode.toDataURL(qrUrl, {
      width: 250,
      margin: 2,
    })
  }
}

async function deleteSingle() {
  if (props.eventId) {
    const axios = await import('axios')
    await axios.default.delete(`/api/admin/events/${props.eventId}/photo/${props.photo.id}`)
  } else {
    await photosStore.deletePhoto(props.photo.id)
  }
  emit('close')
}

async function deleteSession() {
  if (props.photo.sessionId && props.eventId) {
    await photosStore.deleteEventSession(props.eventId, props.photo.sessionId)
  } else if (props.photo.sessionId) {
    await photosStore.deleteSession(props.photo.sessionId)
  }
  emit('close')
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
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.viewer {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  width: 90vw;
  max-width: 800px;
  height: 90vh; /* Fixed height to anchor bottom */
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

.image-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  margin-bottom: 1rem;
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

.image-skeleton {
  position: absolute;
  inset: 0;
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-md);
  transition: opacity 0.3s ease;
}

.image-skeleton.thumb-hidden {
  opacity: 0;
}

@keyframes skeleton-pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.9; }
  100% { opacity: 0.6; }
}

.skeleton-pulse {
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.full-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-md);
  display: block;
  opacity: 0;
  transition: opacity 0.3s ease;
  position: relative;
  z-index: 1;
}

.full-image.loaded {
  opacity: 1;
}

.viewer-meta {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 0;
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.viewer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: auto;
}

.btn-action {
  padding: 0.5rem 1rem;
  background: var(--color-border);
  color: var(--color-text);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}

.btn-action:hover {
  background: #3a3a3a;
  color: var(--color-text);
}

.btn-danger {
  color: var(--color-error);
  border-color: var(--color-error);
}

.btn-danger:hover {
  background: var(--color-border);
  color: #ff6659;
}

.qr-section {
  margin-top: 1rem;
  text-align: center;
}
</style>
