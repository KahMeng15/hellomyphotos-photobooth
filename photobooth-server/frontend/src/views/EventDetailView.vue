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
          <div class="feed-header-right">
            <div class="view-toggle">
              <button @click="setViewMode('grid-sm')" :class="['btn-view', { active: viewMode === 'grid-sm' }]" title="Small grid">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
              </button>
              <button @click="setViewMode('grid-lg')" :class="['btn-view', { active: viewMode === 'grid-lg' }]" title="Large grid">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="7"/><rect x="3" y="14" width="18" height="7"/>
                </svg>
              </button>
              <button @click="setViewMode('list')" :class="['btn-view', { active: viewMode === 'list' }]" title="List">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div v-if="selectedSessions.size > 0" class="selection-bar">
          <span class="selection-count">{{ selectedSessions.size }} selected</span>
          <button @click="archiveSelected" class="btn-action btn-archive">Archive</button>
          <button @click="deleteSelected" class="btn-action btn-delete">Delete</button>
          <button @click="selectedSessions.clear()" class="btn-action btn-cancel">Clear</button>
        </div>

        <div :class="['session-list', viewMode]" ref="feedRef">
          <div
            v-for="session in photoSessions"
            :key="session.sessionId"
            :class="['session-card', { selected: selectedSessions.has(session.sessionId) }]"
            @click="toggleSelect(session.sessionId)"
            @dblclick="selectSession(session)"
          >
            <div class="session-thumb">
              <img
                :src="session.photos[session.photos.length - 1]?.thumbnail"
                :alt="'Session ' + session.sessionId"
                class="thumb-img"
              />
              <div class="session-check" :class="{ checked: selectedSessions.has(session.sessionId) }">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
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
        :booth-state="boothState"
        :total-sessions="photoSessions.length"
        :total-photos="photoSessions.reduce((sum, s) => sum + s.photoCount, 0)"
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

    <Teleport to="body">
      <div v-if="confirmState" class="modal-overlay" @click.self="confirmState = null">
        <div class="confirm-modal">
          <p>{{ confirmState.message }}</p>
          <div class="confirm-actions">
            <button @click="handleConfirm" class="btn-confirm">{{ confirmState.confirmLabel }}</button>
            <button @click="handleCancel" class="btn-cancel-modal">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePhotosStore } from '../stores/photos'
import type { PhotoSession } from '../stores/photos'
import { useWebSocket } from '../composables/useWebSocket'
import EventControlPanel from '../components/EventControlPanel.vue'
import PhotoViewer from '../components/PhotoViewer.vue'
import SessionViewer from '../components/SessionViewer.vue'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const photosStore = usePhotosStore()
const { ws, connect, disconnect, sendMessage, subscribe, unsubscribe } = useWebSocket()

const event = ref<any>(null)
const photoSessions = ref<any[]>([])
const boothConnected = ref(false)
const boothState = ref<string | null>(null)
const showPanel = ref(false)
const feedRef = ref<HTMLElement | null>(null)
const viewMode = ref<'grid-sm' | 'grid-lg' | 'list'>((localStorage.getItem('hellomyphoto_viewMode') as any) || 'grid-lg')
const selectedSessions = ref(new Set<string>())
const confirmState = ref<{ message: string; confirmLabel: string } | null>(null)
let confirmResolve: ((v: boolean) => void) | null = null

function confirmAsync(message: string, confirmLabel = 'Confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve
    confirmState.value = { message, confirmLabel }
  })
}

function handleConfirm() {
  confirmResolve?.(true)
  confirmResolve = null
  confirmState.value = null
}

function handleCancel() {
  confirmResolve?.(false)
  confirmResolve = null
  confirmState.value = null
}

