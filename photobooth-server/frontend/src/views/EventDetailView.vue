<template>
  <div class="dashboard page-wrapper" v-if="event">
    <div v-if="activeBoothError" class="error-overlay">
      <div class="error-modal">
        <div style="margin-bottom:1rem;">
          <svg v-if="activeBoothError.type === 'dslr'" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="2" y1="2" x2="22" y2="22"/>
            <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/>
            <path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/>
            <path d="M14.12 15.12A3 3 0 1 1 9.88 10.88"/>
          </svg>
          <svg v-else width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2>{{ activeBoothError.type === 'dslr' ? 'Camera Disconnected' : 'Capture Failed' }}</h2>
        <p v-html="activeBoothError.message"></p>
        <div class="error-actions">
          <button v-if="activeBoothError.type === 'dslr'" @click="resolveBoothError('retry')" class="btn-error-primary">Retry</button>
          <button @click="resolveBoothError('dismiss')" class="btn-error-secondary">{{ activeBoothError.type === 'dslr' ? 'Exit' : 'OK' }}</button>
        </div>
      </div>
    </div>
    <AppTopNav mode="event" :event="event" currentTitle="" @toggle-panel="togglePanel" />

    <div class="dashboard-grid">
      <section class="photo-feed">
        <div class="feed-header">
          <h2>Photos</h2>
          <div class="feed-header-right">
            <button @click="toggleArchive" :class="['btn-icon', { active: showArchive }]" title="View Archive" style="margin-right: 0.75rem;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
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
          <button v-if="!showArchive" @click="archiveSelected" class="btn-action btn-archive">Archive</button>
          <button v-else @click="restoreSelected" class="btn-action btn-archive">Restore</button>
          <button @click="deleteSelected" class="btn-action btn-delete">Delete</button>
          <button @click="selectedSessions.clear()" class="btn-action btn-cancel">Clear</button>
        </div>

        <div :class="['session-list', viewMode]" ref="feedRef">
          <div
            v-for="session in photoSessions"
            :key="session.sessionId"
            :class="['session-card', { selected: selectedSessions.has(session.sessionId) }]"
            @click="selectSession(session)"
          >
            <div class="session-thumb" :style="session.photoWidth && session.photoHeight ? { aspectRatio: `${session.photoWidth}/${session.photoHeight}` } : {}">
              <img
                v-if="session.photos[session.photos.length - 1]?.thumbnail"
                :src="baseUrl + session.photos[session.photos.length - 1].thumbnail"
                :alt="'Session ' + session.sessionId"
                class="thumb-img"
                loading="lazy"
                @load="$event.target.classList.add('loaded')"
              />
              <div v-else class="thumb-img thumb-skeleton skeleton-pulse"></div>
              <div class="session-check" :class="{ checked: selectedSessions.has(session.sessionId) }" @click.stop="toggleSelect(session.sessionId)">
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
      :event="event"
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
const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePhotosStore } from '../stores/photos'
import type { PhotoSession } from '../stores/photos'
import { useWebSocket } from '../composables/useWebSocket'
import EventControlPanel from '../components/EventControlPanel.vue'
import PhotoViewer from '../components/PhotoViewer.vue'
import SessionViewer from '../components/SessionViewer.vue'
import AppTopNav from '../components/ui/AppTopNav.vue'
import AppPageLayout from '../components/ui/AppPageLayout.vue'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const photosStore = usePhotosStore()
const { ws, connect, disconnect, sendMessage, subscribe, unsubscribe } = useWebSocket()

let confirmResolve: ((value: boolean) => void) | null = null
const confirmState = ref<{ message: string; confirmLabel: string } | null>(null)
const viewMode = ref<'grid-sm' | 'grid-lg' | 'list'>((localStorage.getItem('hellomyphoto_viewMode') as any) || 'grid-sm')
const selectedSessions = ref<Set<string>>(new Set())

watch(() => route.query.session, (sessionId) => {
  if (sessionId) {
    const session = photoSessions.value.find((s: any) => s.sessionId === sessionId)
    if (session && photosStore.selectedSession?.sessionId !== sessionId) {
      photosStore.selectSession(session)
    }
  } else {
    if (photosStore.selectedSession) {
      photosStore.clearSelection()
    }
  }
})

watch(() => photosStore.selectedSession, (session) => {
  const query = { ...route.query }
  if (session) {
    query.session = session.sessionId
  } else {
    delete query.session
  }
  if (route.query.session !== query.session) {
    router.replace({ query })
  }
})

const event = ref<any>(null)
const photoSessions = ref<any[]>([])
const boothConnected = ref(false)
const boothState = ref<string | null>(null)
const activeBoothError = ref<{ errorId: string, message: string, type: string } | null>(null)
const showPanel = ref(false)
const showArchive = ref(false)

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

function toggleArchive() {
  showArchive.value = !showArchive.value
  selectedSessions.value.clear()
  loadSessions()
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

  socket.on('booth-error', (data: any) => {
    if (data.eventId === eventId) {
      activeBoothError.value = {
        errorId: data.errorId,
        message: data.message,
        type: data.type
      }
    }
  })

  socket.on('booth-error-resolved', (data: any) => {
    if (data.eventId === eventId && activeBoothError.value?.errorId === data.errorId) {
      activeBoothError.value = null
    }
  })
})

