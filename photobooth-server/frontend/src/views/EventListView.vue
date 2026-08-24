<template>
  <div class="events-page">
    <AppTopNav mode="home" />

    <main class="app-page-layout">
      <div class="events-header">
        <div class="events-header-left">
          <h2>Events</h2>
          <span class="event-count">{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="events-header-right">
          <AppButton v-if="authStore.user?.role === 'admin'" variant="primary" @click="showCreateModal = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create Event
          </AppButton>
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
            <div class="event-organizer">{{ event.organizer || authStore.user?.email || 'Admin' }}</div>
            <div class="event-date">{{ formatDate(event.date) }}</div>
            <p v-if="event.description" class="event-desc">{{ event.description }}</p>
          </div>
          <div class="event-meta">
            
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
import AppTopNav from '../components/ui/AppTopNav.vue'
import AppButton from '../components/ui/AppButton.vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePhotosStore } from '../stores/photos'
import { toast } from 'vue3-toastify'

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

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

onMounted(async () => {
  try {
    const { data } = await (await import('axios')).default.get('/api/admin/events?includeEnded=true')
    events.value = data.events
  } catch (err) {
    toast.error('Failed to load events')
  }
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
    toast.success('Event created successfully')
    const { data } = await (await import('axios')).default.get('/api/admin/events?includeEnded=true')
    events.value = data.events
  } catch (err: any) {
    createError.value = err.response?.data?.error || 'Failed to create event'
    toast.error(createError.value)
  } finally {
    creating.value = false
  }
}

function copyOtp() {
  navigator.clipboard.writeText(createdOtp.value)
  otpCopied.value = true
  toast.success('OTP copied to clipboard')
  setTimeout(() => { otpCopied.value = false }, 2000)
}

async function handleLogout() {
  await authStore.logout()
  toast.info('Logged out')
  router.push('/login')
}
</script>

<style scoped>
.events-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.events-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.events-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
  /* Full width via app-page-layout */
  width: 100%;
}
.events-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.events-header h2 {
  font-size: var(--text-2xl);
  font-weight: 700;
  margin: 0;
}
.event-count {
  color: var(--color-text-sub);
  font-size: var(--text-sm);
  background: var(--color-surface);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
}
.event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.event-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-card:hover {
  border-color: var(--color-border);
}

.event-name {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0;
}

.event-organizer {
  display: block;
  font-size: var(--text-xs);
  color: var(--color-text-sub);
  margin-top: 0.25rem;
}

.event-date {
  display: block;
  margin-top: 0.25rem;
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.event-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0.25rem 0 0;
}

.event-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.event-otp {
  font-size: var(--text-xs);
  color: var(--color-text-sub);
  font-family: monospace;
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

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-muted);
}

.btn-link {
  margin-top: 1rem;
  background: none;
  border: none;
  color: var(--color-info);
  cursor: pointer;
  font-size: var(--text-sm);
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
  background: var(--color-surface);
  border-radius: var(--radius-lg);
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
  font-size: var(--text-xs);
  color: var(--color-text-sub);
}

.form-field input,
.form-field textarea {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.form-field textarea {
  min-height: 60px;
  resize: vertical;
}

.form-error {
  color: var(--color-error);
  font-size: var(--text-sm);
  margin-bottom: 1rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-primary {
  background: var(--color-info);
  color: var(--color-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: var(--text-sm);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: var(--text-sm);
}

.otp-modal {
  text-align: center;
}

.otp-display {
  font-size: 2rem;
  font-family: monospace;
  letter-spacing: 0.5rem;
  padding: 1rem;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  margin: 1rem 0;
}

.otp-modal button {
  margin: 0.25rem;
}
</style>
