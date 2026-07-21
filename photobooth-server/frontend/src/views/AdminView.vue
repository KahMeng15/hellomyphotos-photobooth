<template>
  <div class="admin-page">
    <header class="admin-header">
      <button @click="goBack" class="btn-ghost">&larr; Dashboard</button>
      <h1>Admin</h1>
      <div></div>
    </header>

    <div class="admin-grid">
      <section class="admin-card">
        <h2>Frame Library</h2>
        <div class="upload-area" @drop="handleDrop" @dragover.prevent>
          <p>Drag & drop frame PNGs here</p>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            @change="handleFileSelect"
            ref="fileInput"
            hidden
          />
          <button @click="openFilePicker" class="btn-secondary">Browse Files</button>
        </div>
        <div class="frame-list">
          <div v-for="frame in photosStore.frames" :key="frame.id" class="frame-item">
            <span class="frame-name">{{ frame.name }}</span>
            <button @click="deleteFrame(frame.id)" class="btn-icon">✕</button>
          </div>
          <p v-if="photosStore.frames.length === 0" class="empty">No frames uploaded yet.</p>
        </div>
      </section>

      <section class="admin-card">
        <h2>Server Health</h2>
        <div class="health-stats" v-if="health">
          <div class="stat">
            <span class="stat-label">Uptime</span>
            <span class="stat-value">{{ formatUptime(health.uptime) }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Memory</span>
            <span class="stat-value">{{ health.system?.memory?.usagePercent }}%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Photos</span>
            <span class="stat-value">{{ health.storage?.photos }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Queue</span>
            <span class="stat-value">{{ health.queue?.depth || 0 }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">WebSocket</span>
            <span class="stat-value">{{ health.connections?.websocket || 0 }}</span>
          </div>
        </div>
        <p v-else class="empty">Loading health data...</p>
        <button @click="fetchHealth" class="btn-secondary">Refresh</button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePhotosStore } from '../stores/photos'
import axios from 'axios'

const router = useRouter()
const photosStore = usePhotosStore()
const fileInput = ref<HTMLInputElement | null>(null)
const health = ref<any>(null)

onMounted(async () => {
  await photosStore.fetchFrames()
  await fetchHealth()
})

async function fetchHealth() {
  try {
    const { data } = await axios.get('/api/health')
    health.value = data
  } catch {}
}

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) {
    await photosStore.uploadFrame(target.files[0])
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (files?.length) {
    await photosStore.uploadFrame(files[0])
  }
}

async function deleteFrame(id: string) {
  if (confirm('Delete this frame?')) {
    await photosStore.deleteFrame(id)
  }
}

function goBack() {
  router.back()
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
}

.admin-header h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.admin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.admin-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 1.5rem;
}

.admin-card h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.upload-area {
  border: 2px dashed #2a2a2a;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  color: #666;
  margin-bottom: 1rem;
}

.upload-area p {
  margin: 0 0 0.75rem;
}

.frame-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.frame-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: #111;
  border-radius: 6px;
}

.frame-name {
  font-size: 0.8125rem;
  color: #ccc;
}

.btn-icon {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 0.25rem;
}

.btn-icon:hover {
  color: #f44336;
}

.btn-ghost {
  background: none;
  border: 1px solid #2a2a2a;
  color: #ccc;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.btn-ghost:hover {
  border-color: #555;
  color: #fff;
}

.btn-secondary {
  background: #2a2a2a;
  color: #ccc;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.health-stats {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 0.8125rem;
  color: #888;
}

.stat-value {
  font-size: 0.9375rem;
  font-weight: 600;
}

.empty {
  color: #666;
  font-size: 0.8125rem;
}

@media (max-width: 768px) {
  .admin-grid {
    grid-template-columns: 1fr;
  }
}
</style>
