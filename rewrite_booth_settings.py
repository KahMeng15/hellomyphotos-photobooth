import os
import re

filepath = 'photobooth-server/frontend/src/views/EventBoothSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

template_new = """<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Booth Settings" />

    <div class="app-page-layout settings-container">
      
      <!-- Connection Status -->
      <section class="card" :class="{ 'card-connected': boothConnected, 'card-disconnected': !boothConnected }">
        <div class="card-header-flex">
          <div>
            <h2>Booth Connection</h2>
            <p class="card-desc" style="margin-bottom:0;">
              {{ boothConnected ? 'Booth is currently online and receiving updates.' : 'Booth is offline. Changes will sync when it reconnects.' }}
            </p>
          </div>
          <div class="status-indicator">
            <span class="pulse-dot" :class="{ 'active': boothConnected }"></span>
            {{ boothConnected ? 'Connected' : 'Disconnected' }}
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Capture Flow</h2>
        <p class="card-desc">Configure the photo sequence and timing defaults.</p>
        <div class="settings-box">
          <div class="field-row">
            <label>Photos per session</label>
            <input type="number" min="1" max="4" v-model.number="eventSettings.photoCount" class="text-input num-input" :disabled="!boothConnected" />
          </div>
          <div class="field-row">
            <label>Countdown (seconds)</label>
            <input type="number" min="3" max="10" v-model.number="eventSettings.countdown" class="text-input num-input" :disabled="!boothConnected" />
          </div>
          <div class="field-row">
            <label>Interval between shots</label>
            <input type="number" min="0" max="5" v-model.number="eventSettings.captureInterval" class="text-input num-input" :disabled="!boothConnected" />
          </div>
          <div class="field-row">
            <label>Post-capture preview</label>
            <input type="number" min="1" max="5" v-model.number="eventSettings.postCapturePreview" class="text-input num-input" :disabled="!boothConnected" />
          </div>
        </div>
      </section>

      <section class="card">
        <h2>DSLR Camera Settings</h2>
        <p class="card-desc">Remote camera overrides (overrides local booth config).</p>
        <div class="settings-box">
          <div class="field-row-col">
            <div class="slider-header">
              <label>Shutter Speed</label>
              <span class="slider-val">{{ eventSettings.dslrShutterSpeed || 'auto' }}</span>
            </div>
            <input type="range" min="0" :max="shutterChoices.length - 1" :value="shutterChoices.indexOf(eventSettings.dslrShutterSpeed) >= 0 ? shutterChoices.indexOf(eventSettings.dslrShutterSpeed) : 0" @input="eventSettings.dslrShutterSpeed = shutterChoices[parseInt(($event.target as HTMLInputElement).value)]" class="range-input" :disabled="!boothConnected" />
          </div>
          
          <div class="field-row-col">
            <div class="slider-header">
              <label>ISO</label>
              <span class="slider-val">{{ eventSettings.dslrIso || 'auto' }}</span>
            </div>
            <input type="range" min="0" :max="isoChoices.length - 1" :value="isoChoices.indexOf(eventSettings.dslrIso) >= 0 ? isoChoices.indexOf(eventSettings.dslrIso) : 0" @input="eventSettings.dslrIso = isoChoices[parseInt(($event.target as HTMLInputElement).value)]" class="range-input" :disabled="!boothConnected" />
          </div>
          
          <div class="field-row-col">
            <div class="slider-header">
              <label>Aperture</label>
              <span class="slider-val">{{ eventSettings.dslrAperture || 'auto' }}</span>
            </div>
            <input type="range" min="0" :max="apertureChoices.length - 1" :value="apertureChoices.indexOf(eventSettings.dslrAperture) >= 0 ? apertureChoices.indexOf(eventSettings.dslrAperture) : 0" @input="eventSettings.dslrAperture = apertureChoices[parseInt(($event.target as HTMLInputElement).value)]" class="range-input" :disabled="!boothConnected" />
          </div>
          
          <div class="field-row-col">
            <div class="slider-header">
              <label>White Balance</label>
              <span class="slider-val">{{ eventSettings.dslrWhiteBalance === 'Manual' ? eventSettings.dslrWhiteBalanceKelvin + 'K' : (eventSettings.dslrWhiteBalance || 'auto') }}</span>
            </div>
            <div class="button-group">
              <button :class="['focus-btn', eventSettings.dslrWhiteBalance === 'Auto' ? 'focus-active' : '']" @click="eventSettings.dslrWhiteBalance = 'Auto'" :disabled="!boothConnected">Auto</button>
              <button :class="['focus-btn', eventSettings.dslrWhiteBalance === 'Manual' ? 'focus-active' : '']" @click="eventSettings.dslrWhiteBalance = 'Manual'" :disabled="!boothConnected">Manual (K)</button>
              <button :class="['focus-btn', eventSettings.dslrWhiteBalance === 'Daylight' ? 'focus-active' : '']" @click="eventSettings.dslrWhiteBalance = 'Daylight'" :disabled="!boothConnected">Daylight</button>
              <button :class="['focus-btn', eventSettings.dslrWhiteBalance === 'Tungsten' ? 'focus-active' : '']" @click="eventSettings.dslrWhiteBalance = 'Tungsten'" :disabled="!boothConnected">Tungsten</button>
            </div>
            <div v-if="eventSettings.dslrWhiteBalance === 'Manual'" style="margin-top: 1rem;">
               <input type="range" min="2500" max="10000" step="100" v-model.number="eventSettings.dslrWhiteBalanceKelvin" class="range-input" :disabled="!boothConnected" />
            </div>
          </div>
          
          <div class="field-row-col">
            <div class="slider-header">
              <label>Focus Mode</label>
            </div>
            <div class="button-group">
              <button :class="['focus-btn', eventSettings.dslrFocusMode === 'auto' ? 'focus-active' : '']" @click="eventSettings.dslrFocusMode = 'auto'" :disabled="!boothConnected">AF (Auto)</button>
              <button :class="['focus-btn', eventSettings.dslrFocusMode === 'manual' ? 'focus-active' : '']" @click="eventSettings.dslrFocusMode = 'manual'" :disabled="!boothConnected">MF (Manual)</button>
            </div>
          </div>
        </div>
      </section>

      <div class="page-actions">
        <AppButton variant="secondary" @click="goBack">Cancel</AppButton>
        <AppButton variant="primary" @click="saveSettings" :disabled="settingsSaving || !boothConnected">
          {{ settingsSaving ? 'Saving...' : 'Save Settings' }}
        </AppButton>
      </div>
    </div>
  </div>
</template>"""

