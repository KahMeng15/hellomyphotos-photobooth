import os
import re

filepath = 'photobooth-server/frontend/src/views/EventAnalyticsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace the entire script section to be safe
script_clean = """<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppTopNav from '../components/ui/AppTopNav.vue'
import EventControlPanel from '../components/EventControlPanel.vue'
import { useWebSocket } from '../composables/useWebSocket'
import axios from 'axios'

const router = useRouter()
const route = useRoute()

const showPanel = ref(false)
const boothState = ref('idle')
const boothConnected = ref(false)
const { connect: connectWs, subscribe, sendMessage } = useWebSocket()

const eventId = computed(() => route.params.id as string)
const event = ref<any>(null)
const loading = ref(true)
const analytics = ref<any>(null)

async function fetchData() {
  try {
    const { data: eventData } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = eventData.event

    const { data: analyticsData } = await axios.get(`/api/admin/events/${eventId.value}/analytics`)
    analytics.value = analyticsData
  } catch (err) {
    console.error('Failed to load analytics', err)
  } finally {
    loading.value = false
  }
}

function formatTime(str: string) {
  const d = new Date(str)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  fetchData()
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
})
</script>"""

match = re.search(r'<script setup lang="ts">.*?</script>', content, re.DOTALL)
if match:
    content = content[:match.start()] + script_clean + content[match.end():]

with open(filepath, 'w') as f:
    f.write(content)
