const fs = require('fs')

let settingsCode = fs.readFileSync('frontend/src/views/SettingsView.vue', 'utf8')

settingsCode = settingsCode.replace(
  '<div class="field-row">\n            <label>Preview</label>\n            <input type="number" min="1" max="5" v-model.number="settings.postCapturePreview" class="num-input" />\n          </div>\n        </div>',
  `<div class="field-row">
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
        </div>`
)

settingsCode = settingsCode.replace(
  "const settings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto' })",
  "const settings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', organizer: '', contactInfo: '' })"
)

settingsCode = settingsCode.replace(
  "const originalSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto' })",
  "const originalSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', organizer: '', contactInfo: '' })"
)

settingsCode = settingsCode.replace(
  "settings.value.dslrFocusMode !== originalSettings.value.dslrFocusMode",
  "settings.value.dslrFocusMode !== originalSettings.value.dslrFocusMode || settings.value.organizer !== originalSettings.value.organizer || settings.value.contactInfo !== originalSettings.value.contactInfo"
)

fs.writeFileSync('frontend/src/views/SettingsView.vue', settingsCode)


let panelCode = fs.readFileSync('frontend/src/components/EventControlPanel.vue', 'utf8')

panelCode = panelCode.replace(
  `<div class="field-row" v-if="eventSettings.expiryType === 'absolute'" style="margin-top:1rem;">
              <label style="display:block;margin-bottom:0.5rem;">Date & Time</label>
              <input type="datetime-local" v-model="eventSettings.expiryValue" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
            </div>`,
  `<div class="field-row" v-if="eventSettings.expiryType === 'absolute'" style="margin-top:1rem;">
              <label style="display:block;margin-bottom:0.5rem;">Date & Time</label>
              <input type="datetime-local" v-model="eventSettings.expiryValue" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
            </div>

            <div class="field-row" style="margin-top:1rem;">
              <label style="display:block;margin-bottom:0.5rem;">Organizer</label>
              <input type="text" v-model="eventSettings.organizer" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
            </div>

            <div class="field-row" style="margin-top:1rem;">
              <label style="display:block;margin-bottom:0.5rem;">Contact Info</label>
              <textarea v-model="eventSettings.contactInfo" class="text-input" style="width:100%;height:100px;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;resize:vertical;"></textarea>
            </div>`
)

panelCode = panelCode.replace(
  "const eventSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', obfuscateLinks: false, expiryType: 'none', expiryValue: '1_year' })",
  "const eventSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', obfuscateLinks: false, expiryType: 'none', expiryValue: '1_year', organizer: '', contactInfo: '' })"
)

panelCode = panelCode.replace(
  "dslrFocusMode: event.value.dslr_focus_mode || 'auto'",
  "dslrFocusMode: event.value.dslr_focus_mode || 'auto',\n      organizer: event.value.organizer || '',\n      contactInfo: event.value.contact_info || ''"
)

panelCode = panelCode.replace(
  "expiryValue: eventSettings.value.expiryValue,",
  "expiryValue: eventSettings.value.expiryValue,\n      organizer: eventSettings.value.organizer,\n      contactInfo: eventSettings.value.contactInfo,"
)

fs.writeFileSync('frontend/src/components/EventControlPanel.vue', panelCode)

console.log('vue components patched')
