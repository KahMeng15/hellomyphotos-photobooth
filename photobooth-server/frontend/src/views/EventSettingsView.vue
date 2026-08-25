<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Event Settings" />

    <div class="app-page-layout settings-container">
      
      <section class="card">
        <h2>General Info</h2>
        <p class="card-desc">Basic details about this event.</p>
        <div class="settings-box">
          <div class="field-row">
            <label>Event Name</label>
            <input type="text" v-model="eventSettings.name" class="text-input" />
          </div>
          <div class="field-row">
            <label>Event Date</label>
            <input type="date" v-model="eventSettings.date" class="text-input" />
          </div>
          <div class="field-row">
            <label>Organizer</label>
            <input type="text" v-model="eventSettings.organizer" class="text-input" placeholder="Faculty of Computer Science and Information Technology" />
          </div>
          <div class="field-row-col">
            <label>Contact Info</label>
            <textarea v-model="eventSettings.contactInfo" class="text-input textarea-input" placeholder="Email or phone number"></textarea>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Access Expiration</h2>
        <p class="card-desc">Control when the event gallery link stops working.</p>
        <div class="settings-box">
          <div class="field-row">
            <label>Link Expiry</label>
            <select v-model="eventSettings.expiryType" class="custom-select">
              <option value="none">No Expiry</option>
              <option value="relative">Relative Duration</option>
              <option value="absolute">Specific Date & Time</option>
            </select>
          </div>
          <div class="field-row" v-if="eventSettings.expiryType === 'relative'">
            <label>Expires In</label>
            <div class="compound-input">
              <input type="number" min="1" v-model.number="relativeNumber" class="text-input num-input" />
              <select v-model="relativeUnit" class="custom-select">
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
            </div>
          </div>
          <div class="field-row" v-if="eventSettings.expiryType === 'absolute'">
            <label>Date & Time</label>
            <input type="datetime-local" v-model="eventSettings.expiryValue" class="text-input datetime-input" />
          </div>
        </div>
      </section>

      <section class="card" v-if="authStore.user?.role === 'admin'">
        <div class="card-header-flex">
          <div>
            <h2>Operator Access</h2>
            <p class="card-desc" style="margin-bottom:0;">Manage dedicated operator accounts for this event.</p>
          </div>
          <div v-if="!operatorAccessUnlocked">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-sub)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div v-else>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
          </div>
        </div>

        <!-- Locked State -->
        <div class="settings-box operator-auth-box" v-if="!operatorAccessUnlocked">
          <p>Please enter your master admin password to view and manage operators.</p>
          <div class="auth-flex">
            <input type="password" v-model="adminUnlockPassword" placeholder="Admin Password" class="text-input" @keyup.enter="unlockOperatorAccess" />
            <AppButton variant="primary" @click="unlockOperatorAccess">Unlock</AppButton>
          </div>
        </div>

        <!-- Unlocked State -->
        <div v-else>
          <div class="settings-box" v-if="operators.length > 0">
            <div v-for="op in operators" :key="op.id" class="field-row">
              <div class="op-info">
                <strong>{{ op.name }}</strong>
                <div class="op-meta">Created {{ new Date(op.created_at).toLocaleDateString() }}</div>
              </div>
              <div class="op-actions">
                <AppButton variant="secondary" size="sm" @click="copyOperatorLink(op)">Copy Link</AppButton>
                <AppButton variant="ghost" size="sm" @click="deleteOperator(op.id)">Revoke</AppButton>
              </div>
            </div>
          </div>
          
          <div v-if="lastAddedOperator" class="operator-success-card">
            <h4>Operator Added Successfully!</h4>
            <p><strong>Name:</strong> {{ lastAddedOperator.name }}</p>
            <p><strong>Password:</strong> {{ lastAddedOperator.password }}</p>
            <p><strong>Link:</strong> {{ lastAddedOperator.link }}</p>
            <p class="warning-text">Make sure to copy the password now, it cannot be shown again.</p>
            <AppButton variant="primary" @click="copyFullMessage" style="width:100%; margin-top:1rem;">Copy All Info</AppButton>
          </div>

          <div class="settings-box add-operator-box">
            <h4>Add New Operator</h4>
            <div class="auth-flex">
              <input type="text" v-model="newOperatorName" placeholder="Operator Name (e.g. John Doe)" class="text-input" />
              <input type="text" v-model="newOperatorPassword" placeholder="Auto-generated Password" class="text-input" />
              <AppButton variant="primary" @click="addOperator">Add</AppButton>
            </div>
          </div>
        </div>
      </section>

      <div class="page-actions">
        <AppButton variant="secondary" @click="goBack">Cancel</AppButton>
        <AppButton variant="primary" @click="saveSettings" :disabled="settingsSaving">
          {{ settingsSaving ? 'Saving...' : 'Save Settings' }}
        </AppButton>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppTopNav from '../components/ui/AppTopNav.vue'
