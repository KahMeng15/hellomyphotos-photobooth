<template>
  <div class="events-page">
    <header class="page-header">
      <div class="header-left">
        <h1>hellomyphoto</h1>
      </div>
      <div class="header-right">
        <button @click="showCreateModal = true" class="btn-primary btn-sm">Create Event</button>
        <span class="user-email">{{ authStore.user?.email }}</span>
        <button @click="handleLogout" class="btn-icon" title="Logout">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </header>

    <main class="events-main">
      <div class="events-header">
        <h2>Events</h2>
        <div class="events-header-right">
          <span class="event-count">{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
          <router-link to="/settings" class="btn-link">Default Settings</router-link>
        </div>
      </div>

      <div class="event-grid" v-if="events.length > 0">
        <div
          v-for="event in events"
          :key="event.id"
          class="event-card"
          @click="router.push(`/events/${event.id}`)"
        >
          <div class="event-info">
            <h3 class="event-name">{{ event.name }}</h3>
            <span class="event-date">{{ event.date }}</span>
            <p v-if="event.description" class="event-desc">{{ event.description }}</p>
          </div>
          <div class="event-meta">
            <span class="event-otp">OTP: {{ event.otp }}</span>
            <span class="event-status" :class="`status-${event.status}`">{{ event.status }}</span>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <p>No events yet. Create one to get started.</p>
      </div>
    </main>

    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal-content">
          <h2>Create Event</h2>
          <div class="form-field">
            <label>Event Name</label>
            <input v-model="newEventName" placeholder="e.g. Faculty Award Night" />
          </div>
          <div class="form-field">
            <label>Date</label>
            <input v-model="newEventDate" type="date" />
          </div>
          <div class="form-field">
            <label>Description (optional)</label>
            <textarea v-model="newEventDesc" placeholder="Any notes..."></textarea>
          </div>
          <div v-if="createError" class="form-error">{{ createError }}</div>
          <div class="form-actions">
            <button @click="showCreateModal = false" class="btn-secondary">Cancel</button>
            <button @click="handleCreate" class="btn-primary" :disabled="!newEventName.trim() || creating">
              {{ creating ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="createdOtp" class="modal-overlay" @click.self="showOtpModal = false">
        <div class="modal-content otp-modal">
          <h2>Event Created</h2>
          <p>Share this OTP with the photobooth to connect:</p>
          <div class="otp-display">{{ createdOtp }}</div>
          <button @click="copyOtp" class="btn-primary">{{ otpCopied ? 'Copied!' : 'Copy OTP' }}</button>
          <button @click="createdOtp = ''" class="btn-secondary">Done</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePhotosStore } from '../stores/photos'

const router = useRouter()
const authStore = useAuthStore()
const photosStore = usePhotosStore()

const events = ref<any[]>([])
const showCreateModal = ref(false)
const newEventName = ref('')
const newEventDate = ref(new Date().toISOString().split('T')[0])
const newEventDesc = ref('')
const createError = ref('')
const creating = ref(false)
const createdOtp = ref('')
const showOtpModal = ref(false)
const otpCopied = ref(false)

onMounted(async () => {
  const { data } = await (await import('axios')).default.get('/api/admin/events?includeEnded=true')
  events.value = data.events
})

async function handleCreate() {
  if (!newEventName.value.trim()) return
  creating.value = true
  createError.value = ''
  try {
    const res = await photosStore.createEvent(newEventName.value.trim(), newEventDate.value, newEventDesc.value.trim())
    createdOtp.value = res.otp
    showCreateModal.value = false
    newEventName.value = ''
    newEventDesc.value = ''
    const { data } = await (await import('axios')).default.get('/api/admin/events?includeEnded=true')
    events.value = data.events
  } catch (err: any) {
    createError.value = err.response?.data?.error || 'Failed to create event'
  } finally {
    creating.value = false
  }
}

function copyOtp() {
  navigator.clipboard.writeText(createdOtp.value)
  otpCopied.value = true
  setTimeout(() => { otpCopied.value = false }, 2000)
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.events-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f0f0f;
  color: #fff;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
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

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.events-main {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.events-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.events-header h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.event-count {
  font-size: 0.8125rem;
  color: #888;
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.event-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 1rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-card:hover {
  border-color: #444;
}

.event-name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.event-date {
  font-size: 0.8125rem;
  color: #888;
}

.event-desc {
  font-size: 0.8125rem;
  color: #666;
  margin: 0.25rem 0 0;
}

.event-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
}

.event-otp {
  font-size: 0.75rem;
  color: #888;
  font-family: monospace;
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

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #666;
}

.btn-link {
  margin-top: 1rem;
  background: none;
  border: none;
  color: #2196F3;
  cursor: pointer;
  font-size: 0.875rem;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}

.modal-content {
  background: #1a1a1a;
  border-radius: 12px;
  padding: 1.5rem;
  width: 100%;
  max-width: 420px;
}

.modal-content h2 {
  margin: 0 0 1rem;
  font-size: 1.125rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
}

.form-field label {
  font-size: 0.75rem;
  color: #888;
}

.form-field input,
.form-field textarea {
  padding: 0.5rem;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  background: #111;
  color: #fff;
  font-size: 0.875rem;
}

.form-field textarea {
  min-height: 60px;
  resize: vertical;
}

.form-error {
  color: #f44336;
  font-size: 0.8125rem;
  margin-bottom: 1rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-primary {
  background: #2196F3;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #2a2a2a;
  color: #ccc;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.otp-modal {
  text-align: center;
}

.otp-display {
  font-size: 2rem;
  font-family: monospace;
  letter-spacing: 0.5rem;
  padding: 1rem;
  background: #111;
  border-radius: 8px;
  margin: 1rem 0;
}

.otp-modal button {
  margin: 0.25rem;
}
</style>
