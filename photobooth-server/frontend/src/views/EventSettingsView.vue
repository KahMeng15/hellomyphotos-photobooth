<template>
  <div class="dashboard page-wrapper" v-if="event">
    <EventTopNav :event="event" currentTitle="Event Settings" />

    <div class="page-content" style="padding: 2rem; display: flex; justify-content: center;">
      <div class="settings-container">
        <div class="settings-box">
          <div class="field-row" style="margin-bottom:1rem; border-bottom: 1px solid #2a2a2a; padding-bottom: 1rem;">
            <label style="display:block;margin-bottom:0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: #888;">Event Name</label>
            <input type="text" v-model="eventSettings.name" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
          </div>
          <div class="field-row" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <label style="display:block;margin-bottom:0.25rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: #888;">Obfuscate Links</label>
              <span style="font-size:0.8rem;color:#888;">Hide original filenames in shared links</span>
            </div>
            <div class="focus-toggle" style="display:flex; background:#2a2a2a; border-radius:100px; padding:2px;">
              <button :class="['focus-btn', eventSettings.obfuscateLinks ? 'focus-active' : '']" @click="eventSettings.obfuscateLinks = true" style="padding:0.25rem 1rem; border-radius:100px; border:none; background:transparent; color:#888; cursor:pointer;">ON</button>
              <button :class="['focus-btn', !eventSettings.obfuscateLinks ? 'focus-active' : '']" @click="eventSettings.obfuscateLinks = false" style="padding:0.25rem 1rem; border-radius:100px; border:none; background:transparent; color:#888; cursor:pointer;">OFF</button>
            </div>
          </div>
          
          <div class="field-row" style="margin-top:1.5rem;">
            <label style="display:block;margin-bottom:0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: #888;">Link Expiry</label>
            <select v-model="eventSettings.expiryType" class="custom-select" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;">
              <option value="none">No Expiry</option>
              <option value="relative">Relative Duration</option>
              <option value="absolute">Specific Date & Time</option>
            </select>
          </div>
          
          <div class="field-row" v-if="eventSettings.expiryType === 'relative'" style="margin-top:1rem;">
            <label style="display:block;margin-bottom:0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: #888;">Expires In (from creation)</label>
            <select v-model="eventSettings.expiryValue" class="custom-select" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;">
              <option value="1_day">1 Day</option>
              <option value="3_days">3 Days</option>
              <option value="1_week">1 Week</option>
              <option value="1_month">1 Month</option>
              <option value="6_months">6 Months</option>
              <option value="1_year">1 Year</option>
            </select>
          </div>
          
          <div class="field-row" v-if="eventSettings.expiryType === 'absolute'" style="margin-top:1rem;">
            <label style="display:block;margin-bottom:0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: #888;">Date & Time</label>
            <input type="datetime-local" v-model="eventSettings.expiryValue" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
          </div>

          <div class="field-row" style="margin-top:1rem;">
            <label style="display:block;margin-bottom:0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: #888;">Organizer</label>
            <input type="text" v-model="eventSettings.organizer" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
          </div>

          <div class="field-row" style="margin-top:1rem;">
            <label style="display:block;margin-bottom:0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: #888;">Contact Info</label>
            <textarea v-model="eventSettings.contactInfo" class="text-input" style="width:100%;height:100px;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;resize:vertical;"></textarea>
          </div>
        </div>

        <div v-if="settingsMsg" :class="['settings-msg', settingsMsgType]" style="margin-top:1rem; padding: 0.75rem; border-radius: 6px; font-weight: 600;" :style="{ background: settingsMsgType === 'success' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)', color: settingsMsgType === 'success' ? '#4caf50' : '#f44336' }">{{ settingsMsg }}</div>

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

const router = useRouter()
const route = useRoute()

const eventId = computed(() => route.params.id as string)
const event = ref<any>(null)

const eventSettings = ref({
  name: '',
  obfuscateLinks: false,
  expiryType: 'none',
  expiryValue: '1_year',
  organizer: '',
  contactInfo: ''
})

const settingsSaving = ref(false)
const settingsMsg = ref('')
const settingsMsgType = ref<'success' | 'error'>('success')

onMounted(async () => {
  try {
    const { data } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = data.event
    const ev = data.event
    eventSettings.value = {
      name: ev.name || '',
      obfuscateLinks: !!ev.obfuscate_links,
      expiryType: ev.expiry_type || 'none',
      expiryValue: ev.expiry_value || '',
      organizer: ev.organizer || '',
      contactInfo: ev.contact_info || ''
    }
  } catch (err) {
    console.error('Failed to load event', err)
  }
})

function goBack() {
  router.push(`/events/${eventId.value}`)
}

async function saveSettings() {
  settingsSaving.value = true
  settingsMsg.value = ''
  try {
    await axios.patch(`/api/admin/events/${eventId.value}`, {
      name: eventSettings.value.name,
      obfuscateLinks: eventSettings.value.obfuscateLinks ? 1 : 0,
      expiryType: eventSettings.value.expiryType,
      expiryValue: eventSettings.value.expiryValue,
      organizer: eventSettings.value.organizer,
      contactInfo: eventSettings.value.contactInfo,
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
.page-wrapper {
  background: #1a1a1a;
  min-height: 100vh;
  color: #fff;
  display: flex;
  flex-direction: column;
}
.settings-container {
  width: 100%;
  max-width: 600px;
  background: #222;
  padding: 2rem;
  border: 1px solid #333;
  border-radius: 8px;
}
</style>