import AppButton from '../components/ui/AppButton.vue'
// import AppPageLayout from '../components/ui/AppPageLayout.vue'
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


const relativeNumber = ref(1)
const relativeUnit = ref('days')

watch([relativeNumber, relativeUnit], ([num, unit]) => {
  if (eventSettings.value.expiryType === 'relative') {
    eventSettings.value.expiryValue = `${num}_${unit}`
  }
})

const eventSettings = ref({
  name: '',
  date: '',
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
      date: ev.date || '',
      expiryType: ev.expiry_type || 'none',
      expiryValue: ev.expiry_value || '',
      organizer: ev.organizer || '',
      contactInfo: ev.contact_info || ''
    }
    if (ev.expiry_type === 'relative' && ev.expiry_value) {
      const parts = ev.expiry_value.split('_')
      if (parts.length === 2) {
        relativeNumber.value = parseInt(parts[0]) || 1
        let u = parts[1]
        // Map legacy units just in case
        if (u === 'day') u = 'days'
        if (u === 'week') u = 'weeks'
        if (u === 'month') u = 'months'
        if (u === 'year') u = 'years'
        relativeUnit.value = u
      }
    }
  } catch (err) {
    console.error('Failed to load event', err)
    toast.error('Failed to load event settings')
  }
  
  if (authStore.user?.role === 'admin') {
    await fetchOperators()
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
      date: eventSettings.value.date,
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
.field-row-col label {
  display: block;
  margin-bottom: 0.5rem;
}

.field-row label, .field-row-col label {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.text-input, .custom-select {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  outline: none;
  min-width: 250px;
}
.text-input:focus, .custom-select:focus {
  border-color: var(--color-text-sub);
}
.textarea-input {
  width: 100%;
  height: 80px;
  resize: vertical;
}
.compound-input {
  display: flex;
  gap: 0.5rem;
}
.num-input {
  width: 80px;
  min-width: 80px;
}
.datetime-input {
  min-width: 250px;
  color-scheme: dark;
}

.operator-auth-box {
  padding: 1.5rem;
}
.operator-auth-box p {
  margin: 0 0 1rem 0;
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}
.auth-flex {
  display: flex;
  gap: 0.5rem;
}

.add-operator-box {
  padding: 1rem 1.25rem;
  margin-top: 1rem;
}
.add-operator-box h4 {
  margin: 0 0 0.75rem 0;
  font-size: var(--text-sm);
}

.op-info strong {
  font-size: var(--text-sm);
  display: block;
}
.op-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}
.op-actions {
  display: flex;
  gap: 0.5rem;
}

.operator-success-card {
  margin-top: 1rem;
  padding: 1.5rem;
  background: color-mix(in srgb, var(--color-success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-success) 30%, transparent);
  border-radius: var(--radius-md);
}
.operator-success-card h4 {
  margin: 0 0 1rem 0;
  color: var(--color-success);
}
.operator-success-card p {
  margin: 0 0 0.5rem 0;
  font-size: var(--text-sm);
}
.warning-text {
  color: var(--color-warning);
  font-weight: 500;
  margin-top: 1rem !important;
}

.page-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
}
</style>
