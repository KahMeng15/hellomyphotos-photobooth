const fs = require('fs')
const path = require('path')

const vuePath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'EventControlPanel.vue')
let content = fs.readFileSync(vuePath, 'utf8')

// Add Event Settings button to desktop Quick Actions
content = content.replace(
  `<button @click="showSettingsModal = true" class="btn-control btn-secondary">
        Booth Settings
      </button>`,
  `<button @click="showSettingsModal = true" class="btn-control btn-secondary">
        Booth Settings
      </button>
      <button @click="showEventSettingsModal = true" class="btn-control btn-secondary">
        Event Settings
      </button>`
)

// Add Event Settings button to mobile Quick Actions
content = content.replace(
  `<button @click="showSettingsModal = true" class="btn-control btn-secondary">
              Booth Settings
            </button>`,
  `<button @click="showSettingsModal = true" class="btn-control btn-secondary">
              Booth Settings
            </button>
            <button @click="showEventSettingsModal = true" class="btn-control btn-secondary">
              Event Settings
            </button>`
)

// Add the modal HTML
const modalHtml = `
  <Teleport to="body">
    <div v-if="showEventSettingsModal" class="modal-overlay" @click.self="showEventSettingsModal = false">
      <div class="modal-page">
        <div class="modal-header">
          <h2>Event Settings</h2>
          <button class="close-btn" @click="showEventSettingsModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="settings-box">
            <div class="field-row">
              <label>Obfuscate Links</label>
              <div style="display:flex;align-items:center;">
                <input type="checkbox" id="obfuscateLinks" v-model="eventSettings.obfuscateLinks" style="width:1.5rem;height:1.5rem;cursor:pointer;" />
                <label for="obfuscateLinks" style="margin-left:0.5rem;cursor:pointer;color:#fff;">Hide original filenames in shared links</label>
              </div>
            </div>
            
            <div class="field-row" style="margin-top:1.5rem;">
              <label style="display:block;margin-bottom:0.5rem;">Link Expiry</label>
              <select v-model="eventSettings.expiryType" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;">
                <option value="none">No Expiry</option>
                <option value="relative">Relative Duration</option>
                <option value="absolute">Specific Date & Time</option>
              </select>
            </div>
            
            <div class="field-row" v-if="eventSettings.expiryType === 'relative'" style="margin-top:1rem;">
              <label style="display:block;margin-bottom:0.5rem;">Expires In (from creation)</label>
              <select v-model="eventSettings.expiryValue" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;">
                <option value="1_day">1 Day</option>
                <option value="3_days">3 Days</option>
                <option value="1_week">1 Week</option>
                <option value="1_month">1 Month</option>
                <option value="6_months">6 Months</option>
                <option value="1_year">1 Year</option>
              </select>
            </div>
            
            <div class="field-row" v-if="eventSettings.expiryType === 'absolute'" style="margin-top:1rem;">
              <label style="display:block;margin-bottom:0.5rem;">Date & Time</label>
              <input type="datetime-local" v-model="eventSettings.expiryValue" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
            </div>
          </div>
          
          <div v-if="settingsMsg" :class="['settings-msg', settingsMsgType]" style="margin-top:1rem;">{{ settingsMsg }}</div>
          
          <button @click="saveEventSettings" class="btn-primary" style="margin-top: 1rem; width: 100%;" :disabled="settingsSaving">
            {{ settingsSaving ? 'Saving...' : 'Save Settings' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
`

content = content.replace("  <Teleport to=\"body\">\n    <div v-if=\"showSettingsModal\"", modalHtml + "\n  <Teleport to=\"body\">\n    <div v-if=\"showSettingsModal\"")

// Update script state
content = content.replace("const showSettingsModal = ref(false)", "const showSettingsModal = ref(false)\nconst showEventSettingsModal = ref(false)")

// Update eventSettings ref
content = content.replace(
  "const eventSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto' })",
  "const eventSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', obfuscateLinks: false, expiryType: 'none', expiryValue: '1_year' })"
)

// Update onMounted loading
content = content.replace(
  "dslrFocusMode: event.value.dslr_focus_mode || 'auto',",
  "dslrFocusMode: event.value.dslr_focus_mode || 'auto',\n      obfuscateLinks: event.value.obfuscate_links === 1,\n      expiryType: event.value.expiry_type || 'none',\n      expiryValue: event.value.expiry_value || '1_year',"
)

// Update saveEventSettings payload
content = content.replace(
  "dslrFocusMode: eventSettings.value.dslrFocusMode,",
  "dslrFocusMode: eventSettings.value.dslrFocusMode,\n      obfuscateLinks: eventSettings.value.obfuscateLinks ? 1 : 0,\n      expiryType: eventSettings.value.expiryType,\n      expiryValue: eventSettings.value.expiryValue,"
)

fs.writeFileSync(vuePath, content, 'utf8')
console.log('EventControlPanel updated successfully')
