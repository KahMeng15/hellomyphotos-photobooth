<template>
  <div class="frame-editor">
    <div class="editor-header">
      <button @click="$emit('close')" class="btn-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2>Edit Frame: <input v-model="draftFrame.name" class="name-input" /></h2>
      <div class="actions">
        <button @click="save" class="btn-primary" :disabled="saving">{{ saving ? 'Saving...' : 'Save' }}</button>
      </div>
    </div>

    <div class="editor-body">
      <div class="sidebar">
        <div class="section">
          <h3>Dimensions</h3>
          <p>Canvas Size: {{ draftFrame.canvasWidth }} x {{ draftFrame.canvasHeight }}</p>
          <div class="resize-row">
            <input type="number" v-model.number="resizeTargetWidth" placeholder="New Width" class="number-input" />
            <button @click="resizeCanvas" class="btn-secondary" :disabled="resizing">Resize</button>
          </div>
          <h4>Layering</h4>
          <select v-model="draftFrame.layering" class="number-input" style="margin-top: 0.5rem;">
            <option value="foreground">Foreground (Over photos)</option>
            <option value="background">Background (Under photos)</option>
          </select>
        </div>

        <div class="section">
          <h3>Placeholders ({{ draftFrame.placeholders.length }}/10)</h3>
          <button @click="addPlaceholder" class="btn-secondary btn-full" :disabled="draftFrame.placeholders.length >= 10">
            + Add Placeholder
          </button>
          
          <div class="placeholder-list">
            <div 
              v-for="(p, i) in draftFrame.placeholders" 
              :key="i"
              :class="['placeholder-item', { active: selectedIndex === i }]"
              @click="selectedIndex = i"
            >
              <span>Placeholder {{ i + 1 }}</span>
              <button @click.stop="removePlaceholder(i)" class="btn-icon btn-danger-icon">×</button>
            </div>
          </div>
        </div>

        <div v-if="selectedPlaceholder" class="section">
          <h3>Edit Placeholder {{ selectedIndex + 1 }}</h3>
          <div class="input-grid">
            <label>X: <input type="number" v-model.number="selectedPlaceholder.x" class="number-input" /></label>
            <label>Y: <input type="number" v-model.number="selectedPlaceholder.y" class="number-input" /></label>
            <label>W: <input type="number" v-model.number="selectedPlaceholder.width" class="number-input" /></label>
            <label>H: <input type="number" v-model.number="selectedPlaceholder.height" class="number-input" /></label>
          </div>
          <h4>Style</h4>
          <label class="full-label">
            Border Radius:
            <input type="number" v-model.number="selectedPlaceholder.borderRadius" class="number-input" />
          </label>
        </div>
      </div>

      <div class="canvas-container">
        <div 
          class="canvas-wrapper" 
          :style="{ 
            width: `${draftFrame.canvasWidth}px`, 
            height: `${draftFrame.canvasHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }"
        >
          <img :src="imageUrl" class="frame-bg" :style="{ zIndex: draftFrame.layering === 'background' ? 0 : 10 }" />
          <div 
            v-for="(p, i) in draftFrame.placeholders" 
            :key="i"
            :class="['placeholder-box', { active: selectedIndex === i }]"
            :style="{
              left: `${p.x}px`,
              top: `${p.y}px`,
              width: `${p.width}px`,
              height: `${p.height}px`,
              borderRadius: `${p.borderRadius}px`
            }"
            @mousedown.stop="startDrag($event, i)"
          >
            <span>{{ i + 1 }}</span>
            <div class="resize-handle se" @mousedown.stop="startResize($event, i)"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const props = defineProps<{ eventId: string, frame: any }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const draftFrame = ref(JSON.parse(JSON.stringify(props.frame)))
if (!draftFrame.value.layering) {
  draftFrame.value.layering = 'foreground'
}

const imageUrl = computed(() => `/api/admin/events/${props.eventId}/frames/${draftFrame.value.id}/image?t=${Date.now()}`)

const saving = ref(false)
const resizing = ref(false)
const resizeTargetWidth = ref<number | null>(null)

const selectedIndex = ref<number>(0)
const selectedPlaceholder = computed(() => draftFrame.value.placeholders[selectedIndex.value])

// Canvas scaling logic
const scale = ref(1)

function updateScale() {
  const container = document.querySelector('.canvas-container') as HTMLElement
  if (!container) return
  const availableWidth = container.clientWidth - 40
  const availableHeight = container.clientHeight - 40
  const scaleX = availableWidth / draftFrame.value.canvasWidth
  const scaleY = availableHeight / draftFrame.value.canvasHeight
  scale.value = Math.min(scaleX, scaleY, 1)
}

onMounted(() => {
  window.addEventListener('resize', updateScale)
  setTimeout(updateScale, 100)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScale)
})

function addPlaceholder() {
  if (draftFrame.value.placeholders.length >= 10) return
  draftFrame.value.placeholders.push({
    x: 100, y: 100, width: 400, height: 400,
    cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
    borderRadius: 0
  })
  selectedIndex.value = draftFrame.value.placeholders.length - 1
}

function removePlaceholder(index: number) {
  draftFrame.value.placeholders.splice(index, 1)
  if (selectedIndex.value >= draftFrame.value.placeholders.length) {
    selectedIndex.value = Math.max(0, draftFrame.value.placeholders.length - 1)
  }
}

async function resizeCanvas() {
  if (!resizeTargetWidth.value || resizeTargetWidth.value <= 0) return
  if (!confirm('This will modify the original frame image and scale all placeholders. Proceed?')) return
  
  resizing.value = true
  try {
    const res = await axios.post(`/api/admin/events/${props.eventId}/frames/${draftFrame.value.id}/resize`, {
      targetWidth: resizeTargetWidth.value
    })
    draftFrame.value = res.data.frame
    setTimeout(updateScale, 100)
  } catch (err) {
    alert('Failed to resize canvas')
  } finally {
    resizing.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await axios.patch(`/api/admin/events/${props.eventId}/frames/${draftFrame.value.id}`, {
      name: draftFrame.value.name,
      placeholders: draftFrame.value.placeholders,
      layering: draftFrame.value.layering
    })
    emit('close')
  } catch (err) {
    alert('Failed to save frame')
  } finally {
    saving.value = false
  }
}

// Drag and drop logic
let isDragging = false
let isResizing = false
let startX = 0
let startY = 0
let startPx = 0
let startPy = 0
let startPw = 0
let startPh = 0

function startDrag(e: MouseEvent, index: number) {
  selectedIndex.value = index
  isDragging = true
  startX = e.clientX
  startY = e.clientY
  const p = draftFrame.value.placeholders[index]
  startPx = p.x
  startPy = p.y
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) {
  if (!isDragging) return
  const dx = (e.clientX - startX) / scale.value
  const dy = (e.clientY - startY) / scale.value
  const p = draftFrame.value.placeholders[selectedIndex.value]
  p.x = Math.round(startPx + dx)
  p.y = Math.round(startPy + dy)
}

function stopDrag() {
  isDragging = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

function startResize(e: MouseEvent, index: number) {
  selectedIndex.value = index
  isResizing = true
  startX = e.clientX
  startY = e.clientY
  const p = draftFrame.value.placeholders[index]
  startPw = p.width
  startPh = p.height
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing) return
  const dx = (e.clientX - startX) / scale.value
  const dy = (e.clientY - startY) / scale.value
  const p = draftFrame.value.placeholders[selectedIndex.value]
  p.width = Math.max(10, Math.round(startPw + dx))
  p.height = Math.max(10, Math.round(startPh + dy))
}

function stopResize() {
  isResizing = false
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}
</script>

<style scoped>
.frame-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f0f0f;
  position: absolute;
  inset: 0;
  z-index: 50;
}
.editor-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
}
.btn-back {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  padding: 0.5rem;
}
.btn-back:hover { color: #fff; }
.name-input {
  background: transparent;
  border: none;
  border-bottom: 1px dashed #555;
  color: #fff;
  font-size: 1.25rem;
  font-weight: 600;
  outline: none;
  padding: 0.25rem;
  width: 300px;
}
.name-input:focus { border-color: #2196F3; }
.actions { margin-left: auto; }
.btn-primary { background: #2196F3; color: #fff; border: none; padding: 0.5rem 1.5rem; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-primary:hover:not(:disabled) { background: #1976D2; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  background: #1a1a1a;
  border-right: 1px solid #2a2a2a;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section h3 { margin: 0 0 1rem; font-size: 1rem; color: #fff; }
.section h4 { margin: 1rem 0 0.5rem; font-size: 0.875rem; color: #ccc; }

.resize-row { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.number-input {
  background: #0f0f0f;
  border: 1px solid #333;
  color: #fff;
  padding: 0.375rem;
  border-radius: 4px;
  width: 100%;
}
.btn-secondary { background: #333; color: #fff; border: none; padding: 0.375rem 0.75rem; border-radius: 4px; cursor: pointer; }
.btn-secondary:hover { background: #444; }
.btn-full { width: 100%; margin-bottom: 1rem; }

.placeholder-list { display: flex; flex-direction: column; gap: 0.5rem; }
.placeholder-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: #222;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
}
.placeholder-item:hover { background: #2a2a2a; }
.placeholder-item.active { border-color: #2196F3; background: #1a2a3a; }

.btn-icon { background: none; border: none; cursor: pointer; color: #888; font-size: 1.25rem; padding: 0 0.5rem; }
.btn-icon:hover { color: #f44336; }

.input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.input-grid label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #888; }
.full-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #888; }

.canvas-container {
  flex: 1;
  overflow: auto;
  position: relative;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
}

.canvas-wrapper {
  position: absolute;
  top: 20px;
  left: 20px;
  background: transparent;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
}

.frame-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
}

.placeholder-box {
  position: absolute;
  background: rgba(33, 150, 243, 0.3);
  border: 2px dashed #2196F3;
  z-index: 5;
  cursor: move;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 3rem;
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  box-sizing: border-box;
}

.placeholder-box.active {
  background: rgba(33, 150, 243, 0.5);
  border: 2px solid #2196F3;
  z-index: 6;
}

.resize-handle {
  position: absolute;
  width: 20px;
  height: 20px;
  background: #2196F3;
  border-radius: 50%;
  right: -10px;
  bottom: -10px;
  cursor: se-resize;
  border: 2px solid #fff;
}
</style>
