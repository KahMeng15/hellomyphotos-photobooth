<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="header-left">
        <h1>hellomyphoto</h1>
        <span class="badge" :class="`badge-${connectionStatus}`">
          {{ connectionStatus }}
        </span>
      </div>
      <div class="header-right">
        <span class="user-email">{{ authStore.user?.email }}</span>
        <button @click="goToAdmin" class="btn-ghost">Admin</button>
        <button @click="handleLogout" class="btn-ghost">Logout</button>
      </div>
    </header>

    <div class="dashboard-grid">
      <section class="photo-feed">
        <div class="feed-header">
          <h2>Live Photos</h2>
          <span class="photo-count">{{ photosStore.photos.length }} photos</span>
        </div>
        <div class="photo-grid" ref="feedRef">
          <div
            v-for="photo in photosStore.latestPhotos"
            :key="photo.id"
            class="photo-card"
            @click="photosStore.selectPhoto(photo)"
          >
            <img
              :src="photo.thumbnail"
              :alt="'Photo ' + photo.id"
              loading="lazy"
            />
            <div class="photo-meta">
              <span class="timestamp">{{ formatTime(photo.timestamp) }}</span>
            </div>
          </div>
          <div v-if="photosStore.photos.length === 0" class="empty-state">
            <p>No photos yet. Waiting for captures...</p>
          </div>
        </div>
      </section>

      <ControlPanel />
    </div>

    <PhotoViewer
      v-if="photosStore.selectedPhoto"
      :photo="photosStore.selectedPhoto"
      @close="photosStore.clearSelection()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePhotosStore } from '../stores/photos'
import { useWebSocket } from '../composables/useWebSocket'
import ControlPanel from '../components/ControlPanel.vue'
import PhotoViewer from '../components/PhotoViewer.vue'

const router = useRouter()
const authStore = useAuthStore()
const photosStore = usePhotosStore()
const { ws, connected, connect, disconnect } = useWebSocket()

const connectionStatus = ref('connecting')
const feedRef = ref<HTMLElement | null>(null)

onMounted(async () => {
  await photosStore.fetchPhotos()
  await photosStore.fetchFrames()

  const socket = connect()
  if (!socket) return

  socket.on('connect', () => {
    connectionStatus.value = 'connected'
  })

  socket.on('disconnect', () => {
    connectionStatus.value = 'disconnected'
  })

  socket.on('new-media', (data: any) => {
    if (data.results) {
      data.results.forEach((r: any) => {
        photosStore.addPhoto({
          id: r.output || r.thumbnail,
          url: `/api/photos/${r.output}`,
          thumbnail: `/api/photos/${r.thumbnail}`,
          size: 0,
          timestamp: data.timestamp,
          sessionId: data.sessionId,
          frameName: data.frameName,
        })
      })
    }
  })

  socket.on('booth-status', (status: any) => {
    connectionStatus.value = status.online ? 'connected' : 'offline'
  })
})

async function handleLogout() {
  disconnect()
  await authStore.logout()
  router.push('/login')
}

function goToAdmin() {
  router.push('/admin')
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString()
}
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f0f0f;
  color: #fff;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-left h1 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.badge {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 100px;
  font-weight: 500;
  text-transform: uppercase;
}

.badge-connected {
  background: #1a3a2a;
  color: #4caf50;
}

.badge-disconnected {
  background: #3a1a1a;
  color: #f44336;
}

.badge-connecting {
  background: #3a3a1a;
  color: #ff9800;
}

.badge-offline {
  background: #3a1a1a;
  color: #f44336;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-email {
  font-size: 0.8125rem;
  color: #888;
}

.btn-ghost {
  background: none;
  border: 1px solid #2a2a2a;
  color: #ccc;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-ghost:hover {
  border-color: #555;
  color: #fff;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 0;
  flex: 1;
  overflow: hidden;
}

.photo-feed {
  overflow-y: auto;
  padding: 1.5rem;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.feed-header h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.photo-count {
  font-size: 0.8125rem;
  color: #888;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.photo-card {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  transition: transform 0.15s, border-color 0.15s;
}

.photo-card:hover {
  transform: translateY(-2px);
  border-color: #444;
}

.photo-card img {
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
}

.photo-meta {
  padding: 0.5rem;
}

.timestamp {
  font-size: 0.75rem;
  color: #888;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 4rem 2rem;
  color: #666;
}

@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
