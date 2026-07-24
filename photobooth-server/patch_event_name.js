const fs = require('fs')

let vueCode = fs.readFileSync('frontend/src/components/EventControlPanel.vue', 'utf8')

// 1. Add input field to template
if (!vueCode.includes('v-model="eventSettings.name"')) {
  vueCode = vueCode.replace(
    '<div class="settings-box">',
    `<div class="settings-box">
            <div class="field-row" style="margin-bottom:1rem; border-bottom: 1px solid #2a2a2a; padding-bottom: 1rem;">
              <label style="display:block;margin-bottom:0.5rem;">Event Name</label>
              <input type="text" v-model="eventSettings.name" class="text-input" style="width:100%;background:#2a2a2a;color:#fff;border:1px solid #444;padding:0.75rem;border-radius:6px;font-size:1rem;color-scheme:dark;" />
            </div>`
  )
}

// 2. Add to eventSettings ref initialization
vueCode = vueCode.replace(
  "const eventSettings = ref({ photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', obfuscateLinks: false, expiryType: 'none', expiryValue: '1_year', organizer: '', contactInfo: '' })",
  "const eventSettings = ref({ name: '', photoCount: 4, countdown: 5, captureInterval: 1, postCapturePreview: 2, dslrIso: 'auto', dslrShutterSpeed: 'auto', dslrAperture: 'auto', dslrFocusMode: 'auto', obfuscateLinks: false, expiryType: 'none', expiryValue: '1_year', organizer: '', contactInfo: '' })"
)

// 3. Add to onMounted assignment
vueCode = vueCode.replace(
  "eventSettings.value = {",
  "eventSettings.value = {\n      name: event.value.name || '',"
)

// 4. Add to axios.patch payload
vueCode = vueCode.replace(
  "await axios.patch(`/api/admin/events/${props.eventId}`, {",
  "await axios.patch(`/api/admin/events/${props.eventId}`, {\n      name: eventSettings.value.name,"
)

fs.writeFileSync('frontend/src/components/EventControlPanel.vue', vueCode)
console.log('Done')
