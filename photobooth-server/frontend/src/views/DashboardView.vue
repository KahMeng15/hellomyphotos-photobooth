<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="header-left">
        <h1>hellomyphoto</h1>
      </div>
      <div class="header-right">
        <button @click="togglePanel" class="btn-icon btn-panel-toggle" title="Booth controller">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
        <span class="user-email">{{ authStore.user?.email }}</span>
        <button @click="goToAdmin" class="btn-icon" title="Admin">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
        <button @click="handleLogout" class="btn-icon" title="Logout">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="dashboard-grid">
      <section class="photo-feed">
        <div class="feed-header">
          <h2>Sessions</h2>
          <span class="photo-count">{{ photosStore.sessions.length }} session{{ photosStore.sessions.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="session-list" ref="feedRef">
          <div
            v-for="session in photosStore.sessions"
            :key="session.sessionId"
            class="session-card"
            @click="photosStore.selectSession(session)"
          >
            <div class="session-thumb">
              <img
                :src="session.photos[session.photos.length - 1]?.thumbnail"
                :alt="'Session ' + session.sessionId"
                class="thumb-img"
              />
            </div>
            <div class="session-meta">
              <span class="session-time">{{ formatTime(session.createdAt) }}</span>
              <span class="session-count">{{ session.photoCount }} photo{{ session.photoCount !== 1 ? 's' : '' }}</span>
            </div>
          </div>
          <div v-if="photosStore.sessions.length === 0" class="empty-state">
            <p>No sessions yet. Waiting for captures...</p>
          </div>
        </div>
      </section>

      <ControlPanel :connected="connected" :sendMessage="sendMessage" :show="showPanel" @close="showPanel = false" @retry="retryConnection" />
    </div>

    <PhotoViewer
      v-if="photosStore.selectedPhoto"
      :photo="photosStore.selectedPhoto"
      @close="photosStore.clearSelection()"
    />

    <SessionViewer
      v-if="photosStore.selectedSession && !photosStore.selectedPhoto"
      :session="photosStore.selectedSession"
      @close="photosStore.clearSelection()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePhotosStore } from '../stores/photos'
import { useWebSocket } from '../composables/useWebSocket'
import ControlPanel from '../components/ControlPanel.vue'
import PhotoViewer from '../components/PhotoViewer.vue'
import SessionViewer from '../components/SessionViewer.vue'

const router = useRouter()
const authStore = useAuthStore()
const photosStore = usePhotosStore()
const { ws, connected, connect, disconnect, sendMessage } = useWebSocket()

const boothOnline = ref(false)
const feedRef = ref<HTMLElement | null>(null)
const showPanel = ref(false)

let wideMq: MediaQueryList | null = null
const closePanelOnWide = () => {
  if (wideMq?.matches) showPanel.value = false
}

onMounted(async () => {
  wideMq = window.matchMedia('(min-width: 769px)')
  wideMq.addEventListener('change', closePanelOnWide)

  await photosStore.fetchSessions()
  await photosStore.fetchSessions()
  await photosStore.fetchPhotos()
  await photosStore.fetchFrames()

  const socket = connect()
  if (!socket) return

  socket.on('booth-status', (status: any) => {
    boothOnline.value = status.online
  })

  socket.on('new-media', async (data: any) => {
    await photosStore.fetchSessions()
    if (data.results) {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
      data.results.forEach((r: any) => {
        photosStore.addPhoto({
          id: r.output || r.thumbnail,
          url: `${baseUrl}/api/photos/${r.output}`,
          thumbnail: `${baseUrl}/api/photos/${r.thumbnail}`,
          size: 0,
          timestamp: data.timestamp,
          sessionId: data.sessionId,
          frameName: data.frameName,
        })
      })
    }
  })
})

onUnmounted(() => {
  if (wideMq) wideMq.removeEventListener('change', closePanelOnWide)
})

async function handleLogout() {
  disconnect()
  await authStore.logout()
  router.push('/login')
}

function goToAdmin() {
  router.push('/admin')
}

function togglePanel() {
  showPanel.value = !showPanel.value
}

function retryConnection() {
  disconnect()
  connect()
}

function formatTime(ts: string) {
  const d = new Date(ts)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${time}, ${date}`
}
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
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

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-email {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.btn-icon {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.375rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  line-height: 0;
  transition: all 0.15s;
}

.btn-icon:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
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
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0;
}

.photo-count {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.session-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.session-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s;
}

.session-card:hover {
  border-color: var(--color-border);
}

.session-thumb {
  aspect-ratio: 3/2;
  overflow: hidden;
  background: var(--color-surface);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.session-meta {
  padding: 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.session-time {
  font-size: var(--text-sm);
  font-weight: 500;
}

.session-count {
  font-size: 0.6875rem;
  color: var(--color-text-sub);
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .user-email {
    display: none;
  }
}

@media (min-width: 769px) {
  .btn-panel-toggle {
    display: none;
  }
}
</style>
