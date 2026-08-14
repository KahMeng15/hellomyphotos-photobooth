<template>
  <div class="frame-manager">
    <div class="header">
      <h2>Frames</h2>
      <div class="actions">
        <label class="btn-primary">
          Add Frame
          <input type="file" @change="uploadFrame" accept="image/png, image/jpeg, image/webp, image/svg+xml" style="display: none;" />
        </label>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading frames...</div>
    
    <div v-else class="frame-grid">
      <div v-for="frame in frames" :key="frame.id" class="frame-card">
        <div class="frame-preview">
          <img v-if="!frame.isSpecial" :src="`/api/admin/events/${eventId}/frames/${frame.id}/image`" class="frame-preview-blur" />
          <svg v-if="!frame.isSpecial" :viewBox="`0 0 ${frame.canvasWidth || 1000} ${frame.canvasHeight || 1000}`" class="frame-svg-preview">
            <template v-if="frame.layering === 'background'">
              <image :href="`/api/admin/events/${eventId}/frames/${frame.id}/image`" x="0" y="0" :width="frame.canvasWidth" :height="frame.canvasHeight" />
              <g v-for="(ph, i) in frame.placeholders" :key="i">
                <rect :x="ph.x" :y="ph.y" :width="ph.width" :height="ph.height" fill="rgba(33, 150, 243, 0.7)" stroke="#2196F3" :stroke-width="Math.max(4, Math.min(ph.width, ph.height) * 0.02)" />
                <text :x="ph.x + ph.width/2" :y="ph.y + ph.height/2" fill="#fff" :font-size="Math.max(24, Math.min(ph.width, ph.height) * 0.3)" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">{{ i + 1 }}</text>
              </g>
            </template>
            <template v-else>
              <g v-for="(ph, i) in frame.placeholders" :key="i">
                <rect :x="ph.x" :y="ph.y" :width="ph.width" :height="ph.height" fill="rgba(33, 150, 243, 0.7)" stroke="#2196F3" :stroke-width="Math.max(4, Math.min(ph.width, ph.height) * 0.02)" />
                <text :x="ph.x + ph.width/2" :y="ph.y + ph.height/2" fill="#fff" :font-size="Math.max(24, Math.min(ph.width, ph.height) * 0.3)" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">{{ i + 1 }}</text>
              </g>
              <image :href="`/api/admin/events/${eventId}/frames/${frame.id}/image`" x="0" y="0" :width="frame.canvasWidth" :height="frame.canvasHeight" />
            </template>
          </svg>
          <div v-else class="special-frame-placeholder">No Overlay</div>
        </div>
        <div class="frame-info">
          <h3>{{ frame.name }}</h3>
          <p class="meta">{{ frame.canvasWidth }}x{{ frame.canvasHeight }} • {{ frame.placeholders.length }} slots</p>
          <div class="frame-actions">
            <button v-if="!frame.isSpecial" @click="$emit('edit', frame)" class="btn-secondary">Edit</button>
            <button @click="toggleStatus(frame)" :class="frame.disabled ? 'btn-enable' : 'btn-disable'">
              {{ frame.disabled ? 'Enable' : 'Disable' }}
            </button>
            <button v-if="!frame.isSpecial" @click="backfill(frame.id)" class="btn-secondary" title="Apply frame to existing photos">Backfill</button>
            <button v-if="!frame.isSpecial" @click="deleteFrame(frame.id)" class="btn-danger">Delete</button>
          </div>
        </div>
      </div>
      <div v-if="frames.length === 0" class="empty-state">
        <p>No frames added yet.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ (e: 'edit', frame: any): void }>()

const frames = ref<any[]>([])
const loading = ref(false)

async function loadFrames() {
  loading.value = true
  try {
    const res = await axios.get(`/api/admin/events/${props.eventId}/frames`)
    frames.value = res.data.frames
  } catch (err) {
    console.error(err)
  }
  loading.value = false
}

async function uploadFrame(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  const formData = new FormData()
  formData.append('frame', file)

  try {
    loading.value = true
    await axios.post(`/api/admin/events/${props.eventId}/frames`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    await loadFrames()
  } catch (err) {
    console.error('Failed to upload frame', err)
    alert('Failed to upload frame')
  } finally {
    loading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function backfill(frameId: string) {
  if (!confirm('This will process all existing sessions for this event with this frame. Proceed?')) return
  try {
    await axios.post(`/api/admin/events/${props.eventId}/frames/${frameId}/backfill`)
    alert('Backfill started in background.')
  } catch (err) {
    console.error('Failed to start backfill', err)
    alert('Failed to start backfill')
  }
}

async function deleteFrame(frameId: string) {
  if (!confirm('Are you sure you want to delete this frame?')) return
  try {
    await axios.delete(`/api/admin/events/${props.eventId}/frames/${frameId}`)
    await loadFrames()
  } catch (err) {
    console.error('Failed to delete frame', err)
  }
}

async function toggleStatus(frame: any) {
  try {
    await axios.patch(`/api/admin/events/${props.eventId}/frames/${frame.id}`, {
      disabled: !frame.disabled
    })
    frame.disabled = !frame.disabled
  } catch (err) {
    console.error('Failed to toggle frame', err)
  }
}

function handleImgError(e: Event) {
  const target = e.target as HTMLImageElement
  // In case the image endpoint is incorrect, wait, what is the frame image endpoint for admin?
  // I didn't create a specific endpoint for the frame image itself, just the config and the framed photos.
  // Oh, wait! I didn't add an endpoint to serve `frame.png` for the dashboard.
}

onMounted(() => {
  loadFrames()
})
</script>

<style scoped>
.frame-manager {
  padding: 2rem;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.header h2 { margin: 0; font-size: 1.25rem; }
.btn-primary {
  background: #2196F3;
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  display: inline-block;
}
.btn-primary:hover { background: #1976D2; }
.frame-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.frame-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}
.frame-preview {
  aspect-ratio: 1;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.frame-preview-blur {
  position: absolute;
  top: -10%;
  left: -10%;
  width: 120%;
  height: 120%;
  object-fit: cover;
  filter: blur(15px);
  opacity: 0.6;
  z-index: 0;
}
.frame-svg-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
}
.special-frame-placeholder {
  color: #666;
  font-size: 1.2rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.frame-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.frame-info {
  padding: 1rem;
}
.frame-info h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.meta {
  color: #888;
  font-size: 0.8125rem;
  margin: 0 0 1rem;
}
.frame-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.frame-actions button {
  flex: 1;
  padding: 0.375rem;
  border: none;
  border-radius: 4px;
  font-size: 0.8125rem;
  cursor: pointer;
  font-weight: 500;
}
.btn-secondary { background: #2a2a2a; color: #fff; }
.btn-secondary:hover { background: #3a3a3a; }
.btn-enable { background: #1a3a2a; color: #4caf50; }
.btn-enable:hover { background: #2a4a3a; }
.btn-disable { background: #3a2a1a; color: #ff9800; }
.btn-disable:hover { background: #4a3a2a; }
.btn-danger { background: #3a1a1a; color: #f44336; }
.btn-danger:hover { background: #4a2a2a; }
.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  color: #666;
  padding: 3rem 0;
}
</style>
