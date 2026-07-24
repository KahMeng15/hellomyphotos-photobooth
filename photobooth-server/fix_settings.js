const fs = require('fs');
const file = 'frontend/src/components/EventControlPanel.vue';
let content = fs.readFileSync(file, 'utf8');

// Replace obfuscate links checkbox
content = content.replace(
  /<div class="field-row" style="margin-top:1.5rem;">\s*<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">\s*<input type="checkbox" v-model="eventSettings.obfuscateLinks" \/>\s*Obfuscate Links\s*<\/label>\s*<\/div>/g,
  `<div class="field-row" style="margin-top:1.5rem; display:flex; justify-content:space-between; align-items:center;">
              <label>Obfuscate Links</label>
              <div class="focus-toggle">
                <button :class="['focus-btn', eventSettings.obfuscateLinks ? 'focus-active' : '']" @click="eventSettings.obfuscateLinks = true">ON</button>
                <button :class="['focus-btn', !eventSettings.obfuscateLinks ? 'focus-active' : '']" @click="eventSettings.obfuscateLinks = false">OFF</button>
              </div>
            </div>`
);

// Replace selects inline styles
content = content.replace(
  /<select v-model="eventSettings.expiryType" class="text-input"[^>]+>/g,
  `<select v-model="eventSettings.expiryType" class="custom-select">`
);

content = content.replace(
  /<select v-model="eventSettings.expiryValue" class="text-input"[^>]+>/g,
  `<select v-model="eventSettings.expiryValue" class="custom-select">`
);

// Add .custom-select to CSS before .focus-toggle
content = content.replace(
  /\.focus-toggle {/,
  `.custom-select {
  width: 100%;
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 1rem;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  background-image: url('data:image/svg+xml;utf8,<svg fill="%23fff" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>');
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 1.5rem;
  cursor: pointer;
}
.custom-select:focus {
  border-color: #666;
}

.focus-toggle {`
);

fs.writeFileSync(file, content);
console.log('Done');
