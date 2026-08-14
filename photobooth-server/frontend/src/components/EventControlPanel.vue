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
  background: #1a1a1a;
  border-left: 1px solid #2a2a2a;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: #0f0f0f;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 100;
  overflow-y: auto;
}

.modal-page {
  background: #0f0f0f;
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
  border-bottom: 1px solid #2a2a2a;
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.back-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-btn:hover { color: #fff; }

.close-btn {
  background: none;
  border: none;
  color: #888;
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
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin: 0 0 0.75rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
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
  color: #888;
  text-transform: none;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected {
  background: #4caf50;
}

.status-dot.disconnected {
  background: #f44336;
}

.otp-section {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.otp-label {
  font-size: 0.6875rem;
  color: #888;
}

.otp-code {
  font-size: 1.25rem;
  font-family: monospace;
  letter-spacing: 0.25rem;
  color: #fff;
}

.btn-tiny {
  background: #2a2a2a;
  color: #ccc;
  border: none;
  border-radius: 4px;
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
  font-size: 0.75rem;
  color: #888;
}

.control-field select {
  padding: 0.5rem;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  background: #111;
  color: #fff;
  font-size: 0.8125rem;
  outline: none;
}

.settings-box {
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
}

.field-row:nth-child(odd) {
  background: #111;
}

.field-row:nth-child(even) {
  background: #191919;
}

.field-row:not(:last-child) {
  border-bottom: 1px solid #252525;
}

.field-row label {
  font-size: 0.8125rem;
  color: #ccc;
  font-weight: 500;
}

.num-input {
  width: 60px;
  padding: 0.375rem 0.5rem;
  border: 1px solid #333;
  border-radius: 6px;
  background: #0f0f0f;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  outline: none;
  text-align: center;
  box-sizing: border-box;
}

.num-input:focus {
  border-color: #666;
  box-shadow: 0 0 0 1px #555;
}

.str-input {
  width: 120px;
  padding: 0.375rem 0.5rem;
  border: 1px solid #333;
  border-radius: 6px;
  background: #0f0f0f;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  outline: none;
  text-align: center;
  box-sizing: border-box;
}

.str-input:focus {
  border-color: #666;
  box-shadow: 0 0 0 1px #555;
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
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  min-width: 50px;
  text-align: right;
}

.custom-select {
  width: 100%;
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 1rem;
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
  border-color: #666;
}

.focus-toggle {
  display: flex;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
}

.focus-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: #111;
  color: #888;
}

.focus-btn.focus-active {
  background: #fff;
  color: #000;
}

.msg-success {
  display: block;
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: #4caf50;
}

.msg-error {
  display: block;
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: #f44336;
}

.btn-control {
  width: 100%;
  padding: 0.625rem;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.btn-control:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-primary {
  background: #2196F3;
  color: #fff;
}

.btn-pause {
  background: #ff9800;
  color: #fff;
}

.btn-resume {
  background: #4caf50;
  color: #fff;
}

.btn-warning {
  background: #ff9800;
  color: #fff;
}

.btn-secondary {
  background: #2a2a2a;
  color: #ccc;
}

.btn-danger {
  background: #3a1a1a;
  color: #f44336;
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
  border: 1px solid #2a2a2a;
  border-radius: 6px;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.stat-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
}

.queue-bar {
  height: 4px;
  background: #2a2a2a;
  border-radius: 3px;
  overflow: hidden;
}

.queue-fill {
  height: 100%;
  background: #4caf50;
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
