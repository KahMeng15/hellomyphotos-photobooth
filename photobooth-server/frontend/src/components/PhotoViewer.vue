<template>
  <Teleport to="body">
    <div class="overlay" @click.self="$emit('close')">
      <div class="viewer">
        <button class="close-btn" @click="$emit('close')">✕</button>
        <img :src="photo.url" :alt="'Photo ' + photo.id" class="full-image" />
        <div class="viewer-meta">
          <span>{{ formatTime(photo.timestamp) }}</span>
          <span v-if="photo.frameName">Frame: {{ photo.frameName }}</span>
          <span v-if="photo.size">{{ (photo.size / 1024).toFixed(0) }}KB</span>
        </div>
        <div class="viewer-actions">
          <a :href="photo.url" download class="btn-action">Download</a>
          <button @click="sharePhoto" class="btn-action">Share</button>
          <button @click="showQr" class="btn-action">QR Code</button>
        </div>
        <div v-if="showQrCode" class="qr-section">
          <canvas ref="qrCanvas"></canvas>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import QRCode from 'qrcode'

const props = defineProps<{
  photo: { id: string; url: string; timestamp: string; frameName?: string; size?: number }
}>()

defineEmits<{ close: [] }>()

const showQrCode = ref(false)
const qrCanvas = ref<HTMLCanvasElement | null>(null)

async function sharePhoto() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Booth Photo',
        url: props.photo.url,
      })
    } catch {}
  }
}

async function showQr() {
  showQrCode.value = !showQrCode.value
  if (showQrCode.value && qrCanvas.value) {
    await QRCode.toCanvas(qrCanvas.value, window.location.origin + props.photo.url, {
      width: 200,
      margin: 2,
    })
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

.full-image {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 8px;
  display: block;
}

.viewer-meta {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 0;
  font-size: 0.8125rem;
  color: #888;
}

.viewer-actions {
  display: flex;
  gap: 0.5rem;
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

.qr-section {
  margin-top: 1rem;
  text-align: center;
}
</style>
