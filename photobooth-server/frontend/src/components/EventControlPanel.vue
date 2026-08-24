<template>
  <aside class="control-panel" v-if="event">
    <div class="panel-section">
      <h3>Booth Status</h3>
      <div class="status-row" @click="$emit('retry')" :class="{ 'status-clickable': !connected }">
        <div :class="['status-dot', connected ? 'connected' : 'disconnected']"></div>
        <span>{{ connected ? 'connected' : 'disconnected' }}</span>
        <span v-if="!connected" class="retry-hint">click to retry</span>
      </div>
      <div v-if="!connected && event.otp" class="otp-section">
        <span class="otp-label">Share this OTP with the booth:</span>
        <span class="otp-code">{{ event.otp }}</span>
        <button @click="copyOtp" class="btn-tiny">{{ otpCopied ? 'Copied!' : 'Copy' }}</button>
      </div>
    </div>

    <div class="panel-section">
      <h3>Controls</h3>

      <div class="control-field">
        <label>Override Frame</label>
        <select v-model="selectedFrame" @change="sendFrameOverride">
          <option value="">No Override</option>
          <option v-for="f in photosStore.frames" :key="f.id" :value="f.id">
            {{ f.name }}
          </option>
        </select>
      </div>

      <button @click="boothAction" class="btn-control" :class="actionButtonClass" :disabled="!canAct">
        {{ actionButtonLabel }}
      </button>
      <button @click="togglePause" class="btn-control" :class="paused ? 'btn-resume' : 'btn-pause'">
        {{ paused ? 'Resume Booth' : 'Pause Booth' }}
      </button>
    </div>

    <div class="panel-section">
      <h3>Sessions</h3>
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-value">{{ totalSessions }}</span>
          <span class="stat-label">groups</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ totalPhotos }}</span>
          <span class="stat-label">photos</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ photosStore.queueDepth }}</span>
          <span class="stat-label">queued</span>
        </div>
      </div>
      <div class="queue-bar">
        <div class="queue-fill" :style="{ width: queuePercent + '%' }"></div>
      </div>
    </div>

    <div class="panel-section">
      <h3>Quick Actions</h3>
      <button @click="shareAll" class="btn-control btn-secondary">
        Share All
      </button>
      <button v-if="event.status === 'active'" @click="endThisEvent" class="btn-control btn-danger">
        End Event
      </button>
    </div>
  </aside>

  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-page">
        <div class="modal-header">
          <button class="back-btn" @click="$emit('close')"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
          <h2>Booth Controller</h2>
        </div>
        <div class="modal-body" v-if="event">
          <div class="panel-section">
            <h3>Booth Status</h3>
            <div class="status-row" @click="$emit('retry')" :class="{ 'status-clickable': !connected }">
              <div :class="['status-dot', connected ? 'connected' : 'disconnected']"></div>
              <span>{{ connected ? 'connected' : 'disconnected' }}</span>
              <span v-if="!connected" class="retry-hint">click to retry</span>
            </div>
            <div v-if="!connected && event.otp" class="otp-section">
              <span class="otp-label">Share this OTP with the booth:</span>
              <span class="otp-code">{{ event.otp }}</span>
              <button @click="copyOtp" class="btn-tiny">{{ otpCopied ? 'Copied!' : 'Copy' }}</button>
            </div>
          </div>

          <div class="panel-section">
            <h3>Controls</h3>

            <div class="control-field">
              <label>Override Frame</label>
              <select v-model="selectedFrame" @change="sendFrameOverride">
                <option value="">No Override</option>
                <option v-for="f in photosStore.frames" :key="f.id" :value="f.id">
                  {{ f.name }}
                </option>
              </select>
            </div>

            <button @click="boothAction" class="btn-control" :class="actionButtonClass" :disabled="!canAct">
              {{ actionButtonLabel }}
            </button>
            <button @click="togglePause" class="btn-control" :class="paused ? 'btn-resume' : 'btn-pause'">
              {{ paused ? 'Resume Booth' : 'Pause Booth' }}
            </button>
          </div>

          <div class="panel-section">
            <button @click="showSettingsModal = true" class="btn-control btn-secondary">
              Event Settings
            </button>
          </div>

          <div class="panel-section">
            <h3>Sessions</h3>
            <div class="stats-row">
              <div class="stat-item">
                <span class="stat-value">{{ totalSessions }}</span>
                <span class="stat-label">groups</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ totalPhotos }}</span>
                <span class="stat-label">photos</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ photosStore.queueDepth }}</span>
                <span class="stat-label">queued</span>
              </div>
            </div>
            <div class="queue-bar">
              <div class="queue-fill" :style="{ width: queuePercent + '%' }"></div>
            </div>
          </div>

          <div class="panel-section">
            <h3>Quick Actions</h3>
            <button @click="shareAll" class="btn-control btn-secondary">
              Share All
            </button>
            <button v-if="event.status === 'active'" @click="endThisEvent" class="btn-control btn-danger">
              End Event
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePhotosStore } from '../stores/photos'
import axios from 'axios'

