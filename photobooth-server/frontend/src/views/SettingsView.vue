<template>
  <div class="settings-page">


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
          <div class="field-row-col">
            <label>Organizer</label>
            <input type="text" v-model="settings.organizer" class="str-input" placeholder="Faculty of ..." style="width: 100%; text-align: left;" />
          </div>
          <div class="field-row-col">
            <label>Contact Info</label>
            <textarea v-model="settings.contactInfo" class="str-input" style="width: 100%; height: 60px; text-align: left;"></textarea>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Rate Limits & Security</h2>
        <p class="card-desc">Protect your server from brute force attacks and bandwidth exhaustion. Limits reset every 15 minutes.</p>
        <div class="settings-box">
          <div class="field-row">
            <label>Admin Dashboard Req Limit</label>
            <input type="number" v-model.number="settings.apiRateLimitAdmin" class="num-input" />
          </div>
          <div class="field-row">
            <label>Share Page Req Limit</label>
            <input type="number" v-model.number="settings.apiRateLimitShare" class="num-input" />
          </div>
          <div class="field-row">
            <label>Admin Bandwidth (MB)</label>
            <input type="number" v-model.number="settings.bwLimitAdmin" class="num-input" />
          </div>
          <div class="field-row">
            <label>Share Bandwidth (MB)</label>
            <input type="number" v-model.number="settings.bwLimitShare" class="num-input" />
          </div>
          <div class="field-row">
            <label>Lockout Duration (mins)</label>
            <input type="number" v-model.number="settings.lockoutDuration" class="num-input" />
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

      
      <section class="card">
        <h2>Default Motivational Messages (All Events)</h2>
        
        
        <div class="settings-box">
          <div class="field-row-col">
            <label >Homepage Hero Message</label>
            <textarea v-model="globalMessages.msgHomepage" class="str-input textarea-input" placeholder="One message per line"></textarea>
          </div>
          <div class="field-row-col">
            <label >During Countdown</label>
            <textarea v-model="globalMessages.msgCountdown" class="str-input textarea-input" placeholder="One message per line"></textarea>
          </div>
          <div class="field-row-col">
            <label >After Session (Review Screen)</label>
            <textarea v-model="globalMessages.msgPostSession" class="str-input textarea-input" placeholder="One message per line"></textarea>
          </div>
          <div class="field-row-col">
            <label >Share Page Title</label>
            <textarea v-model="globalMessages.msgShareTitle" class="str-input textarea-input" placeholder="One message per line"></textarea>
          </div>
          <div class="field-row">
            <label>Message Order</label>
            <div class="app-toggle">
              <button :class="['app-toggle-btn', globalMessages.msgOrder === 'random' ? 'app-toggle-active' : '']" @click="globalMessages.msgOrder = 'random'">Random</button>
              <button :class="['app-toggle-btn', globalMessages.msgOrder === 'sequential' ? 'app-toggle-active' : '']" @click="globalMessages.msgOrder = 'sequential'">In Order</button>
            </div>
          </div>
        </div>
      </section>

      <div class="actions">
        <AppButton variant="primary" @click="saveAndClose">Save</AppButton>
        <AppButton variant="secondary" @click="cancelChanges">Cancel</AppButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import AppButton from '../components/ui/AppButton.vue'
import axios from 'axios'
import { toast } from 'vue3-toastify'

