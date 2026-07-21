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
      <h3>Event Settings</h3>
      <div class="control-field">
        <label>Photos per session (1-4)</label>
        <input type="range" min="1" max="4" v-model.number="eventSettings.photoCount" />
        <span class="range-value">{{ eventSettings.photoCount }}</span>
      </div>
      <div class="control-field">
        <label>Countdown (3-10s)</label>
        <input type="range" min="3" max="10" v-model.number="eventSettings.countdown" />
        <span class="range-value">{{ eventSettings.countdown }}s</span>
      </div>
      <div class="control-field">
        <label>Interval (0-5s)</label>
        <input type="range" min="0" max="5" v-model.number="eventSettings.captureInterval" />
        <span class="range-value">{{ eventSettings.captureInterval }}s</span>
      </div>
      <div class="control-field">
        <label>Preview (1-5s)</label>
        <input type="range" min="1" max="5" v-model.number="eventSettings.postCapturePreview" />
        <span class="range-value">{{ eventSettings.postCapturePreview }}s</span>
      </div>
      <button @click="saveEventSettings" class="btn-control btn-primary" :disabled="settingsSaving">
        {{ settingsSaving ? 'Saving...' : 'Save Settings' }}
      </button>
      <span v-if="settingsMsg" :class="settingsMsgType === 'success' ? 'msg-success' : 'msg-error'">{{ settingsMsg }}</span>
    </div>

    <div class="panel-section">
      <h3>Processing Queue</h3>
      <div class="queue-bar">
        <div class="queue-fill" :style="{ width: queuePercent + '%' }"></div>
      </div>
      <span class="queue-label">{{ photosStore.queueDepth }} jobs</span>
    </div>

    <div class="panel-section">
      <h3>Quick Actions</h3>
      <button @click="shareAll" class="btn-control btn-secondary">
        Share All
      </button>
      <button @click="goToAdmin" class="btn-control btn-secondary">
        Admin Panel
      </button>
      <button @click="goToBoothConnect" class="btn-control btn-secondary">
        Setup Booth
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
          <h2>Booth Controller</h2>
          <button class="close-btn" @click="$emit('close')">✕</button>
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
            <h3>Event Settings</h3>
            <div class="control-field">
              <label>Photos per session (1-4)</label>
              <input type="range" min="1" max="4" v-model.number="eventSettings.photoCount" />
              <span class="range-value">{{ eventSettings.photoCount }}</span>
            </div>
            <div class="control-field">
              <label>Countdown (3-10s)</label>
              <input type="range" min="3" max="10" v-model.number="eventSettings.countdown" />
              <span class="range-value">{{ eventSettings.countdown }}s</span>
            </div>
            <div class="control-field">
              <label>Interval (0-5s)</label>
              <input type="range" min="0" max="5" v-model.number="eventSettings.captureInterval" />
              <span class="range-value">{{ eventSettings.captureInterval }}s</span>
            </div>
            <div class="control-field">
              <label>Preview (1-5s)</label>
              <input type="range" min="1" max="5" v-model.number="eventSettings.postCapturePreview" />
              <span class="range-value">{{ eventSettings.postCapturePreview }}s</span>
            </div>
            <button @click="saveEventSettings" class="btn-control btn-primary" :disabled="settingsSaving">
              {{ settingsSaving ? 'Saving...' : 'Save Settings' }}
            </button>
            <span v-if="settingsMsg" :class="settingsMsgType === 'success' ? 'msg-success' : 'msg-error'">{{ settingsMsg }}</span>
          </div>

          <div class="panel-section">
            <h3>Processing Queue</h3>
            <div class="queue-bar">
              <div class="queue-fill" :style="{ width: queuePercent + '%' }"></div>
            </div>
            <span class="queue-label">{{ photosStore.queueDepth }} jobs</span>
          </div>

          <div class="panel-section">
            <h3>Quick Actions</h3>
            <button @click="shareAll" class="btn-control btn-secondary">
              Share All
            </button>
            <button @click="goToAdmin" class="btn-control btn-secondary">
              Admin Panel
            </button>
            <button @click="goToBoothConnect" class="btn-control btn-secondary">
              Setup Booth
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
import { useRouter } from 'vue-router'
import { usePhotosStore } from '../stores/photos'
import axios from 'axios'

const props = defineProps<{
  connected: boolean
  eventId: string
  show: boolean
  sendMessage: (event: string, data: any) => void
  boothState: string | null
}>()

const emit = defineEmits<{ close: []; retry: [] }>()

const router = useRouter()
const photosStore = usePhotosStore()

const event = ref<any>(null)
const selectedFrame = ref('')
const paused = ref(false)
const otpCopied = ref(false)
const eventSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2 })
const settingsSaving = ref(false)
const settingsMsg = ref('')
const settingsMsgType = ref<'success' | 'error'>('success')

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
    eventSettings.value = {
      photoCount: data.event.photo_count,
      countdown: data.event.countdown,
      captureInterval: data.event.capture_interval,
      postCapturePreview: data.event.post_capture_preview,
    }
  } catch {}
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

function goToAdmin() {
  router.push('/admin')
}

function goToBoothConnect() {
  window.open('/booth/connect', '_blank')
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

async function saveEventSettings() {
  settingsSaving.value = true
  settingsMsg.value = ''
  try {
    await axios.patch(`/api/admin/events/${props.eventId}`, {
      photoCount: eventSettings.value.photoCount,
      countdown: eventSettings.value.countdown,
      captureInterval: eventSettings.value.captureInterval,
      postCapturePreview: eventSettings.value.postCapturePreview,
    })
    settingsMsg.value = 'Settings saved'
    settingsMsgType.value = 'success'
  } catch {
    settingsMsg.value = 'Failed to save'
    settingsMsgType.value = 'error'
  }
  settingsSaving.value = false
  setTimeout(() => { settingsMsg.value = '' }, 3000)
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
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}

.modal-page {
  background: #1a1a1a;
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #2a2a2a;
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

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

.control-field input[type="range"] {
  width: 100%;
  accent-color: #fff;
  margin: 0.25rem 0;
}

.range-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #ccc;
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

.queue-bar {
  height: 6px;
  background: #2a2a2a;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.375rem;
}

.queue-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s;
  border-radius: 3px;
}

.queue-label {
  font-size: 0.75rem;
  color: #888;
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