const props = defineProps<{
  connected: boolean
  eventId: string
  show: boolean
  sendMessage: (event: string, data: any) => void
  boothState: string | null
  totalSessions: number
  totalPhotos: number
}>()

const emit = defineEmits<{ close: []; retry: [] }>()

const router = useRouter()
const route = useRoute()
const photosStore = usePhotosStore()

const event = ref<any>(null)
const selectedFrame = ref('')
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

function sendFrameOverride() {
  props.sendMessage('frame-override', { eventId: props.eventId, frameId: selectedFrame.value })
}

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

async function togglePause() {
  paused.value = !paused.value
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
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 100;
  overflow-y: auto;
}

.modal-page {
  background: var(--color-bg);
  border-radius: 0;
  width: 100%;
  max-width: 800px;
  min-height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.back-btn {
  background: none;
  border: none;
  color: var(--color-text-sub);
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-btn:hover { color: var(--color-text); }

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-sub);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.panel-section h3 {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 0.75rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-sm);
  text-transform: capitalize;
}

.status-clickable {
  cursor: pointer;
}

.status-clickable:hover {
  opacity: 0.8;
}

.retry-hint {
  font-size: 0.6875rem;
  color: var(--color-text-sub);
  text-transform: none;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
}

.status-dot.connected {
  background: var(--color-success);
}

.status-dot.disconnected {
  background: var(--color-error);
}

.otp-section {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.otp-label {
  font-size: 0.6875rem;
  color: var(--color-text-sub);
}

.otp-code {
  font-size: 1.25rem;
  font-family: monospace;
  letter-spacing: 0.25rem;
  color: var(--color-text);
}

.btn-tiny {
  background: var(--color-border);
  color: var(--color-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  cursor: pointer;
  align-self: flex-start;
}

.control-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.control-field label {
  font-size: var(--text-xs);
  color: var(--color-text-sub);
}

.control-field select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  outline: none;
}

.settings-box {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
}

.field-row:nth-child(odd) {
  background: var(--color-surface);
}

.field-row:nth-child(even) {
  background: #191919;
}

.field-row:not(:last-child) {
  border-bottom: 1px solid #252525;
}

.field-row label {
  font-size: var(--text-sm);
  color: var(--color-text);
  font-weight: 500;
}

.num-input {
  width: 60px;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  outline: none;
  text-align: center;
  box-sizing: border-box;
}

.num-input:focus {
  border-color: var(--color-text-muted);
  box-shadow: 0 0 0 1px var(--color-text-muted);
}

.str-input {
  width: 120px;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  outline: none;
  text-align: center;
  box-sizing: border-box;
}

.str-input:focus {
  border-color: var(--color-text-muted);
  box-shadow: 0 0 0 1px var(--color-text-muted);
}

.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  justify-content: flex-end;
}

.range-input {
  flex: 1;
  max-width: 150px;
}

.slider-val {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  min-width: 50px;
  text-align: right;
}

.custom-select {
  width: 100%;
  background: var(--color-border);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  background-image: url('data:image/svg+xml;utf8,<svg fill="%23fff" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>');
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 1.5rem;
  cursor: pointer;
}
.custom-select:focus {
  border-color: var(--color-text-muted);
}

.focus-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.focus-btn {
  padding: 0.375rem 0.75rem;
  font-size: var(--text-xs);
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: var(--color-surface);
  color: var(--color-text-sub);
}

.focus-btn.focus-active {
  background: var(--color-text);
  color: var(--color-bg);
}

.msg-success {
  display: block;
  margin-top: 0.375rem;
  font-size: var(--text-xs);
  color: var(--color-success);
}

.msg-error {
  display: block;
  margin-top: 0.375rem;
  font-size: var(--text-xs);
  color: var(--color-error);
}

.btn-control {
  width: 100%;
  padding: 0.625rem;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.btn-control:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-info);
  color: var(--color-text);
}

.btn-pause {
  background: #ff9800;
  color: var(--color-text);
}

.btn-resume {
  background: var(--color-success);
  color: var(--color-text);
}

.btn-warning {
  background: #ff9800;
  color: var(--color-text);
}

.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.btn-danger {
  background: var(--color-border);
  color: var(--color-error);
}

.stats-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  padding: 0.5rem;
  background: #151515;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}

.stat-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-sub);
}

.queue-bar {
  height: 4px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
}

.queue-fill {
  height: 100%;
  background: var(--color-success);
  transition: width 0.3s;
  border-radius: 3px;
}

@media (max-width: 768px) {
  .control-panel {
    display: none;
  }

  .modal-overlay {
    padding: 0;
    align-items: stretch;
  }

  .modal-page {
    max-width: none;
    max-height: none;
    border-radius: 0;
    height: 100%;
  }
}
</style>
