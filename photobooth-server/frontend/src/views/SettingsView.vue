<template>
  <div class="settings-page">
    <header class="settings-header">
      <button @click="router.back()" class="btn-ghost">&larr; Back</button>
      <h1>Default Settings</h1>
      <div></div>
    </header>

    <div class="settings-body">
      <section class="card">
        <h2>Capture Defaults</h2>
        <p class="card-desc">These defaults apply to all new events. You can override them per-event.</p>

        <div class="settings-box">
          <div class="field-row">
            <label>Photos per session</label>
            <input type="number" min="1" max="4" v-model.number="settings.photoCount" class="num-input" />
          </div>
          <div class="field-row">
            <label>Countdown</label>
            <input type="number" min="3" max="10" v-model.number="settings.countdown" class="num-input" />
          </div>
          <div class="field-row">
            <label>Gap between shots</label>
            <input type="number" min="0" max="5" v-model.number="settings.captureInterval" class="num-input" />
          </div>
          <div class="field-row">
            <label>Preview</label>
            <input type="number" min="1" max="5" v-model.number="settings.postCapturePreview" class="num-input" />
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

const router = useRouter()
const settings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2 })
const originalSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2 })
const saved = ref(false)

const dirty = computed(() =>
  settings.value.photoCount !== originalSettings.value.photoCount ||
  settings.value.countdown !== originalSettings.value.countdown ||
  settings.value.captureInterval !== originalSettings.value.captureInterval ||
  settings.value.postCapturePreview !== originalSettings.value.postCapturePreview
)

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/admin/settings/defaults')
    settings.value = data.settings
    originalSettings.value = { ...data.settings }
  } catch {}
})

async function saveAndClose() {
  saved.value = false
  try {
    await axios.put('/api/admin/settings/defaults', settings.value)
    originalSettings.value = { ...settings.value }
    saved.value = true
    router.back()
  } catch (err) {
    console.error('Failed to save defaults', err)
  }
}

function cancelChanges() {
  if (dirty.value) {
    if (!confirm('You have unsaved changes. Discard them?')) return
  }
  settings.value = { ...originalSettings.value }
  router.back()
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
  margin: 0 0 0.25rem;
}

.card-desc {
  font-size: 0.75rem;
  color: #666;
  margin: 0 0 1.25rem;
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
  font-size: 0.875rem;
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

.field-desc {
  font-size: 0.75rem;
  color: #666;
  margin: 0 0 0.5rem;
}

.input-otp {
  font-size: 1.5rem;
  font-family: monospace;
  letter-spacing: 0.5rem;
  padding: 0.625rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #fff;
  width: 200px;
  text-align: center;
  outline: none;
}

.input-otp:focus {
  border-color: #555;
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
