const fs = require('fs');

const svgBack = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;

let ecp = fs.readFileSync('frontend/src/components/EventControlPanel.vue', 'utf8');

// Event Settings Save Button
ecp = ecp.replace(
  /<button @click="saveEventSettings" class="btn-primary" style="margin-top: 1rem; width: 100%;" :disabled="settingsSaving">/g,
  `<button @click="saveEventSettings" class="btn-control btn-primary" style="margin-top: 1rem; width: 100%;" :disabled="settingsSaving">`
);

// Booth Controller Header
ecp = ecp.replace(
  /<div class="modal-header">\s*<h2>Booth Controller<\/h2>\s*<button class="close-btn" @click="\$emit\('close'\)">✕<\/button>\s*<\/div>/g,
  `<div class="modal-header">
          <button class="back-btn" @click="$emit('close')">${svgBack}</button>
          <h2>Booth Controller</h2>
        </div>`
);

// Event Settings Header
ecp = ecp.replace(
  /<div class="modal-header">\s*<h2>Event Settings<\/h2>\s*<button class="close-btn" @click="showEventSettingsModal = false">✕<\/button>\s*<\/div>/g,
  `<div class="modal-header">
          <button class="back-btn" @click="showEventSettingsModal = false">${svgBack}</button>
          <h2>Event Settings</h2>
        </div>`
);

// Booth Settings Header
ecp = ecp.replace(
  /<div class="modal-header">\s*<h2>Booth Settings<\/h2>\s*<button class="close-btn" @click="showSettingsModal = false">✕<\/button>\s*<\/div>/g,
  `<div class="modal-header">
          <button class="back-btn" @click="showSettingsModal = false">${svgBack}</button>
          <h2>Booth Settings</h2>
        </div>`
);

// CSS: .modal-page padding
ecp = ecp.replace(
  /\.modal-page {\s*background: #0f0f0f;\s*border-radius: 0;\s*width: 100%;\s*max-width: 800px;\s*min-height: 100vh;\s*margin: 0 auto;\s*display: flex;\s*flex-direction: column;\s*padding: 2rem;\s*}/g,
  `.modal-page {
  background: #0f0f0f;
  border-radius: 0;
  width: 100%;
  max-width: 800px;
  min-height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}`
);

// CSS: .modal-header justify
ecp = ecp.replace(
  /\.modal-header {\s*display: flex;\s*align-items: center;\s*justify-content: space-between;/g,
  `.modal-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1rem;`
);

// CSS: Add .back-btn
ecp = ecp.replace(
  /\.close-btn {/,
  `.back-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-btn:hover { color: #fff; }

.close-btn {`
);

fs.writeFileSync('frontend/src/components/EventControlPanel.vue', ecp);

// SessionViewer
let sv = fs.readFileSync('frontend/src/components/SessionViewer.vue', 'utf8');

// Replace Header block
sv = sv.replace(
  /<button class="close-btn" @click="\$emit\('close'\)">✕<\/button>\s*<div class="session-header">\s*<h2>\{\{ session.photoCount \}\} Photo\{\{ session.photoCount !== 1 \? 's' : '' \}\}<\/h2>\s*<span class="session-time">\{\{ formatTime\(session.createdAt\) \}\}<\/span>\s*<\/div>/g,
  `<div class="session-header">
          <button class="back-btn" @click="$emit('close')">${svgBack}</button>
          <div>
            <h2>{{ session.photoCount }} Photo{{ session.photoCount !== 1 ? 's' : '' }}</h2>
            <span class="session-time">{{ formatTime(session.createdAt) }}</span>
          </div>
        </div>
        <div class="viewer-body">`
);

// Close viewer-body before viewer-actions end (or just before </div> </div> which closes viewer and overlay)
sv = sv.replace(
  /<div v-if="shareError" class="share-error">\{\{ shareError \}\}<\/div>\s*<\/div>\s*<\/div>/g,
  `<div v-if="shareError" class="share-error">{{ shareError }}</div>
        </div>
      </div>
    </div>`
);

// CSS: .viewer
sv = sv.replace(
  /\.viewer {\s*background: #0f0f0f;\s*border-radius: 0;\s*padding: 2rem;\s*width: 100%;\s*max-width: 800px;\s*min-height: 100vh;\s*margin: 0 auto;\s*position: relative;\s*}/g,
  `.viewer {
  background: #0f0f0f;
  border-radius: 0;
  width: 100%;
  max-width: 800px;
  min-height: 100vh;
  margin: 0 auto;
  position: relative;
  display: flex;
  flex-direction: column;
}`
);

// CSS: session-header
sv = sv.replace(
  /\.session-header {\s*margin-bottom: 1rem;\s*}/g,
  `.session-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #2a2a2a;
}
.viewer-body {
  padding: 1.5rem;
  flex: 1;
  overflow-y: auto;
}
.back-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-btn:hover { color: #fff; }`
);


fs.writeFileSync('frontend/src/components/SessionViewer.vue', sv);

console.log('done');
