import os
import re

filepath = 'photobooth-server/frontend/src/views/EventDetailView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Add EventControlPanel back into the template
panel_html = """
      <EventControlPanel
        class="remote-sidebar"
        :connected="boothConnected"
        :event-id="event.id"
        :show="showPanel"
        :send-message="sendMessage"
        :booth-state="boothState"
        :total-sessions="photoSessions.length"
        :total-photos="photoSessions.reduce((sum, s) => sum + s.photoCount, 0)"
        @close="showPanel = false"
        @retry="retryConnection"
      />
"""

# Insert it before the closing div of dashboard-grid-full
content = content.replace(
    '      </section>\n\n      \n    </div>',
    '      </section>\n' + panel_html + '\n    </div>'
)

# Fix CSS
css_old = """.dashboard-grid-full {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}"""

css_new = """.dashboard-grid-full {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
.remote-sidebar {
  display: none;
}
@media (min-width: 1200px) {
  .dashboard-grid-full {
    display: grid;
    grid-template-columns: 1fr 340px;
    align-items: flex-start;
  }
  .remote-sidebar {
    display: flex;
    position: sticky;
    top: 1.5rem;
    height: calc(100vh - 3rem - 65px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }
}"""

# Replace all occurrences (since there are 2 style blocks with it sometimes)
content = content.replace(css_old, css_new)

with open(filepath, 'w') as f:
    f.write(content)
