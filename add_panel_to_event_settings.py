import os

filepath = 'photobooth-server/frontend/src/views/EventSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Add to template
content = content.replace(
    '<AppTopNav mode="event" :event="event" currentTitle="Event Settings" />',
    '<AppTopNav mode="event" :event="event" currentTitle="Event Settings" @toggle-panel="showPanel = !showPanel" />'
)

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

# Add imports
content = content.replace(
    "import AppTopNav from '../components/ui/AppTopNav.vue'",
    "import AppTopNav from '../components/ui/AppTopNav.vue'\nimport EventControlPanel from '../components/EventControlPanel.vue'\nimport { useWebSocket } from '../composables/useWebSocket'"
)

# Add refs
refs_add = """
const showPanel = ref(false)
const boothState = ref('idle')
const boothConnected = ref(false)
const { connect: connectWs, subscribe, sendMessage } = useWebSocket()
"""
content = content.replace("const eventId = computed(() => route.params.id as string)", refs_add + "\nconst eventId = computed(() => route.params.id as string)")

# Add socket connection in onMounted
mount_add = """
  const socket = connectWs()
  if (socket) {
    subscribe(eventId.value)
    socket.on('booth-connected', (payload) => {
      if (payload.eventId === eventId.value) boothConnected.value = payload.connected
    })
    socket.on('booth-state', (payload) => {
      if (payload.eventId === eventId.value) boothState.value = payload.state
    })
  }
"""
content = content.replace("if (authStore.user?.role === 'admin') {", mount_add + "\n  if (authStore.user?.role === 'admin') {")

with open(filepath, 'w') as f:
    f.write(content)
