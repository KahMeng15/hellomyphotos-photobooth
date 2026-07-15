<template>
  <aside class="control-panel">
    <div class="panel-section">
      <h3>Booth Status</h3>
      <div class="status-row">
        <div :class="['status-dot', connectionStatus]"></div>
        <span>{{ connectionStatus }}</span>
      </div>
    </div>

    <div class="panel-section">
      <h3>Controls</h3>

      <div class="control-field">
        <label>Override Frame</label>
        <select v-model="selectedFrame" @change="sendFrameOverride">
          <option value="">No Override</option>
          <option v-for="f in photosStore.frames" :key="f.id" :value="f.id">
            {{ f.name }}
          </option>
        </select>
      </div>

      <button @click="triggerReshot" class="btn-control btn-primary">
        Trigger Reshot
      </button>
      <button @click="togglePause" class="btn-control" :class="paused ? 'btn-resume' : 'btn-pause'">
        {{ paused ? 'Resume Booth' : 'Pause Booth' }}
      </button>
    </div>

    <div class="panel-section">
      <h3>Processing Queue</h3>
      <div class="queue-bar">
        <div class="queue-fill" :style="{ width: queuePercent + '%' }"></div>
      </div>
      <span class="queue-label">{{ photosStore.queueDepth }} jobs</span>
    </div>

    <div class="panel-section">
      <h3>Quick Actions</h3>
      <button @click="shareAll" class="btn-control btn-secondary">
        Share All
      </button>
      <button @click="goToAdmin" class="btn-control btn-secondary">
        Admin Panel
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePhotosStore } from '../stores/photos'
import { useWebSocket } from '../composables/useWebSocket'

const router = useRouter()
const photosStore = usePhotosStore()
const { ws, sendMessage } = useWebSocket()

const selectedFrame = ref('')
const paused = ref(false)
const connectionStatus = ref('disconnected')

const queuePercent = computed(() => Math.min((photosStore.queueDepth / 10) * 100, 100))

function sendFrameOverride() {
  sendMessage('frame-override', { frameId: selectedFrame.value })
}

function triggerReshot() {
  sendMessage('trigger-reshot', {})
}

function togglePause() {
  paused.value = !paused.value
  sendMessage('booth-pause', { paused: paused.value })
}

function shareAll() {
  if (navigator.share) {
    navigator.share({
      title: 'Booth Photos',
      text: 'Check out the photo booth!',
      url: window.location.origin,
    })
  }
}

function goToAdmin() {
  router.push('/admin')
}
</script>

<style scoped>
.control-panel {
  background: #1a1a1a;
  border-left: 1px solid #2a2a2a;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.panel-section h3 {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin: 0 0 0.75rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  text-transform: capitalize;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected {
  background: #4caf50;
}

.status-dot.disconnected {
  background: #f44336;
}

.control-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.control-field label {
  font-size: 0.75rem;
  color: #888;
}

.control-field select {
  padding: 0.5rem;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  background: #111;
  color: #fff;
  font-size: 0.8125rem;
  outline: none;
}

.btn-control {
  width: 100%;
  padding: 0.625rem;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: opacity 0.15s;
}

.btn-control:hover {
  opacity: 0.9;
}

.btn-primary {
  background: #2196F3;
  color: #fff;
}

.btn-pause {
  background: #ff9800;
  color: #fff;
}

.btn-resume {
  background: #4caf50;
  color: #fff;
}

.btn-secondary {
  background: #2a2a2a;
  color: #ccc;
}

.queue-bar {
  height: 6px;
  background: #2a2a2a;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.375rem;
}

.queue-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s;
  border-radius: 3px;
}

.queue-label {
  font-size: 0.75rem;
  color: #888;
}

@media (max-width: 768px) {
  .control-panel {
    display: none;
  }
}
</style>