# Replace template
template_match = re.search(r'<template>.*?</template>', content, re.DOTALL)
if template_match:
    content = content[:template_match.start()] + template_new + content[template_match.end():]

# Ensure we import AppButton and useWebSocket
if 'import AppButton' not in content:
    content = content.replace("import AppTopNav from '../components/ui/AppTopNav.vue'", "import AppTopNav from '../components/ui/AppTopNav.vue'\nimport AppButton from '../components/ui/AppButton.vue'\nimport { useWebSocket } from '../composables/useWebSocket'")

# Inject WS logic
ws_logic = """
const { connect: connectWs, disconnect: disconnectWs, subscribe, ws } = useWebSocket()
const boothConnected = ref(false)

onMounted(async () => {
  try {
    const { data } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = data.event
    const ev = data.event
    eventSettings.value = {
      photoCount: ev.photo_count || 4,
      countdown: ev.countdown || 5,
      captureInterval: ev.capture_interval || 1,
      postCapturePreview: ev.post_capture_preview || 2,
      dslrIso: ev.dslr_iso || 'auto',
      dslrShutterSpeed: ev.dslr_shutterspeed || 'auto',
      dslrAperture: ev.dslr_aperture || 'auto',
      dslrFocusMode: ev.dslr_focus_mode || 'auto',
      dslrWhiteBalance: ev.dslr_whitebalance || 'auto',
      dslrWhiteBalanceKelvin: ev.dslr_whitebalance_kelvin || 5200
    }

    const socket = connectWs()
    if (socket) {
      subscribe(eventId.value)
      socket.on('booth-connected', (payload) => {
        if (payload.eventId === eventId.value) {
          boothConnected.value = payload.connected
        }
      })
    }
  } catch (err) {
    console.error('Failed to load event', err)
  }
})
"""

# Replace onMounted
onmounted_match = re.search(r'onMounted\(async \(\) => \{.*?\}\)', content, re.DOTALL)
if onmounted_match:
    content = content[:onmounted_match.start()] + ws_logic + content[onmounted_match.end():]

css_new = """<style scoped>
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
.field-row-col {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.field-row label, .field-row-col label {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.text-input {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  outline: none;
}
.text-input:focus {
  border-color: var(--color-text-sub);
}
.num-input {
  width: 100px;
}
.range-input {
  width: 100%;
  accent-color: var(--color-text);
}

.slider-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.slider-val {
  color: var(--color-text);
  font-weight: 500;
}

.button-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.focus-btn {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text-sub);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all 0.2s;
}
.focus-active {
  background: var(--color-text);
  color: var(--color-bg);
  border-color: var(--color-text);
}
.focus-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
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
</style>"""

css_match = re.search(r'<style scoped>.*?</style>', content, re.DOTALL)
if css_match:
    content = content[:css_match.start()] + css_new + content[css_match.end():]

with open(filepath, 'w') as f:
    f.write(content)

print("Rewrote EventBoothSettingsView.vue")
