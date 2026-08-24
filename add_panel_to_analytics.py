import os

filepath = 'photobooth-server/frontend/src/views/EventAnalyticsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

content = content.replace(
    '<AppTopNav mode="event" :event="event" currentTitle="Analytics" />',
    '<AppTopNav mode="event" :event="event" currentTitle="Analytics" @toggle-panel="showPanel = !showPanel" />'
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
    '    <div class="app-page-layout analytics-container">',
    panel_html + '\n    <div class="app-page-layout analytics-container">'
)

content = content.replace(
    "import AppTopNav from '../components/ui/AppTopNav.vue'",
    "import AppTopNav from '../components/ui/AppTopNav.vue'\nimport EventControlPanel from '../components/EventControlPanel.vue'\nimport { useWebSocket } from '../composables/useWebSocket'"
)

refs_add = """
const showPanel = ref(false)
const boothState = ref('idle')
const boothConnected = ref(false)
const { connect: connectWs, subscribe, sendMessage } = useWebSocket()
"""
content = content.replace("const eventId = computed(() => route.params.id as string)", refs_add + "\nconst eventId = computed(() => route.params.id as string)")

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
content = content.replace("fetchData()", "fetchData()\n" + mount_add)

with open(filepath, 'w') as f:
    f.write(content)
