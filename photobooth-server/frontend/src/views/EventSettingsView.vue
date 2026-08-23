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

        <div class="settings-box" v-if="authStore.user?.role === 'admin'" style="margin-top: 1.5rem;">
          <h2 style="margin-bottom: 1rem; font-size: 1.1rem;">Operator Access</h2>
          
          <div v-if="!operatorAccessUnlocked" style="text-align: center; padding: 2rem 0;">
            <p style="color: #ccc; margin-bottom: 1rem; font-size: 0.9rem;">Enter your Admin Password to unlock Operator Management.</p>
            <input type="password" v-model="adminUnlockPassword" placeholder="Admin Password" class="text-input" style="width: 100%; max-width: 300px; background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px; margin-bottom: 1rem;" />
            <br>
            <button @click="unlockOperatorAccess" class="btn-primary" style="padding: 0.5rem 1.5rem;">Unlock</button>
          </div>

          <div v-else>
            <p style="color: #ccc; margin-bottom: 1rem; font-size: 0.9rem;">Manage dedicated operator accounts for this event.</p>
            
            <div style="background: #2a2a2a; border-radius: 6px; padding: 1rem; margin-bottom: 1rem;">
              <h3 style="font-size: 0.9rem; margin-bottom: 0.5rem;">Add New Operator</h3>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <input v-model="newOperatorName" placeholder="Operator Name (e.g. Attendant A)" class="text-input" style="flex: 1; min-width: 200px; background:#1f1f1f;color:#fff;border:1px solid #444;padding:0.5rem;border-radius:4px;" />
                <input v-model="newOperatorPassword" placeholder="Set Password" class="text-input" style="flex: 1; min-width: 150px; background:#1f1f1f;color:#fff;border:1px solid #444;padding:0.5rem;border-radius:4px;" />
                <button @click="addOperator" class="btn-primary" style="padding: 0.5rem 1rem;">Add</button>
              </div>
              <div v-if="lastAddedOperator" style="margin-top: 1rem; background: #333; padding: 1rem; border-radius: 6px; border: 1px solid #444;">
                <p style="font-size: 0.85rem; margin-bottom: 0.5rem; color: #4ade80;">Successfully created! Save these details now (the password won't be shown again):</p>
                <div style="font-family: monospace; font-size: 0.85rem; color: #ccc; margin-bottom: 0.5rem;">
                  <div>Name: {{ lastAddedOperator.name }}</div>
                  <div>Link: {{ lastAddedOperator.link }}</div>
                  <div>Password: {{ lastAddedOperator.password }}</div>
                </div>
                <button @click="copyFullMessage" class="btn-secondary btn-sm" style="width: 100%;">Copy Full Message</button>
              </div>
            </div>

            <table v-if="operators.length > 0" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid #444;">
                  <th style="padding: 0.5rem; color: #888; font-size: 0.8rem;">Name</th>
                  <th style="padding: 0.5rem; color: #888; font-size: 0.8rem;">Link</th>
                  <th style="padding: 0.5rem; color: #888; font-size: 0.8rem;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="op in operators" :key="op.id" style="border-bottom: 1px solid #333;">
                  <td style="padding: 0.75rem 0.5rem;">{{ op.name }}</td>
                  <td style="padding: 0.75rem 0.5rem;">
                    <div style="display:flex; gap:0.5rem;">
                      <input type="text" readonly :value="getOperatorLink(op.access_token)" @click="$event.target.select()" style="font-family: monospace; background: #222; border: 1px solid #444; padding: 0.25rem; border-radius: 4px; color: #fff; width: 200px;" />
                    </div>
                  </td>
                  <td style="padding: 0.75rem 0.5rem;">
                    <div style="display:flex; gap:0.5rem;">
                      <button @click="copyOperatorLink(op)" class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Copy</button>
                      <button @click="deleteOperator(op.id)" class="btn-icon" style="color: #ff4444;" title="Delete Operator">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else style="color: #888; text-align: center; padding: 1rem;">No operators created yet.</p>
          </div>
        </div>


        <button @click="saveSettings" style="margin-top: 1.5rem; width: 100%; background: #fff; color: #000; border: none; padding: 0.75rem 1.5rem; font-weight: 600; border-radius: 6px; cursor: pointer;" :disabled="settingsSaving">
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

import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const eventId = computed(() => route.params.id as string)
const event = ref<any>(null)

const operatorAccessUnlocked = ref(false)
const adminUnlockPassword = ref('')
const operators = ref<any[]>([])
const newOperatorName = ref('')
const newOperatorPassword = ref('')

async function fetchOperators() {
  try {
    const { data } = await axios.get(`/api/admin/events/${eventId.value}/operators`)
    operators.value = data.operators
  } catch (err: any) {
    toast.error('Failed to load operators')
  }
}

async function unlockOperatorAccess() {
  try {
    await axios.post('/api/admin/verify-password', { password: adminUnlockPassword.value })
    operatorAccessUnlocked.value = true
    toast.success('Unlocked')
    await fetchOperators()
    // auto-generate a readable default password
    newOperatorPassword.value = Math.random().toString(36).slice(-8)
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Invalid password')
  }
}

const lastAddedOperator = ref<any>(null)

async function addOperator() {
  if (!newOperatorName.value || !newOperatorPassword.value) {
    toast.error('Name and Password required')
    return
  }
  const pwdToSave = newOperatorPassword.value
  try {
    await axios.post(`/api/admin/events/${eventId.value}/operators`, {
      name: newOperatorName.value,
      operatorPassword: pwdToSave,
      adminPassword: adminUnlockPassword.value
    })
    toast.success('Operator added')
    await fetchOperators()
    
    // Find the newly added operator to get its token
    const newOp = operators.value.find(o => o.name === newOperatorName.value)
    
    lastAddedOperator.value = {
      name: newOperatorName.value,
      password: pwdToSave,
      link: getOperatorLink(newOp?.access_token || '')
    }

    newOperatorName.value = ''
    newOperatorPassword.value = Math.random().toString(36).slice(-8)
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to add operator')
  }
}

async function copyFullMessage() {
  if (!lastAddedOperator.value) return
  const text = `Operator Name: ${lastAddedOperator.value.name}\nLogin Link: ${lastAddedOperator.value.link}\nPassword: ${lastAddedOperator.value.password}`
  await navigator.clipboard.writeText(text)
  toast.success('Full message copied to clipboard')
}

async function deleteOperator(operatorId: string) {
  if (!confirm('Are you sure you want to revoke this operator?')) return
  try {
    await axios.delete(`/api/admin/events/${eventId.value}/operators/${operatorId}`, {
      data: { adminPassword: adminUnlockPassword.value }
    })
    toast.success('Operator deleted')
    await fetchOperators()
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to delete operator')
  }
}

function getOperatorLink(token: string) {
  const base = window.location.origin
  // If deployed in a subdirectory, router base is needed. Let's use window.location.href parsing:
  const appRoot = window.location.href.split('/events')[0]
  return `${appRoot}/operator/${token}`
}

async function copyOperatorLink(op: any) {
  try {
    const link = getOperatorLink(op.access_token)
    // We cannot copy the password since it is hashed! We should probably show the password when created, or just tell them to copy it then.
    // Actually, since we can't get the password from the DB (it's hashed), the "Copy Info" is mostly the link and name.
    const text = `Operator Name: ${op.name}\nLogin Link: ${link}`
    await navigator.clipboard.writeText(text)
    toast.success('Link copied to clipboard')
  } catch {
    toast.error('Failed to copy')
  }
}

const eventSettings = ref({
  name: '',
  obfuscateLinks: false,
  expiryType: 'none',
  expiryValue: '1_year',
  organizer: '',
  contactInfo: ''
})

const settingsSaving = ref(false)

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
      name: eventSettings.value.name,
      obfuscateLinks: eventSettings.value.obfuscateLinks ? 1 : 0,
      expiryType: eventSettings.value.expiryType,
      expiryValue: eventSettings.value.expiryValue,
      organizer: eventSettings.value.organizer,
      contactInfo: eventSettings.value.contactInfo,
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
  padding: 1.5rem;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  margin: 2rem auto;
}
</style>
