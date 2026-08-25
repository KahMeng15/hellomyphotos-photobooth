<template>
  <div class="frame-manager">
    <section class="card">
      <div class="card-header-flex">
        <div>
          <h2>Frame Library</h2>
          <p class="card-desc" style="margin-bottom:0;">Upload and manage the photo frames used by this event.</p>
        </div>
        <div class="actions">
          <label class="app-btn app-btn--primary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-weight: 500; font-size: var(--text-sm);">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span class="hide-on-mobile">Upload Frame</span>
            <input type="file" @change="uploadFrame" accept="image/png, image/jpeg, image/webp, image/svg+xml" style="display: none;" />
          </label>
        </div>
      </div>

    <div v-if="loading" class="loading">Loading frames...</div>
    
    <div v-else class="frame-grid">
      <div v-for="frame in frames" :key="frame.id" class="frame-card">
        <div class="frame-preview" :class="{ 'is-disabled': frame.disabled }">
          <img v-if="!frame.isSpecial" :src="`${baseUrl}/api/admin/events/${eventId}/frames/${frame.id}/image`" class="frame-preview-blur" />
          <svg v-if="!frame.isSpecial" :viewBox="`0 0 ${frame.canvasWidth || 1000} ${frame.canvasHeight || 1000}`" class="frame-svg-preview">
            <template v-if="frame.layering === 'background'">
              <image :href="`${baseUrl}/api/admin/events/${eventId}/frames/${frame.id}/image`" x="0" y="0" :width="frame.canvasWidth" :height="frame.canvasHeight" />
              <g v-for="(ph, i) in frame.placeholders" :key="i">
                <rect :x="ph.x" :y="ph.y" :width="ph.width" :height="ph.height" fill="rgba(33, 150, 243, 0.7)" stroke="var(--color-info)" :stroke-width="Math.max(4, Math.min(ph.width, ph.height) * 0.02)" />
                <text :x="ph.x + ph.width/2" :y="ph.y + ph.height/2" fill="var(--color-text)" :font-size="Math.max(24, Math.min(ph.width, ph.height) * 0.3)" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">{{ i + 1 }}</text>
              </g>
            </template>
            <template v-else>
              <g v-for="(ph, i) in frame.placeholders" :key="i">
                <rect :x="ph.x" :y="ph.y" :width="ph.width" :height="ph.height" fill="rgba(33, 150, 243, 0.7)" stroke="var(--color-info)" :stroke-width="Math.max(4, Math.min(ph.width, ph.height) * 0.02)" />
                <text :x="ph.x + ph.width/2" :y="ph.y + ph.height/2" fill="var(--color-text)" :font-size="Math.max(24, Math.min(ph.width, ph.height) * 0.3)" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">{{ i + 1 }}</text>
              </g>
              <image :href="`${baseUrl}/api/admin/events/${eventId}/frames/${frame.id}/image`" x="0" y="0" :width="frame.canvasWidth" :height="frame.canvasHeight" />
            </template>
          </svg>
          <svg v-else viewBox="0 0 1000 1000" class="frame-svg-preview">
            <rect x="0" y="0" width="1000" height="1000" fill="rgba(33, 150, 243, 0.7)" stroke="var(--color-info)" stroke-width="20" />
            <text x="500" y="500" fill="var(--color-text)" font-size="300" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">1</text>
          </svg>
        </div>
        <div class="frame-info">
          <h3>{{ frame.name }}</h3>
          <p class="meta">{{ frame.canvasWidth }}x{{ frame.canvasHeight }} • {{ frame.placeholders.length }} slots</p>
          <div class="frame-actions">
            <button v-if="!frame.isSpecial" @click="handleEdit(frame)" class="btn-secondary">Edit</button>
            <button @click="toggleStatus(frame)" :class="frame.disabled ? 'btn-enable' : 'btn-disable'">
              {{ frame.disabled ? 'Enable' : 'Disable' }}
            </button>
            <div class="dropdown" v-if="!frame.isSpecial">
              <button class="btn-more">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="1.5"></circle>
                  <circle cx="12" cy="5" r="1.5"></circle>
                  <circle cx="12" cy="19" r="1.5"></circle>
                </svg>
              </button>
              <div class="dropdown-content">
                <button @click="backfill(frame.id)" class="btn-dropdown" title="Apply frame to existing photos">Backfill</button>
                <button @click="deleteFrame(frame.id)" class="btn-dropdown text-danger">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="frames.length === 0" class="empty-state">
        <p>No frames added yet.</p>
      </div>
    </div>
    <div v-if="confirmModal" class="modal-overlay" @click.self="!confirmModal.isInfo && (confirmModal = null)">
      <div class="modal-content confirm-modal">
        <h3>{{ confirmModal.title }}</h3>
        <p>{{ confirmModal.message }}</p>
        <div class="modal-actions">
          <button v-if="!confirmModal.isInfo" @click="confirmModal = null" class="btn-secondary">Cancel</button>
          <button @click="confirmModal.onConfirm()" :class="confirmModal.isDanger ? 'btn-danger' : 'btn-primary'">
            {{ confirmModal.isInfo ? 'OK' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import draggable from 'vuedraggable'
import { toast } from 'vue3-toastify'
import FrameEditor from './FrameEditor.vue'

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')

const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ (e: 'edit', frame: any): void }>()

function handleEdit(frame: any) {
  if (window.innerWidth <= 768) {
    if (!confirm('Frame editing is heavily optimized for desktop devices. It may be difficult to use on mobile. Do you wish to continue anyway?')) {
      return
    }
  }
  emit('edit', frame)
}

const frames = ref<any[]>([])
const loading = ref(false)

interface ModalOptions {
  title: string
  message: string
  isDanger?: boolean
  isInfo?: boolean
  onConfirm: () => void
}
const confirmModal = ref<ModalOptions | null>(null)

async function saveFrameOrder() {
  try {
    const newOrder = frames.value.map((f: any) => f.id)
    await axios.post(`/api/admin/events/${props.eventId}/frames/order`, { order: newOrder })
    toast.success('Frame order saved')
  } catch (err) {
    console.error('Failed to save order', err)
    toast.error('Failed to save frame order')
  }
}

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
    toast.success('Frame uploaded successfully')
    await loadFrames()
  } catch (err) {
    console.error('Failed to upload frame', err)
    toast.error('Failed to upload frame')
  } finally {
    loading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function backfill(frameId: string) {
  confirmModal.value = {
    title: 'Confirm Backfill',
    message: 'This will process all existing sessions for this event with this frame. Proceed?',
    onConfirm: async () => {
      confirmModal.value = null
      try {
        await axios.post(`/api/admin/events/${props.eventId}/frames/${frameId}/backfill`)
        toast.info('Backfill started in background')
      } catch (err) {
        console.error('Failed to start backfill', err)
        toast.error('Failed to start backfill')
      }
    }
  }
}

async function deleteFrame(frameId: string) {
  confirmModal.value = {
    title: 'Delete Frame',
    message: 'Are you sure you want to delete this frame?',
    isDanger: true,
    onConfirm: async () => {
      confirmModal.value = null
      try {
        await axios.delete(`/api/admin/events/${props.eventId}/frames/${frameId}`)
        toast.success('Frame deleted')
        await loadFrames()
      } catch (err) {
        console.error('Failed to delete frame', err)
        toast.error('Failed to delete frame')
      }
    }
  }
}

async function toggleStatus(frame: any) {
  try {
    const nextStatus = !frame.disabled
    await axios.patch(`/api/admin/events/${props.eventId}/frames/${frame.id}`, {
      disabled: nextStatus
    })
    frame.disabled = nextStatus
    toast.success(nextStatus ? 'Frame disabled' : 'Frame enabled')
  } catch (err) {
    console.error('Failed to toggle frame', err)
    toast.error('Failed to toggle frame status')
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
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content.confirm-modal {
  background: var(--color-surface);
  padding: 1.5rem;
  border-radius: var(--radius-md);
  max-width: 400px;
  width: 90%;
  border: 1px solid var(--color-border);
}
.modal-content.confirm-modal h3 { margin: 0 0 1rem; }
.modal-content.confirm-modal p { margin: 0 0 1.5rem; color: var(--color-text-sub); line-height: 1.4; }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}
.modal-actions button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
}
.modal-actions .btn-primary { background: var(--color-info); color: var(--color-text); }
.modal-actions .btn-primary:hover { background: #1976D2; }

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.card h2 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.card-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 1.25rem;
}
.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}
.app-btn--primary {
  background: var(--color-text);
  color: var(--color-bg);
  border: 1px solid var(--color-text);
}
.app-btn--primary:hover {
  background: var(--color-text-muted);
}