function resolveBoothError(action: string) {
  if (!activeBoothError.value) return
  
  const socket = ws.value
  if (socket) {
    socket.emit('resolve-booth-error', {
      eventId: event.value.id,
      errorId: activeBoothError.value.errorId,
      action
    })
  }
  
  activeBoothError.value = null
}

const pollInterval = setInterval(() => { loadSessions() }, 5000)

const connPollInterval = setInterval(() => {
  if (!boothConnected.value && ws.value?.connected) {
    const eventId = route.params.id as string
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
  try {
    const { data } = await axios.get(`/api/admin/events/${eventId}/photos`, {
      params: { includeArchived: showArchive.value }
    })
    photoSessions.value = data.sessions
  } catch (err) {
    console.error('Failed to load sessions', err)
  }
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

async function restoreSelected() {
  const ids = Array.from(selectedSessions.value)
  if (!ids.length) return
  try {
    await Promise.all(ids.map(id => axios.patch(`/api/admin/events/${route.params.id}/session/${id}/restore`)))
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
  const d = new Date(ts)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${time}, ${date}`
}
</script>

<style>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.confirm-modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  max-width: 360px;
  width: 100%;
}
.confirm-modal p {
  font-size: var(--text-base);
  color: var(--color-text);
  margin: 0 0 1.25rem;
  line-height: 1.4;
}
.confirm-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.frames-modal {
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  width: 90vw;
  height: 90vh;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
}
.frames-modal .close-btn {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  background: none;
  border: none;
  color: var(--color-text-sub);
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 100;
}
.frames-modal .close-btn:hover {
  color: var(--color-text);
}
.btn-confirm {
  padding: 0.5rem 1rem;
  background: var(--color-error);
  color: var(--color-text);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.btn-confirm:hover {
  background: #d32f2f;
}
.btn-cancel-modal {
  padding: 0.5rem 1rem;
  background: transparent;
  color: var(--color-text-sub);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}
.btn-cancel-modal:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}
</style>

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
  gap: 0.75rem;
}

.header-left h1 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}


.event-status {
  font-size: 0.6875rem;
  text-transform: uppercase;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-pill);
}

.status-active {
  background: #1a3a2a;
  color: var(--color-success);
}

.status-ended {
  background: var(--color-border);
  color: var(--color-error);
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
}

.btn-icon:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.btn-icon.active {
  background: var(--color-border);
  color: var(--color-text);
  border-color: var(--color-info);
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
  padding: 2rem;
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

.feed-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.view-toggle {
  display: flex;
  gap: 2px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.btn-view {
  background: none;
  border: none;
  color: var(--color-text-muted);
  padding: 0.25rem 0.375rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  line-height: 0;
}

.btn-view:hover {
  color: var(--color-text);
}

.btn-view.active {
  background: var(--color-border);
  color: var(--color-text);
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  background: #1a2a3a;
  border: 1px solid #2a4a6a;
  border-radius: var(--radius-md);
}

.selection-count {
  font-size: var(--text-sm);
  color: #88c8ff;
  margin-right: auto;
}

.btn-action {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 5px;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}

.btn-archive {
  background: #2a3a2a;
  color: var(--color-success);
}

.btn-archive:hover {
  background: #3a4a3a;
}

.btn-delete {
  background: var(--color-border);
  color: var(--color-error);
}

.btn-delete:hover {
  background: #4a2a2a;
}

.btn-cancel {
  background: var(--color-border);
  color: var(--color-text-sub);
}

.btn-cancel:hover {
  color: var(--color-text);
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
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s;
}

.session-card:hover {
  border-color: var(--color-text-muted);
}

.session-card.selected {
  border-color: var(--color-info);
  box-shadow: 0 0 0 1px var(--color-info);
}

.session-thumb {
  position: relative;
  aspect-ratio: 3/2;
  overflow: hidden;
  background: var(--color-surface);
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
  background-color: var(--color-surface-alt);
  filter: blur(10px);
  transform: scale(1.05);
  transition: transform 0.4s ease-out;
  will-change: filter, transform;
}
.thumb-img.loaded {
  filter: blur(0);
  transform: scale(1);
}

.thumb-skeleton {
  background-color: var(--color-surface-alt);
}
@keyframes skeleton-pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.9; }
  100% { opacity: 0.6; }
}
.skeleton-pulse {
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.session-check {
  position: absolute;
  top: 0.375rem;
  left: 0.375rem;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
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
  background: var(--color-info);
  border-color: var(--color-info);
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
  grid-column: 1 / -1;
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

.error-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.error-modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 2rem;
  border-radius: var(--radius-xl);
  max-width: 400px;
  width: 90%;
  text-align: center;
}
.error-modal h2 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: var(--color-text);
}
.error-modal p {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
  margin: 0 0 1.5rem;
  line-height: 1.5;
  word-break: break-word;
}
.error-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}
.btn-error-primary {
  padding: 0.75rem 2rem;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-pill);
  font-size: var(--text-base);
  font-weight: 700;
  cursor: pointer;
}
.btn-error-secondary {
  padding: 0.75rem 2rem;
  background: transparent;
  color: var(--color-text-sub);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: var(--text-base);
  cursor: pointer;
}
</style>
