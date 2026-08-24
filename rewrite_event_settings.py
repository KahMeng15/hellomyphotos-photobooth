import os
import re

filepath = 'photobooth-server/frontend/src/views/EventSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# I will completely rewrite the template and the CSS. 
# And for script, I will insert relativeNumber/relativeUnit and AppButton import.

template_new = """<template>
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
            <label>Organizer</label>
            <input type="text" v-model="eventSettings.organizer" class="text-input" placeholder="e.g. Acme Corp" />
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
</template>"""

# Replace entire <template> block
template_match = re.search(r'<template>.*?</template>', content, re.DOTALL)
if template_match:
    content = content[:template_match.start()] + template_new + content[template_match.end():]

# Add AppButton import
if 'import AppButton' not in content:
    content = content.replace("import AppTopNav from '../components/ui/AppTopNav.vue'", "import AppTopNav from '../components/ui/AppTopNav.vue'\nimport AppButton from '../components/ui/AppButton.vue'")
if 'import { watch }' not in content:
    content = content.replace("import { ref, onMounted, computed } from 'vue'", "import { ref, onMounted, computed, watch } from 'vue'")

# Add relativeNumber and relativeUnit
script_addition = """
const relativeNumber = ref(1)
const relativeUnit = ref('days')

watch([relativeNumber, relativeUnit], ([num, unit]) => {
  if (eventSettings.value.expiryType === 'relative') {
    eventSettings.value.expiryValue = `${num}_${unit}`
  }
})
"""
content = content.replace("const eventSettings = ref({", script_addition + "\nconst eventSettings = ref({")

# Remove obfuscateLinks from payload and add relative mapping inside onMounted
mount_match = re.search(r'const ev = data\.event\s+eventSettings\.value = \{.*?', content, re.DOTALL)

old_mount = """    const ev = data.event
    eventSettings.value = {
      name: ev.name || '',
      obfuscateLinks: !!ev.obfuscate_links,
      expiryType: ev.expiry_type || 'none',
      expiryValue: ev.expiry_value || '',
      organizer: ev.organizer || '',
      contactInfo: ev.contact_info || ''
    }"""
new_mount = """    const ev = data.event
    eventSettings.value = {
      name: ev.name || '',
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
    }"""
content = content.replace(old_mount, new_mount)

# In saveSettings, remove obfuscateLinks
old_save = """    await axios.patch(`/api/admin/events/${eventId.value}`, {
      name: eventSettings.value.name,
      obfuscateLinks: eventSettings.value.obfuscateLinks ? 1 : 0,
      expiryType: eventSettings.value.expiryType,
      expiryValue: eventSettings.value.expiryValue,
      organizer: eventSettings.value.organizer,
      contactInfo: eventSettings.value.contactInfo,
    })"""
new_save = """    await axios.patch(`/api/admin/events/${eventId.value}`, {
      name: eventSettings.value.name,
      expiryType: eventSettings.value.expiryType,
      expiryValue: eventSettings.value.expiryValue,
      organizer: eventSettings.value.organizer,
      contactInfo: eventSettings.value.contactInfo,
    })"""
content = content.replace(old_save, new_save)

# Replace all CSS
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
</style>"""

css_match = re.search(r'<style scoped>.*?</style>', content, re.DOTALL)
if css_match:
    content = content[:css_match.start()] + css_new + content[css_match.end():]

with open(filepath, 'w') as f:
    f.write(content)

print("Rewrote EventSettingsView.vue")
