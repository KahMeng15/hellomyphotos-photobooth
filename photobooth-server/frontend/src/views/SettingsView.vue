<template>
  <div class="settings-page">
    <header class="settings-header">
      <button @click="router.back()" class="btn-back" title="Back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h1>Default Settings</h1>
      <div></div>
    </header>

    <div class="settings-body">
      <section class="card">
        <h2>Server Information</h2>
        <p class="card-desc">Read-only network and path configuration loaded from the server's .env file.</p>
        <div class="settings-box">
          <div class="field-row">
            <label>Cookie Domain</label>
            <div class="value">{{ serverInfo.domain || 'Not set' }}</div>
          </div>
          <div class="field-row">
            <label>Cookie Base Path</label>
            <div class="value">{{ serverInfo.path || '/' }}</div>
          </div>
        </div>
      </section>

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
          <div class="field-row">
            <label>Organizer</label>
            <input type="text" v-model="settings.organizer" class="str-input" style="width: 150px; text-align: left;" />
          </div>
          <div class="field-row" style="flex-direction: column; align-items: stretch; gap: 0.5rem; padding: 0.75rem;">
            <label style="align-self: flex-start;">Contact Info</label>
            <textarea v-model="settings.contactInfo" class="str-input" style="width: 100%; height: 60px; text-align: left;"></textarea>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>DSLR Exposure Defaults</h2>
        <p class="card-desc">Defaults for DSLR manual exposure settings. Use "auto" to let the camera decide.</p>

        <div class="settings-box">
          <div class="field-row">
            <label>Shutter</label>
            <div class="slider-wrapper">
              <input type="range" min="0" :max="shutterChoices.length - 1" :value="shutterChoices.indexOf(settings.dslrShutterSpeed) >= 0 ? shutterChoices.indexOf(settings.dslrShutterSpeed) : 0" @input="settings.dslrShutterSpeed = shutterChoices[parseInt(($event.target as HTMLInputElement).value)]" class="range-input" />
              <span class="slider-val">{{ settings.dslrShutterSpeed || 'auto' }}</span>
            </div>
          </div>
          <div class="field-row">
            <label>ISO</label>
            <div class="slider-wrapper">
              <input type="range" min="0" :max="isoChoices.length - 1" :value="isoChoices.indexOf(settings.dslrIso) >= 0 ? isoChoices.indexOf(settings.dslrIso) : 0" @input="settings.dslrIso = isoChoices[parseInt(($event.target as HTMLInputElement).value)]" class="range-input" />
              <span class="slider-val">{{ settings.dslrIso || 'auto' }}</span>
            </div>
          </div>
            <div class="field-row">
              <label>Aperture</label>
              <div class="slider-wrapper">
                <input type="range" min="0" :max="apertureChoices.length - 1" :value="apertureChoices.indexOf(settings.dslrAperture) >= 0 ? apertureChoices.indexOf(settings.dslrAperture) : 0" @input="settings.dslrAperture = apertureChoices[parseInt(($event.target as HTMLInputElement).value)]" class="range-input" />
                <span class="slider-val">{{ settings.dslrAperture || 'auto' }}</span>
              </div>
            </div>
            <div class="field-row">
              <label>Focus Mode</label>
              <div class="focus-toggle">
                <button :class="['focus-btn', settings.dslrFocusMode === 'auto' ? 'focus-active' : '']" @click="settings.dslrFocusMode = 'auto'">AF</button>
                <button :class="['focus-btn', settings.dslrFocusMode === 'manual' ? 'focus-active' : '']" @click="settings.dslrFocusMode = 'manual'">MF</button>
              </div>
            </div>
          </div>
        </section>

      <div class="actions">
        <button @click="saveAndClose" class="btn-primary">Save</button>
        <button @click="cancelChanges" class="btn-cancel">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import axios from 'axios'
import { toast } from 'vue3-toastify'

const isoChoices = ['auto', '100', '200', '400', '800', '1600', '3200', '6400']
const shutterChoices = ['auto', '1/30', '1/40', '1/50', '1/60', '1/80', '1/100', '1/125', '1/160', '1/200', '1/250', '1/320', '1/400', '1/500', '1/640', '1/800']
const apertureChoices = ['auto', '2.8', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11']

const router = useRouter()
const settings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', organizer: '', contactInfo: '' })
const originalSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', organizer: '', contactInfo: '' })
const serverInfo = ref({ domain: 'Not set', path: '/' })

const dirty = computed(() =>
  settings.value.photoCount !== originalSettings.value.photoCount ||
  settings.value.countdown !== originalSettings.value.countdown ||
  settings.value.captureInterval !== originalSettings.value.captureInterval ||
  settings.value.postCapturePreview !== originalSettings.value.postCapturePreview ||
  settings.value.dslrIso !== originalSettings.value.dslrIso ||
  settings.value.dslrShutterSpeed !== originalSettings.value.dslrShutterSpeed ||
  settings.value.dslrAperture !== originalSettings.value.dslrAperture ||
  settings.value.dslrFocusMode !== originalSettings.value.dslrFocusMode || settings.value.organizer !== originalSettings.value.organizer || settings.value.contactInfo !== originalSettings.value.contactInfo
)

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/admin/settings/defaults')
    settings.value = data.settings
    originalSettings.value = { ...data.settings }
    if (data.serverInfo) {
      serverInfo.value = data.serverInfo
    }
  } catch (err) {
    toast.error('Failed to load settings')
  }
})

async function saveAndClose() {
  try {
    await axios.put('/api/admin/settings/defaults', settings.value)
    originalSettings.value = { ...settings.value }
    toast.success('Settings saved')
    router.back()
  } catch (err) {
    console.error('Failed to save defaults', err)
    toast.error('Failed to save settings')
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
  position: sticky;
  top: 0;
  z-index: 50;
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
  background: #0f0f0f;
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

.saved-msg {
  font-size: 0.8125rem;
  color: #4caf50;
}
</style>
