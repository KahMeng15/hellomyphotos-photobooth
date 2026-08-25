<template>
  <aside class="control-panel" v-if="event">
    
    <!-- Booth Remote Card -->
    <section class="card" :class="{ 'card-connected': connected, 'card-disconnected': !connected }">
      <div class="card-header-flex">
        <div>
          <h2>Booth Remote</h2>
          <p class="card-desc" style="margin-bottom:0;" v-if="!connected">Waiting for booth...</p>
        </div>
        <div class="status-indicator" @click="$emit('retry')" :style="{ cursor: !connected ? 'pointer' : 'default' }">
          <span class="pulse-dot" :class="{ 'active': connected }"></span>
          {{ connected ? 'Connected' : 'Disconnected' }}
        </div>
      </div>
      
      <div v-if="!connected && event.otp" class="otp-box" style="margin-bottom: 1rem;">
        <p class="card-desc">Enter OTP in booth app:</p>
        <div class="otp-code-row">
          <span class="otp-code">{{ event.otp }}</span>
          <button @click="copyOtp" class="app-btn app-btn--secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">{{ otpCopied ? 'Copied' : 'Copy' }}</button>
        </div>
      </div>

      <div class="stats-grid" v-if="totalSessions !== undefined" :style="{ marginTop: (!connected && event.otp) ? '0' : '1rem', marginBottom: '1.25rem' }">
        <div class="stat-card">
          <span class="stat-value">{{ totalSessions }}</span>
          <span class="stat-label">Sessions</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ totalPhotos }}</span>
          <span class="stat-label">Photos</span>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <button class="app-btn full-width-btn" :class="actionButtonClass" @click="boothAction" :disabled="!canAct">
          {{ actionButtonLabel }}
        </button>

        <button class="app-btn full-width-btn" :class="paused ? 'btn-resume' : 'btn-pause'" @click="togglePause(!paused)" :disabled="!connected">
          {{ paused ? 'Resume Booth' : 'Pause Booth' }}
        </button>

        <button class="app-btn app-btn--secondary full-width-btn" @click="triggerReshot" :disabled="!connected">Retake Photo</button>
      </div>
    </section>

    

  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePhotosStore } from '../stores/photos'
import axios from 'axios'

const props = defineProps<{
  connected: boolean
  eventId: string
  sendMessage: (event: string, data: any) => void
  boothState: string | null
  show?: boolean
  totalSessions?: number
  totalPhotos?: number
}>()

const emit = defineEmits<{ close: []; retry: [] }>()

const router = useRouter()
const route = useRoute()
const photosStore = usePhotosStore()

const event = ref<any>(null)
const paused = ref(false)
const otpCopied = ref(false)
const connectionStatus = computed(() => props.connected ? 'connected' : 'disconnected')

const queuePercent = computed(() => Math.min((photosStore.queueDepth / 10) * 100, 100))

const actionButtonLabel = computed(() => {
  if (props.boothState === 'preview') return 'Return to Main Menu'
  if (props.boothState === 'live') return 'Begin Countdown'
  return 'Start'
})

const canAct = computed(() => {
  return props.connected && props.boothState !== 'capturing' && props.boothState !== 'paused'
})

const actionButtonClass = computed(() => {
  if (props.boothState === 'preview') return 'btn-warning'
  return 'btn-primary'
})

onMounted(async () => {
  try {
    const { data } = await axios.get(`/api/admin/events/${props.eventId}`)
    event.value = data.event
  } catch (err) {
    console.error('Failed to fetch event', err)
  }
})



async function boothAction() {
  if (!canAct.value) return
  if (props.boothState === 'preview') {
    props.sendMessage('booth-go-home', { eventId: props.eventId })
  } else if (props.boothState === 'live') {
    props.sendMessage('booth-capture', { eventId: props.eventId })
  } else {
    props.sendMessage('booth-start', { eventId: props.eventId })
  }
}

function triggerReshot() {
  props.sendMessage('trigger-reshot', { eventId: props.eventId })
}

function togglePause(setPaused: boolean) {
  paused.value = setPaused
  props.sendMessage('booth-pause', { eventId: props.eventId, paused: paused.value })
}


function shareAll() {
  if (navigator.share) {
    navigator.share({
      title: 'Booth Photos',
      text: 'Check out the photo booth!',
      url: window.location.origin,
    })
  }
}

async function endThisEvent() {
  if (!confirm('End this event? The OTP will be invalidated.')) return
  try {
    await axios.post(`/api/admin/events/${props.eventId}/end`)
    const { data } = await axios.get(`/api/admin/events/${props.eventId}`)
    event.value = data.event
  } catch {}
}

function copyOtp() {
  if (!event.value?.otp) return
  navigator.clipboard.writeText(event.value.otp)
  otpCopied.value = true
  setTimeout(() => { otpCopied.value = false }, 2000)
}
</script>


<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
}
.card h2 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.card-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 1rem;
  line-height: 1.3;
}
.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

/* Status */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-error);
}
.pulse-dot.active {
  background: var(--color-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 20%, transparent);
}

.otp-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem;
}
.otp-code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.otp-code {
  font-family: monospace;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.15em;
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.75rem;
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}
.stat-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--color-text-sub);
}

/* Controls */
.settings-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  gap: 1rem;
  flex-wrap: wrap;
}
.field-row:last-child {
  border-bottom: none;
}
.field-row:nth-child(even) {
  background: var(--color-surface-alt);
}

.control-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 120px;
}
.control-info label {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.control-info .sub-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.app-btn {
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  white-space: nowrap;
}
.btn-primary {
  background: var(--color-text);
  color: var(--color-bg);
}
.btn-primary:hover:not(:disabled) {
  background: var(--color-text-muted);
}
.app-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.app-btn--secondary:hover:not(:disabled) {
  background: var(--color-border);
}
.btn-warning {
  background: #ff9800;
  color: #fff;
}
.btn-pause {
  background: #ff9800;
  color: #fff;
}
.btn-resume {
  background: var(--color-success);
  color: #fff;
}
.app-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.focus-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.focus-btn {
  background: var(--color-surface);
  border: none;
  color: var(--color-text-sub);
  padding: 0.375rem 0.625rem;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.focus-active {
  background: var(--color-text);
  color: var(--color-bg);
}

.custom-select {
  width: 100%;
  background: transparent;
  color: var(--color-text);
  border: none;
  font-size: var(--text-sm);
  outline: none;
  cursor: pointer;
}

.focus-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.custom-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.full-width-btn {
  width: 100%;
  justify-content: center;
  text-align: center;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  font-size: var(--text-base);
}
.focus-toggle.full-width-btn .focus-btn {
  flex: 1;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  font-size: var(--text-sm);
}
</style>


