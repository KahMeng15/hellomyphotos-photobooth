import os
import re

filepath = 'photobooth-server/frontend/src/views/EventBoothSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Add to template:
# 1. @toggle-panel="showPanel = !showPanel"
content = content.replace(
    '<AppTopNav mode="event" :event="event" currentTitle="Booth Settings" />',
    '<AppTopNav mode="event" :event="event" currentTitle="Booth Settings" @toggle-panel="showPanel = !showPanel" />'
)

# 2. Add EventControlPanel component
panel_html = """
    <EventControlPanel
      :connected="boothConnected"
      :event-id="event.id"
      :show="showPanel"
      :send-message="sendMessage"
      :booth-state="boothState"
      @close="showPanel = false"
    />
"""
content = content.replace(
    '    <div class="app-page-layout settings-container">',
    panel_html + '\n    <div class="app-page-layout settings-container">'
)

# Add to script:
# import EventControlPanel
if 'import EventControlPanel' not in content:
    content = content.replace(
        "import AppTopNav from '../components/ui/AppTopNav.vue'",
        "import AppTopNav from '../components/ui/AppTopNav.vue'\nimport EventControlPanel from '../components/EventControlPanel.vue'"
    )

# add showPanel, boothState, sendMessage
script_add = """
const showPanel = ref(false)
const boothState = ref('idle')
"""
content = content.replace("const boothConnected = ref(false)", "const boothConnected = ref(false)\n" + script_add)

# In socket.on:
socket_state = """
      socket.on('booth-state', (payload) => {
        if (payload.eventId === eventId.value) {
          boothState.value = payload.state
        }
      })
"""
content = content.replace("socket.on('booth-connected', (payload) => {", socket_state + "\n      socket.on('booth-connected', (payload) => {")

with open(filepath, 'w') as f:
    f.write(content)

print("Added EventControlPanel to BoothSettings.")
