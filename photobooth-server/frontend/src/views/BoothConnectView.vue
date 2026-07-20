<template>
  <div class="connect-page">
    <div class="connect-card">
      <h1>hellomyphoto</h1>
      <h2>Connect Photobooth</h2>
      <p>Enter the 6-digit OTP shown on the operator dashboard to link this photobooth to an event.</p>

      <div class="otp-input-group">
        <input
          v-model="otp"
          type="text"
          maxlength="6"
          placeholder="000000"
          class="otp-input"
          @keyup.enter="connectBooth"
          :disabled="connected"
        />
      </div>

      <div v-if="error" class="status error">{{ error }}</div>
      <div v-if="connected" class="status success">Connected to <strong>{{ connectedEvent }}</strong></div>
      <div v-if="connecting" class="status info">Connecting...</div>

      <div class="actions">
        <button v-if="!connected" @click="connectBooth" class="btn-primary" :disabled="otp.length !== 6 || connecting">
          Connect
        </button>
        <button v-if="connected" @click="disconnectBooth" class="btn-secondary">
          Disconnect
        </button>
      </div>

      <div v-if="connected" class="booth-links">
        <p>The booth is linked and ready. The OTP <strong>{{ otp }}</strong> is stored locally for uploads.</p>
        <p>You can now close this page — the photobooth will use the stored OTP for authentication.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import axios from 'axios'

const otp = ref('')
const connecting = ref(false)
const connected = ref(false)
const connectedEvent = ref('')
const error = ref('')

let socket: any = null

function connectBooth() {
  if (otp.value.length !== 6 || connecting.value) return

  connecting.value = true
  error.value = ''

  socket = io({
    auth: { otp: otp.value },
    transports: ['websocket', 'polling'],
  })

  socket.on('authenticated', async (data: any) => {
    connected.value = true
    connecting.value = false
    connectedEvent.value = data.eventId
    localStorage.setItem('boothOtp', otp.value)
    try {
      const { data: settings } = await axios.get('/api/booth/settings')
      await axios.post('/api/booth/settings', { ...settings, otp: otp.value })
    } catch {} // settings save is best-effort
  })

  socket.on('connect_error', (err: any) => {
    connecting.value = false
    error.value = err.message === 'Invalid or expired OTP'
      ? 'Invalid or expired OTP. Please check with the operator.'
      : 'Connection failed. Is the server running?'
  })

  socket.on('disconnect', () => {
    connected.value = false
    connectedEvent.value = ''
  })
}

function disconnectBooth() {
  socket?.disconnect()
  socket = null
  connected.value = false
  connectedEvent.value = ''
  otp.value = ''
  localStorage.removeItem('boothOtp')
}

onUnmounted(() => {
  // Don't disconnect on unmount — user might navigate away
})
</script>

<style scoped>
.connect-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
  padding: 1rem;
}

.connect-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 2rem;
  max-width: 400px;
  width: 100%;
  text-align: center;
}

.connect-card h1 {
  font-size: 1.25rem;
  margin: 0 0 1rem;
}

.connect-card h2 {
  font-size: 1rem;
  margin: 0 0 0.5rem;
  color: #888;
}

.connect-card p {
  font-size: 0.875rem;
  color: #666;
  margin: 0 0 1.5rem;
}

.otp-input-group {
  margin-bottom: 1rem;
}

.otp-input {
  width: 100%;
  max-width: 200px;
  text-align: center;
  font-size: 2rem;
  font-family: monospace;
  letter-spacing: 0.75rem;
  padding: 0.75rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #fff;
  outline: none;
}

.otp-input:focus {
  border-color: #2196F3;
}

.status {
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.status.error {
  color: #f44336;
}

.status.success {
  color: #4caf50;
}

.status.info {
  color: #2196F3;
}

.actions {
  margin-bottom: 1rem;
}

.btn-primary {
  background: #2196F3;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.625rem 1.5rem;
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
  padding: 0.625rem 1.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.booth-links {
  font-size: 0.8125rem;
  color: #888;
}
</style>
