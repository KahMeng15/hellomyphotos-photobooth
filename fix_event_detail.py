import os
import re

filepath = 'photobooth-server/frontend/src/views/EventDetailView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Remove EventControlPanel from template
panel_regex = r'<EventControlPanel\s+:connected="boothConnected"\s+:event-id="event\.id"\s+:show="showPanel"\s+:send-message="sendMessage"\s+:booth-state="boothState"\s+:total-sessions="photoSessions\.length"\s+:total-photos="photoSessions\.reduce\(\(sum, s\) => sum \+ s\.photoCount, 0\)"\s+@close="showPanel = false"\s+@retry="retryConnection"\s+/>'
content = re.sub(panel_regex, '', content)

# Remove @toggle-panel from AppTopNav
content = content.replace(' @toggle-panel="togglePanel"', '')

# Remove dashboard-grid div entirely and just keep its contents.
content = content.replace('<div class="dashboard-grid">', '<div class="dashboard-grid-full">')

# Modify the CSS for dashboard-grid-full to be just a 1-column center layout.
css_new = """
.dashboard-grid-full {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
"""
content = content.replace('</style>', css_new + '</style>')

with open(filepath, 'w') as f:
    f.write(content)
