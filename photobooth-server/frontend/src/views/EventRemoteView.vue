<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Booth Remote" />

    <div class="app-page-layout settings-container">
      
      <!-- Connection Status Card -->
      <section class="card" :class="{ 'card-connected': boothConnected, 'card-disconnected': !boothConnected }">
        <div class="card-header-flex">
          <div>
            <h2>Booth Status</h2>
            <p class="card-desc" style="margin-bottom:0;">
              {{ boothConnected ? 'Remote link established. Ready for commands.' : 'Waiting for booth to connect...' }}
            </p>
          </div>
          <div class="status-indicator">
            <span class="pulse-dot" :class="{ 'active': boothConnected }"></span>
            {{ boothConnected ? 'Connected' : 'Disconnected' }}
          </div>
        </div>

        <div v-if="!boothConnected && event.otp" class="otp-box">
          <p class="card-desc">Enter this OTP in the photobooth app to connect:</p>
          <div class="otp-code-row">
            <span class="otp-code">{{ event.otp }}</span>
            <button @click="copyOtp" class="app-btn app-btn--secondary">{{ otpCopied ? 'Copied!' : 'Copy' }}</button>
          </div>
        </div>
      </section>

      <!-- Remote Controls Card -->
      <section class="card" v-if="boothConnected">
        <h2>Action Controls</h2>
        <p class="card-desc">Trigger booth functions remotely.</p>
        
        <div class="settings-box control-box">
          
          <div class="field-row">
            <div class="control-info">
              <label>Trigger Capture</label>
              <span class="sub-label">Force start a new photo session.</span>
            </div>
            <button class="app-btn app-btn--primary" @click="triggerAction('capture')">Start Session</button>
          </div>

          <div class="field-row">
            <div class="control-info">
              <label>Pause Booth</label>
              <span class="sub-label">Lock the booth screen temporarily.</span>
            </div>
            <div class="focus-toggle">
              <button :class="['focus-btn', boothState === 'paused' ? 'focus-active' : '']" @click="triggerAction('pause')">PAUSE</button>
              <button :class="['focus-btn', boothState !== 'paused' ? 'focus-active' : '']" @click="triggerAction('resume')">RESUME</button>
            </div>
          </div>
          
          <div class="field-row">
            <div class="control-info">
              <label>Retake Photo</label>
              <span class="sub-label">Trigger a reshot if something went wrong.</span>
            </div>
            <button class="app-btn app-btn--secondary" @click="triggerReshot">Retake</button>
          </div>
          
          <div class="field-row">
            <div class="control-info">
              <label>Return to Home</label>
              <span class="sub-label">Cancel current session and go to start.</span>
            </div>
            <button class="app-btn app-btn--secondary" @click="triggerAction('go-home')">Go Home</button>
          </div>

        </div>
      </section>
      
      <!-- Frame Override Card -->
      <section class="card" v-if="boothConnected">
        <h2>Frame Override</h2>
        <p class="card-desc">Force the booth to use a specific frame.</p>
        <div class="settings-box control-box" style="padding: 1rem 1.25rem;">
          <select v-model="selectedFrameId" @change="overrideFrame" class="custom-select" style="width: 100%;">
            <option value="">No Override (User chooses)</option>
            <option v-for="frame in frames" :key="frame.id" :value="frame.id">{{ frame.name }}</option>
          </select>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import AppTopNav from '../components/ui/AppTopNav.vue'
import { useWebSocket } from '../composables/useWebSocket'

const router = useRouter()
const route = useRoute()
const eventId = computed(() => route.params.id as string)

const event = ref<any>(null)
const frames = ref<any[]>([])
const selectedFrameId = ref('')

const boothConnected = ref(false)
const boothState = ref('idle')
const otpCopied = ref(false)

const { connect: connectWs, disconnect: disconnectWs, subscribe, ws, sendMessage } = useWebSocket()

onMounted(async () => {
  try {
    const [{ data: evtData }, { data: framesData }] = await Promise.all([
      axios.get(`/api/admin/events/${eventId.value}`),
      axios.get(`/api/admin/events/${eventId.value}/frames`)
    ])
    event.value = evtData.event
    frames.value = framesData.frames.filter((f: any) => !f.disabled)
  } catch (err) {
    console.error('Failed to load event data', err)
  }

  const socket = connectWs()
  if (socket) {
    if (socket.connected) {
      subscribe(eventId.value)
    } else {
      socket.on('connect', () => subscribe(eventId.value))
    }
    socket.on('booth-connected', (payload) => {
      if (payload.eventId === eventId.value) {
        boothConnected.value = payload.connected
      }
    })
    socket.on('booth-state', (payload) => {
      if (payload.eventId === eventId.value) {
        boothState.value = payload.state
      }
    })
  }
})

onUnmounted(() => {
  disconnectWs()
})

async function copyOtp() {
  if (event.value?.otp) {
    await navigator.clipboard.writeText(event.value.otp)
    otpCopied.value = true
    setTimeout(() => otpCopied.value = false, 2000)
  }
}

function triggerAction(action: string) {
  sendMessage('booth-command', { eventId: eventId.value, command: { type: action } })
  if (action === 'pause') boothState.value = 'paused'
  if (action === 'resume') boothState.value = 'idle'
}

function triggerReshot() {
  sendMessage('trigger-reshot', { eventId: eventId.value })
}

function overrideFrame() {
  sendMessage('frame-override', { eventId: eventId.value, frameId: selectedFrameId.value })
}
</script>

<style scoped>
.page-wrapper {
  background: var(--color-bg);
  min-height: 100vh;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
}
.settings-container {
  max-width: 800px;
  margin: 0 auto;
}

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.card h2 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.card-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 1.25rem;
}
.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

/* Status Indicator */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}
.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-error);
}
.pulse-dot.active {
  background: var(--color-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-success) 20%, transparent);
}

.otp-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  margin-top: 1rem;
}
.otp-code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.otp-code {
  font-family: monospace;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: 0.2em;
}

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
  padding: 1.25rem;
  border-bottom: 1px solid var(--color-border);
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
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all 0.2s;
}
.app-btn--primary {
  background: var(--color-text);
  color: var(--color-bg);
  border: 1px solid var(--color-text);
}
.app-btn--primary:hover {
  background: var(--color-text-muted);
}
.app-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.app-btn--secondary:hover {
  background: var(--color-border);
}

.focus-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  width: max-content;
}
.focus-btn {
  background: var(--color-surface);
  border: none;
  color: var(--color-text-sub);
  padding: 0.375rem 0.75rem;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.focus-active {
  background: var(--color-border);
  color: var(--color-text);
}

.custom-select {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  outline: none;
}
.custom-select:focus {
  border-color: var(--color-text-sub);
}
</style>