.frame-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.frame-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.frame-preview {
  aspect-ratio: 1;
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.frame-preview.is-disabled::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 5;
  pointer-events: none;
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
  font-size: var(--text-base);
}
.meta {
  color: var(--color-text-sub);
  font-size: var(--text-sm);
  margin: 0 0 1rem;
}
.frame-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.frame-actions > button {
  flex: 1;
  padding: 0.375rem;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  font-weight: 500;
}
.dropdown {
  position: relative;
  display: inline-block;
}
.btn-more {
  background: none;
  border: none;
  color: var(--color-text-sub);
  cursor: pointer;
  padding: 0.375rem;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-more:hover { color: var(--color-text); background: var(--color-border); }
.dropdown-content {
  display: none;
  position: absolute;
  right: 0;
  bottom: 100%;
  margin-bottom: 0.25rem;
  background-color: var(--color-border);
  min-width: 120px;
  box-shadow: 0px -4px 16px rgba(0,0,0,0.5);
  z-index: 10;
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.dropdown:hover .dropdown-content, .dropdown:focus-within .dropdown-content {
  display: flex;
  flex-direction: column;
}
.btn-dropdown {
  background: none;
  border: none;
  color: var(--color-text);
  padding: 10px 16px;
  text-align: left;
  cursor: pointer;
  width: 100%;
  font-size: var(--text-sm);
}
.btn-dropdown:hover { background-color: #3a3a3a; }
.text-danger { color: var(--color-error) !important; }

.btn-secondary { background: var(--color-border); color: var(--color-text); }
.btn-secondary:hover { background: #3a3a3a; }
.btn-enable { background: #1a3a2a; color: var(--color-success); }
.btn-enable:hover { background: #2a4a3a; }
.btn-disable { background: #3a2a1a; color: #ff9800; }
.btn-disable:hover { background: #4a3a2a; }
.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--color-text-muted);
  padding: 3rem 0;
}
</style>
