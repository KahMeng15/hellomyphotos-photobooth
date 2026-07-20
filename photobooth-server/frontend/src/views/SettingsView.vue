<template>
  <div class="settings-page">
    <header class="settings-header">
      <button @click="$router.push('/dashboard')" class="btn-ghost">&larr; Dashboard</button>
      <h1>Booth Settings</h1>
      <div></div>
    </header>

    <div class="settings-body">
      <section class="card">
        <h2>Capture</h2>

        <div class="field">
          <label>Photos per session</label>
          <div class="field-row">
            <input type="range" min="1" max="4" v-model.number="settings.photoCount" />
            <span class="value">{{ settings.photoCount }}</span>
          </div>
        </div>

        <div class="field">
          <label>Countdown (seconds)</label>
          <div class="field-row">
            <input type="range" min="3" max="10" v-model.number="settings.countdown" />
            <span class="value">{{ settings.countdown }}s</span>
          </div>
        </div>

        <div class="field">
          <label>Gap between shots (seconds)</label>
          <div class="field-row">
            <input type="range" min="0" max="5" v-model.number="settings.captureInterval" />
            <span class="value">{{ settings.captureInterval }}s</span>
          </div>
        </div>
      </section>

      <div class="actions">
        <button @click="saveAndClose" class="btn-primary">Save</button>
        <button @click="cancelChanges" class="btn-cancel">Cancel</button>
        <span v-if="saved" class="saved-msg">Saved</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import axios from 'axios'
import { useWebSocket } from '../composables/useWebSocket'

const router = useRouter()
const settings = ref({ photoCount: 4, countdown: 5, captureInterval: 1 })
const originalSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1 })
const saved = ref(false)
const { ws, connect, disconnect } = useWebSocket()

const dirty = computed(() =>
  settings.value.photoCount !== originalSettings.value.photoCount ||
  settings.value.countdown !== originalSettings.value.countdown ||
  settings.value.captureInterval !== originalSettings.value.captureInterval
)

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/admin/settings')
    settings.value = data
    originalSettings.value = { ...data }
  } catch {}

  const socket = connect()
  if (socket) {
    socket.on('settings-updated', (updated: any) => {
      settings.value = { ...settings.value, ...updated }
      originalSettings.value = { ...originalSettings.value, ...updated }
    })
  }
})

onUnmounted(() => {
  disconnect()
})

onBeforeRouteLeave((to, from, next) => {
  if (dirty.value) {
    if (!confirm('You have unsaved changes. Discard them?')) {
      next(false)
      return
    }
  }
  next()
})

async function saveAndClose() {
  saved.value = false
  try {
    await axios.post('/api/admin/settings', settings.value)
    originalSettings.value = { ...settings.value }
    saved.value = true
    router.push('/dashboard')
  } catch (err) {
    console.error('Failed to save settings', err)
  }
}

function cancelChanges() {
  if (dirty.value) {
    if (!confirm('You have unsaved changes. Discard them?')) return
  }
  settings.value = { ...originalSettings.value }
  router.push('/dashboard')
}
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: #0f0f0f;
  color: #fff;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
}

.settings-header h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.settings-body {
  max-width: 600px;
  margin: 2rem auto;
  padding: 0 1.5rem;
}

.card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card h2 {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin: 0 0 1.25rem;
}

.field {
  margin-bottom: 1.25rem;
}

.field label {
  display: block;
  font-size: 0.8125rem;
  color: #aaa;
  margin-bottom: 0.375rem;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.field-row input[type="range"] {
  flex: 1;
  accent-color: #fff;
}

.value {
  font-size: 1rem;
  font-weight: 600;
  min-width: 2.5rem;
  text-align: right;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-primary {
  padding: 0.75rem 2rem;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-ghost {
  background: none;
  border: 1px solid #2a2a2a;
  color: #ccc;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.btn-ghost:hover {
  border-color: #555;
  color: #fff;
}

.btn-cancel {
  padding: 0.75rem 2rem;
  background: transparent;
  color: #888;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 0.9375rem;
  cursor: pointer;
}

.saved-msg {
  font-size: 0.8125rem;
  color: #4caf50;
}
</style>
