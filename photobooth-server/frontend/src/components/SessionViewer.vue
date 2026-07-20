<template>
  <Teleport to="body">
    <div class="overlay" @click.self="$emit('close')">
      <div class="viewer">
        <button class="close-btn" @click="$emit('close')">✕</button>

        <div class="session-header">
          <h2>{{ session.photoCount }} Photo{{ session.photoCount !== 1 ? 's' : '' }}</h2>
          <span class="session-time">{{ formatTime(session.createdAt) }}</span>
        </div>

        <div class="photo-strip">
          <img
            v-for="(photo, i) in session.photos"
            :key="photo.id"
            :src="photo.url"
            :alt="'Photo ' + (i + 1)"
            class="strip-img"
          />
        </div>

        <div class="viewer-actions">
          <button @click="copyShareLink" class="btn-action">
            {{ linkCopied ? 'Copied!' : 'Copy Share Link' }}
          </button>
          <button @click="showQr" class="btn-action">QR Code</button>
          <button @click="downloadAll" class="btn-action">Download All</button>
          <button @click="deleteSession" class="btn-action btn-danger">Delete Session</button>
        </div>

        <div v-if="shareError" class="share-error">{{ shareError }}</div>
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
import { ref, nextTick } from 'vue'
import QRCode from 'qrcode'
import { usePhotosStore } from '../stores/photos'
import type { Session } from '../stores/photos'

const props = defineProps<{
  session: Session
}>()

const emit = defineEmits<{ close: [] }>()

const photosStore = usePhotosStore()
const linkCopied = ref(false)
const shareError = ref('')
const showQrCode = ref(false)
const qrCanvas = ref<HTMLCanvasElement | null>(null)
let shareUrl = ''

async function copyShareLink() {
  shareError.value = ''
  linkCopied.value = false
  try {
    const url = await photosStore.createShareLink(props.session.sessionId)
    shareUrl = url
    await navigator.clipboard.writeText(url)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch (err) {
    shareError.value = 'Failed to create share link'
  }
}

async function showQr() {
  if (!shareUrl) {
    try {
      shareUrl = await photosStore.createShareLink(props.session.sessionId)
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
    const link = document.createElement('a')
    link.href = `/api/admin/photos/${photo.id}/download`
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    await new Promise((r) => setTimeout(r, 500))
  }
}

async function deleteSession() {
  await photosStore.deleteSession(props.session.sessionId)
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
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.viewer {
  background: #1a1a1a;
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  min-width: 320px;
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

.photo-strip {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

.strip-img {
  height: 200px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
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

.qr-section {
  margin-top: 1rem;
  text-align: center;
}
</style>