const isoChoices = ['auto', '100', '200', '400', '800', '1600', '3200', '6400']
const shutterChoices = ['auto', '1/30', '1/40', '1/50', '1/60', '1/80', '1/100', '1/125', '1/160', '1/200', '1/250', '1/320', '1/400', '1/500', '1/640', '1/800']
const apertureChoices = ['auto', '2.8', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11']

const router = useRouter()
const settings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', organizer: '', contactInfo: '', apiRateLimitAdmin: 500, apiRateLimitShare: 300, bwLimitAdmin: 1000, bwLimitShare: 100, lockoutDuration: 5 })
const originalSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', organizer: '', contactInfo: '', apiRateLimitAdmin: 500, apiRateLimitShare: 300, bwLimitAdmin: 1000, bwLimitShare: 100, lockoutDuration: 5 })
const serverInfo = ref({ domain: 'Not set', path: '/' })

const globalMessages = ref({
  msgHomepage: '',
  msgCountdown: '',
  msgPostSession: '',
  msgShareTitle: '',
  msgOrder: 'random'
})
const origGlobalMessages = ref({
  msgHomepage: '',
  msgCountdown: '',
  msgPostSession: '',
  msgShareTitle: '',
  msgOrder: 'random'
})

function arrayToLines(jsonStr: string) {
  if (!jsonStr) return ''
  try {
    const arr = JSON.parse(jsonStr)
    if (Array.isArray(arr)) return arr.join('\n')
  } catch {}
  return ''
}

function linesToArray(lines: string) {
  const arr = lines.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  return arr.length > 0 ? JSON.stringify(arr) : null
}


const dirty = computed(() =>
  settings.value.photoCount !== originalSettings.value.photoCount ||
  settings.value.countdown !== originalSettings.value.countdown ||
  settings.value.captureInterval !== originalSettings.value.captureInterval ||
  settings.value.postCapturePreview !== originalSettings.value.postCapturePreview ||
  settings.value.dslrIso !== originalSettings.value.dslrIso ||
  settings.value.dslrShutterSpeed !== originalSettings.value.dslrShutterSpeed ||
  settings.value.dslrAperture !== originalSettings.value.dslrAperture ||
  settings.value.dslrFocusMode !== originalSettings.value.dslrFocusMode ||
  settings.value.organizer !== originalSettings.value.organizer ||
  settings.value.contactInfo !== originalSettings.value.contactInfo ||
  settings.value.apiRateLimitAdmin !== originalSettings.value.apiRateLimitAdmin ||
  globalMessages.value.msgHomepage !== origGlobalMessages.value.msgHomepage ||
  globalMessages.value.msgCountdown !== origGlobalMessages.value.msgCountdown ||
  globalMessages.value.msgPostSession !== origGlobalMessages.value.msgPostSession ||
  globalMessages.value.msgShareTitle !== origGlobalMessages.value.msgShareTitle ||
  globalMessages.value.msgOrder !== origGlobalMessages.value.msgOrder ||
  settings.value.apiRateLimitShare !== originalSettings.value.apiRateLimitShare ||
  settings.value.bwLimitAdmin !== originalSettings.value.bwLimitAdmin ||
  settings.value.bwLimitShare !== originalSettings.value.bwLimitShare ||
  settings.value.lockoutDuration !== originalSettings.value.lockoutDuration
)

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/admin/settings/defaults')
    settings.value = data.settings
    originalSettings.value = { ...data.settings }

    try {
      const { data: gData } = await axios.get('/api/admin/global-messages')
      globalMessages.value.msgHomepage = arrayToLines(gData.msgHomepage)
      globalMessages.value.msgCountdown = arrayToLines(gData.msgCountdown)
      globalMessages.value.msgPostSession = arrayToLines(gData.msgPostSession)
      globalMessages.value.msgShareTitle = arrayToLines(gData.msgShareTitle)
      globalMessages.value.msgOrder = gData.msgOrder || 'random'
      origGlobalMessages.value = { ...globalMessages.value }
    } catch {}

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

    if (globalMessages.value.msgHomepage !== origGlobalMessages.value.msgHomepage ||
        globalMessages.value.msgCountdown !== origGlobalMessages.value.msgCountdown ||
        globalMessages.value.msgPostSession !== origGlobalMessages.value.msgPostSession ||
        globalMessages.value.msgShareTitle !== origGlobalMessages.value.msgShareTitle ||
        globalMessages.value.msgOrder !== origGlobalMessages.value.msgOrder) {
      await axios.patch('/api/admin/global-messages', {
        msgHomepage: linesToArray(globalMessages.value.msgHomepage),
        msgCountdown: linesToArray(globalMessages.value.msgCountdown),
        msgPostSession: linesToArray(globalMessages.value.msgPostSession),
        msgShareTitle: linesToArray(globalMessages.value.msgShareTitle),
        msgOrder: globalMessages.value.msgOrder
      })
      origGlobalMessages.value = { ...globalMessages.value }
    }

    toast.success('Settings saved')
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
}
</script>

<style scoped>

.field-row-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.app-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.app-toggle-btn {
  padding: 0.375rem 0.75rem;
  font-size: var(--text-xs);
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: var(--color-surface);
  color: var(--color-text-sub);
}
.app-toggle-btn.app-toggle-active {
  background: var(--color-text);
  color: var(--color-bg);
}

.settings-page {
  /* min-height: 100vh; removed to prevent double scrolling */
  background: var(--color-bg);
  color: var(--color-text);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: var(--color-surface);
  
  position: sticky;
  top: 0;
  z-index: 50;
}

.settings-header h1 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0;
}

.settings-body {
  max-width: 800px;
  margin: 0 auto;
  padding: 0;
}

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card h2 {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 0.25rem;
}

.card-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0 0 1.25rem;
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

.field-row:not(:last-child), .field-row-col:not(:last-child) {
  border-bottom: 1px solid #252525;
}

.field-row-col {
  padding: 0.75rem 0.75rem;
}

.field-row-col label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: var(--text-sm);
  color: var(--color-text);
  font-weight: 500;
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

.field-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0 0 0.5rem;
}

.input-otp {
  font-size: 1.5rem;
  font-family: monospace;
  letter-spacing: 0.5rem;
  padding: 0.625rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  width: 200px;
  text-align: center;
  outline: none;
}

.input-otp:focus {
  border-color: var(--color-text-muted);
}

.value {
  font-size: var(--text-base);
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
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
}

.btn-ghost {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.btn-ghost:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.btn-cancel {
  padding: 0.75rem 2rem;
  background: transparent;
  color: var(--color-text-sub);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  cursor: pointer;
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

.saved-msg {
  font-size: var(--text-sm);
  color: var(--color-success);
  margin-right: 1rem;
}

@media (max-width: 768px) {
  .slider-wrapper {
    width: 100%;
  }
}

.str-input.textarea-input {
  width: 100% !important;
  max-width: 100% !important;
  height: 80px;
  resize: vertical;
  text-align: left !important;
  box-sizing: border-box;
}
.field-row-col {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  padding: 0.75rem 0.75rem;
  
}

.field-row-col label {
  font-weight: 600;
  text-align: left;
  display: block;
  width: 100%;
}

</style>
