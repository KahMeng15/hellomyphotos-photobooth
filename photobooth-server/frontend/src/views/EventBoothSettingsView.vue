<template>
  <div class="dashboard page-wrapper" v-if="event">
    <EventTopNav :event="event" currentTitle="Booth Settings" />

    <div class="page-content" style="padding: 2rem; display: flex; justify-content: center;">
      <div class="settings-container">
        <div class="settings-box">
          <div class="field-row" style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0;">
            <label style="font-weight: 500;">Photos per session</label>
            <input type="number" min="1" max="4" v-model.number="eventSettings.photoCount" style="width: 80px; background: #2a2a2a; border: 1px solid #444; color: #fff; padding: 0.5rem; border-radius: 6px;" />
          </div>
          <div class="field-row" style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0;">
            <label style="font-weight: 500;">Countdown</label>
            <input type="number" min="3" max="10" v-model.number="eventSettings.countdown" style="width: 80px; background: #2a2a2a; border: 1px solid #444; color: #fff; padding: 0.5rem; border-radius: 6px;" />
          </div>
          <div class="field-row" style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0;">
            <label style="font-weight: 500;">Interval</label>
            <input type="number" min="0" max="5" v-model.number="eventSettings.captureInterval" style="width: 80px; background: #2a2a2a; border: 1px solid #444; color: #fff; padding: 0.5rem; border-radius: 6px;" />
          </div>
          <div class="field-row" style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0;">
            <label style="font-weight: 500;">Preview</label>
            <input type="number" min="1" max="5" v-model.number="eventSettings.postCapturePreview" style="width: 80px; background: #2a2a2a; border: 1px solid #444; color: #fff; padding: 0.5rem; border-radius: 6px;" />
          </div>
        </div>
        
        <div class="settings-box" style="margin-top: 2rem;">
          <h3 style="margin-top: 0; font-size: 0.9rem; color: #888; text-transform: uppercase;">DSLR Camera Overrides</h3>
          <div class="field-row" style="display:flex; flex-direction:column; gap:0.5rem; padding: 0.5rem 0;">
            <div style="display:flex; justify-content:space-between;">
              <label style="font-weight: 500;">Shutter</label>
              <span style="color:#888;">{{ eventSettings.dslrShutterSpeed || 'auto' }}</span>
            </div>
            <input type="range" min="0" :max="shutterChoices.length - 1" :value="shutterChoices.indexOf(eventSettings.dslrShutterSpeed) >= 0 ? shutterChoices.indexOf(eventSettings.dslrShutterSpeed) : 0" @input="eventSettings.dslrShutterSpeed = shutterChoices[parseInt(($event.target as HTMLInputElement).value)]" style="width:100%; accent-color:#fff;" />
          </div>
          <div class="field-row" style="display:flex; flex-direction:column; gap:0.5rem; padding: 0.5rem 0;">
            <div style="display:flex; justify-content:space-between;">
              <label style="font-weight: 500;">ISO</label>
              <span style="color:#888;">{{ eventSettings.dslrIso || 'auto' }}</span>
            </div>
            <input type="range" min="0" :max="isoChoices.length - 1" :value="isoChoices.indexOf(eventSettings.dslrIso) >= 0 ? isoChoices.indexOf(eventSettings.dslrIso) : 0" @input="eventSettings.dslrIso = isoChoices[parseInt(($event.target as HTMLInputElement).value)]" style="width:100%; accent-color:#fff;" />
          </div>
          <div class="field-row" style="display:flex; flex-direction:column; gap:0.5rem; padding: 0.5rem 0;">
            <div style="display:flex; justify-content:space-between;">
              <label style="font-weight: 500;">Aperture</label>
              <span style="color:#888;">{{ eventSettings.dslrAperture || 'auto' }}</span>
            </div>
            <input type="range" min="0" :max="apertureChoices.length - 1" :value="apertureChoices.indexOf(eventSettings.dslrAperture) >= 0 ? apertureChoices.indexOf(eventSettings.dslrAperture) : 0" @input="eventSettings.dslrAperture = apertureChoices[parseInt(($event.target as HTMLInputElement).value)]" style="width:100%; accent-color:#fff;" />
          </div>
          <div class="field-row" style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0;">
            <label style="font-weight: 500;">Focus Mode</label>
            <div class="focus-toggle" style="display:flex; background:#2a2a2a; border-radius:100px; padding:2px;">
              <button :class="['focus-btn', eventSettings.dslrFocusMode === 'auto' ? 'focus-active' : '']" @click="eventSettings.dslrFocusMode = 'auto'">AF</button>
              <button :class="['focus-btn', eventSettings.dslrFocusMode === 'manual' ? 'focus-active' : '']" @click="eventSettings.dslrFocusMode = 'manual'">MF</button>
            </div>
          </div>
        </div>



        <button @click="saveSettings" style="margin-top: 1rem; width: 100%; background: #fff; color: #000; border: none; padding: 0.75rem 1.5rem; font-weight: 600; border-radius: 6px; cursor: pointer;" :disabled="settingsSaving">
          {{ settingsSaving ? 'Saving...' : 'Save Settings' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import EventTopNav from '../components/EventTopNav.vue'
import axios from 'axios'
import { toast } from 'vue3-toastify'

const router = useRouter()
const route = useRoute()

const eventId = computed(() => route.params.id as string)
const event = ref<any>(null)

const isoChoices = ['auto', '100', '200', '400', '800', '1600', '3200', '6400']
const shutterChoices = ['auto', '1/30', '1/40', '1/50', '1/60', '1/80', '1/100', '1/125', '1/160', '1/200', '1/250', '1/320', '1/400', '1/500', '1/640', '1/800']
const apertureChoices = ['auto', '2.8', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11']

const eventSettings = ref({
  photoCount: 4,
  countdown: 5,
  captureInterval: 1,
  postCapturePreview: 2,
  dslrIso: 'auto',
  dslrShutterSpeed: 'auto',
  dslrAperture: 'auto',
  dslrFocusMode: 'auto'
})

const settingsSaving = ref(false)

onMounted(async () => {
  try {
    const { data } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = data.event
    const ev = data.event
    eventSettings.value = {
      photoCount: ev.photo_count,
      countdown: ev.countdown,
      captureInterval: ev.capture_interval,
      postCapturePreview: ev.post_capture_preview,
      dslrIso: ev.dslr_iso || 'auto',
      dslrShutterSpeed: ev.dslr_shutterspeed || 'auto',
      dslrAperture: ev.dslr_aperture || 'auto',
      dslrFocusMode: ev.dslr_focus_mode || 'auto',
    }
  } catch (err) {
    console.error('Failed to load event', err)
    toast.error('Failed to load event settings')
  }
})

function goBack() {
  router.push(`/events/${eventId.value}`)
}

async function saveSettings() {
  settingsSaving.value = true
  try {
    await axios.patch(`/api/admin/events/${eventId.value}`, {
      photoCount: eventSettings.value.photoCount,
      countdown: eventSettings.value.countdown,
      captureInterval: eventSettings.value.captureInterval,
      postCapturePreview: eventSettings.value.postCapturePreview,
      dslrIso: eventSettings.value.dslrIso,
      dslrShutterSpeed: eventSettings.value.dslrShutterSpeed,
      dslrAperture: eventSettings.value.dslrAperture,
      dslrFocusMode: eventSettings.value.dslrFocusMode,
    })
    toast.success('Settings saved successfully')
  } catch {
    toast.error('Failed to save settings')
  }
  settingsSaving.value = false
}
</script>

<style scoped>
.page-wrapper {
  background: #0f0f0f;
  min-height: 100vh;
  color: #fff;
  display: flex;
  flex-direction: column;
}
.settings-container {
  width: 100%;
  max-width: 600px;
  background: #0f0f0f;
  padding: 2rem;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
}
.focus-btn {
  padding: 0.25rem 1rem;
  border-radius: 100px;
  border: none;
  background: transparent;
  color: #888;
  cursor: pointer;
}
.focus-btn.focus-active {
  background: #444;
  color: #fff;
}
</style>