function setViewMode(mode: 'grid-sm' | 'grid-lg' | 'list') {
  viewMode.value = mode
  localStorage.setItem('hellomyphoto_viewMode', mode)
}

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

  socket.on('connect', () => {
    subscribe(eventId)
  })

  socket.on('booth-connected', (data: any) => {
    if (data.eventId === eventId) {
      boothConnected.value = data.connected
      if (!data.connected) boothState.value = null
    }
  })

  socket.on('booth-state', (data: any) => {
    if (data.eventId === eventId) {
      boothState.value = data.state
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

// Poll fallback: refresh every 5s in case WebSocket events are missed
const pollInterval = setInterval(() => { loadSessions() }, 5000)

// Poll fallback for booth connection status every 10s
const connPollInterval = setInterval(() => {
  if (!boothConnected.value && ws.value?.connected) {
    subscribe(eventId)
  }
}, 10000)

onUnmounted(() => {
  clearInterval(pollInterval)
  clearInterval(connPollInterval)
  if (wideMq) wideMq.removeEventListener('change', closePanelOnWide)
  const eventId = route.params.id as string
  unsubscribe(eventId)
})

async function loadSessions() {
  const eventId = route.params.id as string
  const { data } = await axios.get(`/api/admin/events/${eventId}/photos`)
  photoSessions.value = data.sessions
}

function selectSession(session: PhotoSession) {
  photosStore.selectSession(session)
}

function goBack() {
  router.back()
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

function toggleSelect(sessionId: string) {
  const newSet = new Set(selectedSessions.value)
  if (newSet.has(sessionId)) {
    newSet.delete(sessionId)
  } else {
    newSet.add(sessionId)
  }
  selectedSessions.value = newSet
}

async function archiveSelected() {
  const ids = Array.from(selectedSessions.value)
  if (!ids.length) return
  const confirmed = await confirmAsync(`Archive ${ids.length} session${ids.length > 1 ? 's' : ''}?`, 'Archive')
  if (!confirmed) return
  try {
    await axios.post(`/api/admin/events/${route.params.id}/sessions/batch-archive`, { sessionIds: ids })
    selectedSessions.value = new Set()
    await loadSessions()
  } catch {}
}

async function deleteSelected() {
  const ids = Array.from(selectedSessions.value)
  if (!ids.length) return
  const confirmed = await confirmAsync(`Delete ${ids.length} session${ids.length > 1 ? 's' : ''}? This cannot be undone.`, 'Delete')
  if (!confirmed) return
  try {
    await axios.post(`/api/admin/events/${route.params.id}/sessions/batch-delete`, { sessionIds: ids })
    selectedSessions.value = new Set()
    await loadSessions()
  } catch {}
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

.feed-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.view-toggle {
  display: flex;
  gap: 2px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 2px;
}

.btn-view {
  background: none;
  border: none;
  color: #666;
  padding: 0.25rem 0.375rem;
  border-radius: 4px;
  cursor: pointer;
  line-height: 0;
}

.btn-view:hover {
  color: #ccc;
}

.btn-view.active {
  background: #2a2a2a;
  color: #fff;
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  background: #1a2a3a;
  border: 1px solid #2a4a6a;
  border-radius: 8px;
}

.selection-count {
  font-size: 0.8125rem;
  color: #88c8ff;
  margin-right: auto;
}

.btn-action {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-archive {
  background: #2a3a2a;
  color: #4caf50;
}

.btn-archive:hover {
  background: #3a4a3a;
}

.btn-delete {
  background: #3a1a1a;
  color: #f44336;
}

.btn-delete:hover {
  background: #4a2a2a;
}

.btn-cancel {
  background: #2a2a2a;
  color: #888;
}

.btn-cancel:hover {
  color: #ccc;
}

.session-list {
  display: grid;
  gap: 1rem;
}

.session-list.grid-sm {
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
}

.session-list.grid-lg {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.session-list.list {
  grid-template-columns: 1fr;
}

.session-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s;
}

.session-card:hover {
  border-color: #555;
}

.session-card.selected {
  border-color: #2196F3;
  box-shadow: 0 0 0 1px #2196F3;
}

.session-thumb {
  position: relative;
  aspect-ratio: 3/2;
  overflow: hidden;
  background: #111;
}

.session-list.list .session-thumb {
  aspect-ratio: auto;
  width: 120px;
  height: 80px;
  flex-shrink: 0;
}

.session-list.list .session-card {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.session-list.list .session-meta {
  flex: 1;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.session-check {
  position: absolute;
  top: 0.375rem;
  left: 0.375rem;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid rgba(255,255,255,0.5);
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s;
}

.session-card:hover .session-check {
  opacity: 1;
}

.session-check.checked {
  opacity: 1;
  background: #2196F3;
  border-color: #2196F3;
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
  grid-column: 1 / -1;
  text-align: center;
  padding: 4rem 2rem;
  color: #666;
}

.confirm-modal {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 360px;
  width: 100%;
}

.confirm-modal p {
  font-size: 0.9375rem;
  color: #ccc;
  margin: 0 0 1.25rem;
  line-height: 1.4;
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-confirm {
  padding: 0.5rem 1rem;
  background: #f44336;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-confirm:hover {
  background: #d32f2f;
}

.btn-cancel-modal {
  padding: 0.5rem 1rem;
  background: transparent;
  color: #888;
  border: 1px solid #333;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.btn-cancel-modal:hover {
  border-color: #555;
  color: #ccc;
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
