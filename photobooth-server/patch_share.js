const fs = require('fs')

let code = fs.readFileSync('frontend/src/views/ShareView.vue', 'utf8')

// 1. Template - Subheading
code = code.replace(
  '<p class="subtitle">here are your photos</p>',
  `<p class="subtitle">here are your photos</p>
          <div v-if="session.organizer" class="organizer-info">
            <p>{{ session.organizer }}</p>
            <p v-if="session.contactInfo">Contact organizer <a href="#" @click.prevent="showContactModal = true">here</a>.</p>
          </div>`
)

// 2. Template - Modal
// In ShareView, the last closing tag is </template>
// I want to insert before the last </div> in the template? Wait, the template has a <template v-else-if="session"> block, but the main wrapper is <div class="share-page">
code = code.replace(
  '  </div>\n</template>',
  `    <Teleport to="body">
      <div v-if="showContactModal" class="modal-overlay" @click.self="showContactModal = false">
        <div class="modal-page">
          <div class="modal-header">
            <button class="back-btn" @click="showContactModal = false"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
            <h2>Contact Organizer</h2>
          </div>
          <div class="modal-body">
            <div style="white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; color: #ccc;">{{ session?.contactInfo }}</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>`
)

// 3. Script - state and interface
code = code.replace(
  'const error = ref(false)',
  'const error = ref(false)\nconst showContactModal = ref(false)'
)

code = code.replace(
  'photos: SessionPhoto[]',
  'photos: SessionPhoto[]\n  organizer?: string\n  contactInfo?: string'
)

// 4. CSS
code = code.replace(
  '</style>',
  `
.organizer-info {
  margin-top: 1rem;
  font-size: 0.875rem;
  color: #ccc;
  text-align: center;
  z-index: 10;
  position: relative;
}
.organizer-info p {
  margin: 0.25rem 0;
}
.organizer-info a {
  color: #4CAF50;
  text-decoration: none;
}
.organizer-info a:hover {
  text-decoration: underline;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-page {
  background: #1a1a1a;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #2a2a2a;
}

.modal-header h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0 1rem;
  color: #fff;
}

.back-btn {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border-radius: 4px;
}
.back-btn:hover { background: #333; color: #fff; }

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}
</style>`
)

fs.writeFileSync('frontend/src/views/ShareView.vue', code)
console.log('ShareView.vue patched')
