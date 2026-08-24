<template>
  <div class="admin-page">
    <header class="admin-header">
      <button @click="router.push('/events')" class="btn-ghost">&larr; Dashboard</button>
      <h1>System Admin</h1>
      <div class="admin-tabs">
        <button :class="['tab-btn', { active: currentTab === 'frames' }]" @click="currentTab = 'frames'">Frames & Health</button>
        <button :class="['tab-btn', { active: currentTab === 'settings' }]" @click="currentTab = 'settings'">Global Settings</button>
        <button v-if="authStore.user?.role === 'admin'" :class="['tab-btn', { active: currentTab === 'users' }]" @click="currentTab = 'users'">Users</button>
      </div>
    </header>

    <div class="admin-content">
      <div v-if="currentTab === 'frames'" class="admin-grid">
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

      <div v-if="currentTab === 'settings'">
        <SettingsViewEmbedded />
      </div>

      <div v-if="currentTab === 'users' && authStore.user?.role === 'admin'">
        <UsersViewEmbedded />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePhotosStore } from '../stores/photos'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
import SettingsViewEmbedded from './SettingsView.vue'
import UsersViewEmbedded from './UsersView.vue'

const router = useRouter()
const photosStore = usePhotosStore()
const authStore = useAuthStore()
const fileInput = ref<HTMLInputElement | null>(null)
const health = ref<any>(null)
const currentTab = ref('frames')

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
  background: var(--color-bg);
  color: var(--color-text);
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 50;
}

.admin-header h1 {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 0;
  color: var(--color-text);
}

.admin-tabs {
  display: flex;
  gap: 0.5rem;
  background: var(--color-border);
  padding: 0.25rem;
  border-radius: var(--radius-md);
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--color-text-sub);
  padding: 0.5rem 1rem;
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn.active {
  background: var(--color-border);
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.admin-content {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
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
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
}

.admin-card h2 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 1rem;
}

.upload-area {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 2rem;
  text-align: center;
  color: var(--color-text-muted);
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
  background: var(--color-surface);
  border-radius: var(--radius-sm);
}

.frame-name {
  font-size: var(--text-sm);
  color: var(--color-text);
}

.btn-icon {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.25rem;
}

.btn-icon:hover {
  color: var(--color-error);
}

.btn-ghost {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.btn-ghost:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
  border: none;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
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
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.stat-value {
  font-size: var(--text-base);
  font-weight: 600;
}

.empty {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

@media (max-width: 768px) {
  .admin-grid {
    grid-template-columns: 1fr;
  }
}
</style>
