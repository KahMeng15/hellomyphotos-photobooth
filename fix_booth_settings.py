import os
import re

filepath = 'photobooth-server/frontend/src/views/EventBoothSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Remove EventControlPanel from template
panel_regex = r'<EventControlPanel\s+:connected="boothConnected"\s+:event-id="event\.id"\s+:show="showPanel"\s+:send-message="sendMessage"\s+:booth-state="boothState"\s+@close="showPanel = false"\s+/>'
content = re.sub(panel_regex, '', content)

# Remove @toggle-panel from AppTopNav
content = content.replace(' @toggle-panel="showPanel = !showPanel"', '')

# Remove import EventControlPanel
content = content.replace("import EventControlPanel from '../components/EventControlPanel.vue'\n", "")

# Remove showPanel and boothState
content = content.replace("const showPanel = ref(false)\nconst boothState = ref('idle')\n", "")

# Remove boothState socket listener
state_socket_regex = r"\s*socket\.on\('booth-state', \(payload\) => \{\s*if \(payload\.eventId === eventId\.value\) \{\s*boothState\.value = payload\.state\s*\}\s*\}\)"
content = re.sub(state_socket_regex, '', content)

with open(filepath, 'w') as f:
    f.write(content)
