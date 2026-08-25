import os

filepath = 'photobooth-server/frontend/src/views/EventRemoteView.vue'
with open(filepath, 'w') as f:
    f.write("""<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Booth Remote" />

    <div class="app-page-layout settings-container">
      
      <!-- Connection Status -->
      <section class="card" :class="{ 'card-connected': boothConnected, 'card-disconnected': !boothConnected }">
        <div class="card-header-flex">
          <div>
            <h2>Booth Status</h2>
            <p class="card-desc" style="margin-bottom:0;">
              {{ boothConnected ? 'Booth is currently online and ready.' : 'Booth is offline. Remote controls are disabled.' }}
            </p>
          </div>
          <div class="status-indicator">
            <span class="pulse-dot" :class="{ 'active': boothConnected }"></span>
            {{ boothConnected ? 'Connected' : 'Disconnected' }}
          </div>
        </div>
        
        <div v-if="!boothConnected && event.otp" style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--color-border);">
          <p class="card-desc">Share this OTP with the physical booth to connect:</p>
          <div style="display: flex; gap: 1rem; align-items: center;">
            <span style="font-family: monospace; font-size: 1.5rem; letter-spacing: 0.25rem;">{{ event.otp }}</span>
            <AppButton variant="secondary" @click="copyOtp">{{ otpCopied ? 'Copied!' : 'Copy' }}</AppButton>
          </div>
        </div>
      </section>

      <!-- Remote Actions -->
      <section class="card">
        <h2>Remote Actions</h2>
        <p class="card-desc">Trigger actions on the physical booth in real-time.</p>
        <div class="settings-box">
          <div class="field-row">
            <div>
              <label>Resume Session</label>
              <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px;">Unpause the photobooth countdown sequence.</div>
            </div>
            <AppButton variant="primary" @click="resumeBooth" :disabled="!boothConnected || boothState !== 'paused'">Resume</AppButton>
          </div>
          <div class="field-row">
            <div>
              <label>Pause Session</label>
              <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px;">Immediately pause the photobooth.</div>
            </div>
            <AppButton variant="primary" style="background-color: #ff9800;" @click="pauseBooth" :disabled="!boothConnected || boothState === 'paused'">Pause</AppButton>
          </div>
          <div class="field-row">
            <div>
              <label>Trigger Test Shot</label>
              <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px;">Force the booth to take a single immediate test capture.</div>
            </div>
            <AppButton variant="secondary" @click="triggerReshot" :disabled="!boothConnected">Fire Shutter</AppButton>
          </div>
          <div class="field-row">
            <div>
              <label>Reset Booth to Home</label>
              <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px;">Cancel current session and return to idle screen.</div>
            </div>
            <AppButton variant="secondary" @click="goHome" :disabled="!boothConnected">Go Home</AppButton>
          </div>
        </div>
      </section>

      <!-- Danger Zone -->
      <section class="card" style="border-color: var(--color-error); margin-bottom: 3rem;">
        <h2 style="color: var(--color-error);">Danger Zone</h2>
        <p class="card-desc">Destructive actions for this event.</p>
        <div class="settings-box">
          <div class="field-row">
            <div>
              <label style="color: var(--color-text);">End Event</label>
              <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px;">Terminate the event and disconnect all booths. This cannot be undone.</div>
            </div>
            <AppButton variant="primary" style="background-color: var(--color-error);" @click="endEvent">End Event</AppButton>
          </div>
        </div>
      </section>
      
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppTopNav from '../components/ui/AppTopNav.vue'
import AppButton from '../components/ui/AppButton.vue'
import { useWebSocket } from '../composables/useWebSocket'
import axios from 'axios'
import { toast } from 'vue3-toastify'

const router = useRouter()
const route = useRoute()
const eventId = computed(() => route.params.id as string)

const event = ref<any>(null)
const boothConnected = ref(false)
const boothState = ref('idle')
const otpCopied = ref(false)

const { connect: connectWs, subscribe, sendMessage } = useWebSocket()

onMounted(async () => {
  try {
    const { data } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = data.event
  } catch (err) {
    toast.error('Failed to load event')
  }

  const socket = connectWs()
  if (socket) {
    subscribe(eventId.value)
    socket.on('booth-connected', (payload) => {
      if (payload.eventId === eventId.value) boothConnected.value = payload.connected
    })
    socket.on('booth-state', (payload) => {
      if (payload.eventId === eventId.value) boothState.value = payload.state
    })
  }
})

function pauseBooth() {
  sendMessage('booth-command', { eventId: eventId.value, command: { type: 'booth-pause', paused: true } })
}

function resumeBooth() {
  sendMessage('booth-command', { eventId: eventId.value, command: { type: 'booth-pause', paused: false } })
}

function goHome() {
  sendMessage('booth-command', { eventId: eventId.value, command: { type: 'go-home' } })
}

function triggerReshot() {
  sendMessage('trigger-reshot', { eventId: eventId.value })
}

function copyOtp() {
  if (!event.value?.otp) return
  navigator.clipboard.writeText(event.value.otp)
  otpCopied.value = true
  setTimeout(() => { otpCopied.value = false }, 2000)
}

async function endEvent() {
  if (!confirm('End this event? The OTP will be invalidated.')) return
  try {
    await axios.post(`/api/admin/events/${eventId.value}/end`)
    const { data } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = data.event
    toast.success('Event ended')
  } catch (err) {
    toast.error('Failed to end event')
  }
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
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}
.field-row:last-child {
  border-bottom: none;
}
.field-row:nth-child(even) {
  background: var(--color-surface-alt);
}

.field-row label {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

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
</style>
""")

print("Created EventRemoteView.vue")
