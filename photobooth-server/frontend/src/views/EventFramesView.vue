<template>
  <div class="dashboard page-wrapper" v-if="event">
    <EventTopNav :event="event" currentTitle="Frames" />

    <div class="page-content" style="padding: 2rem;">
      <div v-if="eventId" class="frames-container">
        <FrameManager v-if="!editingFrame" :event-id="eventId" @edit="editingFrame = $event" />
        <FrameEditor v-else :event-id="event.id" :frame="editingFrame" @close="editingFrame = null" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import EventTopNav from '../components/EventTopNav.vue'
import FrameManager from '../components/FrameManager.vue'
import FrameEditor from '../components/FrameEditor.vue'
import axios from 'axios'

const router = useRouter()
const route = useRoute()

const eventId = computed(() => route.params.id as string)
const event = ref<any>(null)
const editingFrame = ref<any>(null)

onMounted(async () => {
  try {
    const { data } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = data.event
  } catch (err) {
    console.error('Failed to load event', err)
  }
})

function goBack() {
  if (editingFrame.value) {
    editingFrame.value = null
  } else {
    router.push(`/events/${eventId.value}`)
  }
}
</script>

<style scoped>
.page-wrapper {
  background: #1a1a1a;
  min-height: 100vh;
  color: #fff;
  display: flex;
  flex-direction: column;
}
.page-content {
  flex: 1;
  display: flex;
  justify-content: center;
}
.frames-container {
  width: 100%;
  max-width: 1200px;
  background: #222;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
}
</style>
