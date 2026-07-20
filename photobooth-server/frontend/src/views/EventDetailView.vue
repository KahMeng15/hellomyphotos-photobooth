<template>
  <div class="dashboard" v-if="event">
    <header class="dashboard-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back" title="Back to events">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1>{{ event.name }}</h1>
        <span class="event-status" :class="`status-${event.status}`">{{ event.status }}</span>
        <span class="otp-badge" v-if="event.status === 'active'" title="Photobooth OTP">OTP: {{ event.otp }}</span>
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
          <h2>Photos</h2>
          <span class="photo-count">{{ photoSessions.length }} group{{ photoSessions.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="session-list" ref="feedRef">
          <div
            v-for="session in photoSessions"
            :key="session.sessionId"
            class="session-card"
            @click="selectSession(session)"
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
          <div v-if="photoSessions.length === 0" class="empty-state">
            <p>No photos yet. Waiting for captures...</p>
          </div>
        </div>
      </section>

      <EventControlPanel
        :connected="boothConnected"
        :event-id="event.id"
        :show="showPanel"
        :send-message="sendMessage"
        @close="showPanel = false"
        @retry="retryConnection"
      />
    </div>

    <PhotoViewer
      v-if="photosStore.selectedPhoto"
      :photo="photosStore.selectedPhoto"
      :event-id="event.id"
      @close="photosStore.clearSelection()"
    />

    <SessionViewer
      v-if="photosStore.selectedSession && !photosStore.selectedPhoto"
      :session="photosStore.selectedSession"
      :event-id="event.id"
      @close="photosStore.clearSelection()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePhotosStore } from '../stores/photos'
import type { PhotoSession } from '../stores/photos'
import { useWebSocket } from '../composables/useWebSocket'
import EventControlPanel from '../components/EventControlPanel.vue'
import PhotoViewer from '../components/PhotoViewer.vue'
import SessionViewer from '../components/SessionViewer.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const photosStore = usePhotosStore()
const { ws, connected, connect, disconnect, sendMessage, subscribe, unsubscribe } = useWebSocket()

const event = ref<any>(null)
const photoSessions = ref<PhotoSession[]>([])
const boothConnected = ref(false)
const showPanel = ref(false)
const feedRef = ref<HTMLElement | null>(null)

let wideMq: MediaQueryList | null = null
const closePanelOnWide = () => {
  if (wideMq?.matches) showPanel.value = false
}

onMounted(async () => {
  wideMq = window.matchMedia('(min-width: 769px)')
  wideMq.addEventListener('change', closePanelOnWide)

  const eventId = route.params.id as string
  const { data } = await (await import('axios')).default.get(`/api/admin/events/${eventId}`)
  event.value = data.event

  await loadSessions()

  const socket = connect()
  if (!socket) return

  subscribe(eventId)

  socket.on('booth-connected', (data: any) => {
    if (data.eventId === eventId) {
      boothConnected.value = data.connected
    }
  })

  socket.on('new-media', async (data: any) => {
    if (data.eventId === eventId) {
      await loadSessions()
    }
  })

  socket.on('booth-status', (status: any) => {
    // not used per-event; booth-connected handles it
  })
})

onUnmounted(() => {
  if (wideMq) wideMq.removeEventListener('change', closePanelOnWide)
  const eventId = route.params.id as string
  unsubscribe(eventId)
})

async function loadSessions() {
  const eventId = route.params.id as string
  const { data } = await (await import('axios')).default.get(`/api/admin/events/${eventId}/photos`)
  photoSessions.value = data.sessions
}

function selectSession(session: PhotoSession) {
  photosStore.selectSession(session)
}

function goBack() {
  router.push('/events')
}

function goToAdmin() {
  router.push('/admin')
}

async function handleLogout() {
  disconnect()
  await authStore.logout()
  router.push('/login')
}

function togglePanel() {
  showPanel.value = !showPanel.value
}

function retryConnection() {
  disconnect()
  connect()
  const eventId = route.params.id as string
  subscribe(eventId)
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString()
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
  gap: 0.75rem;
}

.header-left h1 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.btn-back {
  background: none;
  border: 1px solid #2a2a2a;
  color: #ccc;
  padding: 0.25rem;
  border-radius: 6px;
  cursor: pointer;
  line-height: 0;
}

.btn-back:hover {
  border-color: #555;
  color: #fff;
}

.event-status {
  font-size: 0.6875rem;
  text-transform: uppercase;
  padding: 0.125rem 0.5rem;
  border-radius: 100px;
}

.status-active {
  background: #1a3a2a;
  color: #4caf50;
}

.status-ended {
  background: #3a1a1a;
  color: #f44336;
}

.otp-badge {
  font-size: 0.6875rem;
  color: #888;
  font-family: monospace;
  padding: 0.125rem 0.5rem;
  background: #111;
  border-radius: 4px;
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

.btn-icon {
  background: none;
  border: 1px solid #2a2a2a;
  color: #ccc;
  padding: 0.375rem;
  border-radius: 6px;
  cursor: pointer;
  line-height: 0;
}

.btn-icon:hover {
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

.session-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.session-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
}

.session-card:hover {
  border-color: #444;
}

.session-thumb {
  aspect-ratio: 3/2;
  overflow: hidden;
  background: #111;
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
  font-size: 0.8125rem;
  font-weight: 500;
}

.session-count {
  font-size: 0.6875rem;
  color: #888;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #666;
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
