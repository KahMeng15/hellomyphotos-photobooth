import os
import re

# Update EventFramesView
filepath = 'photobooth-server/frontend/src/views/EventFramesView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace the inner layout wrapper
content = content.replace(
    '''<div class="app-page-layout">\n      <div v-if="eventId" class="frames-container">''',
    '''<div class="app-page-layout settings-container">\n      <div v-if="eventId" style="width: 100%;">'''
)

# Replace CSS
old_css = """.page-content {
  flex: 1;
  display: flex;
  justify-content: center;
}
.frames-container {
  width: 100%;
  max-width: 1200px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}"""
new_css = """.settings-container {
  max-width: 1000px;
  margin: 0 auto;
}"""
content = content.replace(old_css, new_css)

with open(filepath, 'w') as f:
    f.write(content)


# Update FrameManager
filepath_fm = 'photobooth-server/frontend/src/components/FrameManager.vue'
with open(filepath_fm, 'r') as f:
    content_fm = f.read()

template_old = """<div class="frame-manager">
    <div class="header">
      <h2>Frames</h2>
      <div class="actions">
        <label class="btn-icon-primary" title="Add Frame">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <input type="file" @change="uploadFrame" accept="image/png, image/jpeg, image/webp, image/svg+xml" style="display: none;" />
        </label>
      </div>
    </div>"""

template_new = """<div class="frame-manager">
    <section class="card">
      <div class="card-header-flex">
        <div>
          <h2>Frame Library</h2>
          <p class="card-desc" style="margin-bottom:0;">Upload and manage the photo frames used by this event.</p>
        </div>
        <div class="actions">
          <label class="app-btn app-btn--primary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-weight: 500; font-size: var(--text-sm);">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Upload Frame</span>
            <input type="file" @change="uploadFrame" accept="image/png, image/jpeg, image/webp, image/svg+xml" style="display: none;" />
          </label>
        </div>
      </div>"""
content_fm = content_fm.replace(template_old, template_new)

# Add closing </section>
content_fm = content_fm.replace(
    '</div>\n  </div>\n</template>',
    '</div>\n    </section>\n  </div>\n</template>'
)

css_old = """.frame-manager {
  padding: 2rem;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.header h2 { margin: 0; font-size: 1.25rem; }
.btn-icon-primary {
  background: var(--color-info);
  color: var(--color-text);
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
  transition: transform 0.2s, background 0.2s;
}
.btn-icon-primary:hover {
  background: #1976D2;
  transform: scale(1.05);
}"""

css_new = """.card {
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
.app-btn--primary {
  background: var(--color-text);
  color: var(--color-bg);
  border: 1px solid var(--color-text);
}
.app-btn--primary:hover {
  background: var(--color-text-muted);
}
"""
content_fm = content_fm.replace(css_old, css_new)

with open(filepath_fm, 'w') as f:
    f.write(content_fm)

print("Updated FrameManager styling.")
