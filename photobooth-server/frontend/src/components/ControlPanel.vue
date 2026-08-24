<template>
  <aside class="control-panel">
    <div class="panel-section">
      <h3>Booth Status</h3>
      <div class="status-row" @click="$emit('retry')" :class="{ 'status-clickable': !connected }">
        <div :class="['status-dot', connectionStatus]"></div>
        <span>{{ connectionStatus }}</span>
        <span v-if="!connected" class="retry-hint">click to retry</span>
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

      <button @click="remoteCapture" class="btn-control btn-primary">
        Remote Capture
      </button>
      <button @click="remoteReshot" class="btn-control btn-secondary">
        Remote Start
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
      <button @click="goToSettings" class="btn-control btn-secondary">
        Booth Settings
      </button>
    </div>
  </aside>

  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-page">
        <div class="modal-header">
          <h2>Booth Controller</h2>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
        <div class="modal-body">
          <div class="panel-section">
            <h3>Booth Status</h3>
            <div class="status-row" @click="$emit('retry')" :class="{ 'status-clickable': !connected }">
              <div :class="['status-dot', connectionStatus]"></div>
              <span>{{ connectionStatus }}</span>
              <span v-if="!connected" class="retry-hint">click to retry</span>
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

            <button @click="remoteCapture" class="btn-control btn-primary">
              Remote Capture
            </button>
            <button @click="remoteReshot" class="btn-control btn-secondary">
              Remote Start
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
            <button @click="goToSettings" class="btn-control btn-secondary">
              Booth Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePhotosStore } from '../stores/photos'
import axios from 'axios'

const props = defineProps<{
  connected: boolean
  sendMessage: (event: string, data: any) => void
  show: boolean
}>()

const emit = defineEmits<{ close: []; retry: [] }>()

const router = useRouter()
const photosStore = usePhotosStore()

const selectedFrame = ref('')
const paused = ref(false)
const connectionStatus = computed(() => props.connected ? 'connected' : 'disconnected')

const queuePercent = computed(() => Math.min((photosStore.queueDepth / 10) * 100, 100))

function sendFrameOverride() {
  props.sendMessage('frame-override', { frameId: selectedFrame.value })
}

async function remoteCapture() {
  try {
    await axios.post('/api/booth/remote-capture')
  } catch {}
}

async function remoteReshot() {
  try {
    await axios.post('/api/booth/remote-start')
  } catch {}
}

async function togglePause() {
  paused.value = !paused.value
  try {
    await axios.post('/api/booth/remote-pause', { paused: paused.value })
  } catch {}
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

function goToSettings() {
  router.push('/settings')
}
</script>

<style scoped>
.control-panel {
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}

.modal-page {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-sub);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.panel-section h3 {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 0.75rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-sm);
  text-transform: capitalize;
}

.status-clickable {
  cursor: pointer;
}

.status-clickable:hover {
  opacity: 0.8;
}

.retry-hint {
  font-size: 0.6875rem;
  color: var(--color-text-sub);
  text-transform: none;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
}

.status-dot.connected {
  background: var(--color-success);
}

.status-dot.disconnected {
  background: var(--color-error);
}

.control-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.control-field label {
  font-size: var(--text-xs);
  color: var(--color-text-sub);
}

.control-field select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  outline: none;
}

.btn-control {
  width: 100%;
  padding: 0.625rem;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.btn-primary {
  background: var(--color-info);
  color: var(--color-text);
}

.btn-pause {
  background: #ff9800;
  color: var(--color-text);
}

.btn-resume {
  background: var(--color-success);
  color: var(--color-text);
}

.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.queue-bar {
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.375rem;
}

.queue-fill {
  height: 100%;
  background: var(--color-success);
  transition: width 0.3s;
  border-radius: 3px;
}

.queue-label {
  font-size: var(--text-xs);
  color: var(--color-text-sub);
}

@media (max-width: 768px) {
  .control-panel {
    display: none;
  }

  .modal-overlay {
    padding: 0;
    align-items: stretch;
  }

  .modal-page {
    max-width: none;
    max-height: none;
    border-radius: 0;
    height: 100%;
  }
}
</style>
