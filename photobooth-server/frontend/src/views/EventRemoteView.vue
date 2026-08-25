<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Booth Remote" />

    <div class="app-page-layout settings-container">
      <EventControlPanel
        :connected="boothConnected"
        :event-id="event.id"
        :booth-state="boothState"
        :send-message="sendMessage"
        @retry="retryConnection"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import AppTopNav from '../components/ui/AppTopNav.vue'
import EventControlPanel from '../components/EventControlPanel.vue'
import { useWebSocket } from '../composables/useWebSocket'

const router = useRouter()
const route = useRoute()
const eventId = computed(() => route.params.id as string)

const event = ref<any>(null)



const boothConnected = ref(false)
const boothState = ref('idle')


const { connect: connectWs, disconnect: disconnectWs, subscribe, ws, sendMessage } = useWebSocket()

onMounted(async () => {
  try {
    const [{ data: evtData }, { data: framesData }] = await Promise.all([
      axios.get(`/api/admin/events/${eventId.value}`),
      axios.get(`/api/admin/events/${eventId.value}/frames`)
    ])
    event.value = evtData.event
    frames.value = framesData.frames.filter((f: any) => !f.disabled)
  } catch (err) {
    console.error('Failed to load event data', err)
  }

  const socket = connectWs()
  if (socket) {
    if (socket.connected) {
      subscribe(eventId.value)
    } else {
      socket.on('connect', () => subscribe(eventId.value))
    }
    socket.on('booth-connected', (payload) => {
      if (payload.eventId === eventId.value) {
        boothConnected.value = payload.connected
      }
    })
    socket.on('booth-state', (payload) => {
      if (payload.eventId === eventId.value) {
        boothState.value = payload.state
      }
    })
  }
})

onUnmounted(() => {
  disconnectWs()
})


function retryConnection() {
  const socket = connectWs()
  if (socket) {
    if (socket.connected) {
      subscribe(eventId.value)
    } else {
      socket.on('connect', () => subscribe(eventId.value))
    }
  }
}








</script>

<style scoped>
.page-wrapper {
  background: var(--color-bg);
  min-height: 100vh;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
}
.settings-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem;
  width: 100%;
}
</style>
