<template>
  <div class="frame-editor">
    <div class="editor-header">
      <div class="header-left">
        <button @click="$emit('close')" class="btn-icon-nav" title="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2>Edit Frame: <input v-model="draftFrame.name" class="name-input" /></h2>
      </div>
      <div class="actions">
        <button @click="save" class="btn-primary" :disabled="saving">{{ saving ? 'Saving...' : 'Save Changes' }}</button>
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
          <div class="ph-header">
            <h3>Edit Placeholder {{ selectedIndex + 1 }}</h3>
            <button @click="selectedPlaceholder.aspectRatioLocked = !selectedPlaceholder.aspectRatioLocked" class="btn-icon" :title="selectedPlaceholder.aspectRatioLocked ? 'Unlock Aspect Ratio' : 'Lock Aspect Ratio'">
              {{ selectedPlaceholder.aspectRatioLocked ? '🔒' : '🔓' }}
            </button>
          </div>
          <div class="input-grid">
            <label>X (px): <input type="number" v-model.number="selectedPlaceholder.x" class="number-input" /></label>
            <label>Y (px): <input type="number" v-model.number="selectedPlaceholder.y" class="number-input" /></label>
            <label>W (px): <input type="number" :value="selectedPlaceholder.width" @input="updateW($event)" class="number-input" /></label>
            <label>H (px): <input type="number" :value="selectedPlaceholder.height" @input="updateH($event)" class="number-input" /></label>
          </div>
          <h4>Style</h4>
          <label class="full-label">
            Border Radius (px):
            <input type="number" v-model.number="selectedPlaceholder.borderRadius" class="number-input" />
          </label>
        </div>
      </div>

      <div class="canvas-area">
        <div class="zoom-toolbar">
          <button @click="zoomOut" class="btn-icon" title="Zoom Out">➖</button>
          <span>{{ Math.round(userZoom * 100) }}%</span>
          <button @click="zoomIn" class="btn-icon" title="Zoom In">➕</button>
          <button @click="fitZoom" class="btn-secondary btn-sm" style="margin-left: 0.5rem;">Fit</button>
        </div>
        <div class="canvas-container" ref="canvasContainer" @mousedown="startPan" :class="{ 'is-panning': isPanning }">
          <div class="outer-canvas-wrapper" :style="{ width: draftFrame.canvasWidth * userZoom + 'px', height: draftFrame.canvasHeight * userZoom + 'px' }">
          <div 
            class="canvas-wrapper" 
            :style="{ 
              width: `${draftFrame.canvasWidth}px`, 
              height: `${draftFrame.canvasHeight}px`,
              transform: `scale(${userZoom})`,
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

const canvasContainer = ref<HTMLElement | null>(null)

// Panning logic
const isPanning = ref(false)
let panStartX = 0
let panStartY = 0
let panStartScrollLeft = 0
let panStartScrollTop = 0

function startPan(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.placeholder-box') || (e.target as HTMLElement).closest('.zoom-toolbar')) return
  isPanning.value = true
  panStartX = e.clientX
  panStartY = e.clientY
  if (canvasContainer.value) {
    panStartScrollLeft = canvasContainer.value.scrollLeft
    panStartScrollTop = canvasContainer.value.scrollTop
  }
  window.addEventListener('mousemove', onPan)
  window.addEventListener('mouseup', stopPan)
}

function onPan(e: MouseEvent) {
  if (!isPanning.value || !canvasContainer.value) return
  const dx = e.clientX - panStartX
  const dy = e.clientY - panStartY
  canvasContainer.value.scrollLeft = panStartScrollLeft - dx
  canvasContainer.value.scrollTop = panStartScrollTop - dy
}

function stopPan() {
  isPanning.value = false
  window.removeEventListener('mousemove', onPan)
  window.removeEventListener('mouseup', stopPan)
}

// Canvas scaling logic
const userZoom = ref(1)

function updateScale() {
  const container = document.querySelector('.canvas-container') as HTMLElement
  if (!container) return
  const availableWidth = container.clientWidth - 80
  const availableHeight = container.clientHeight - 80
  const scaleX = availableWidth / draftFrame.value.canvasWidth
  const scaleY = availableHeight / draftFrame.value.canvasHeight
  userZoom.value = Math.min(scaleX, scaleY, 1)
}

function zoomIn() { userZoom.value = Math.min(3, userZoom.value + 0.1) }
function zoomOut() { userZoom.value = Math.max(0.1, userZoom.value - 0.1) }
function fitZoom() { updateScale() }

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
    x: 100, y: 100, width: 500, height: 400, // 5:4 aspect ratio
    aspectRatioLocked: true,
    cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
    borderRadius: 0
  })
  selectedIndex.value = draftFrame.value.placeholders.length - 1
}

function updateW(e: Event) {
  const p = draftFrame.value.placeholders[selectedIndex.value]
  const newW = parseInt((e.target as HTMLInputElement).value) || 0
  if (p.aspectRatioLocked && p.height > 0) {
    p.height = Math.round(newW / (p.width / p.height))
  }
  p.width = newW
}

function updateH(e: Event) {
  const p = draftFrame.value.placeholders[selectedIndex.value]
  const newH = parseInt((e.target as HTMLInputElement).value) || 0
  if (p.aspectRatioLocked && p.width > 0) {
    p.width = Math.round(newH * (p.width / p.height))
  }
  p.height = newH
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
  const dx = (e.clientX - startX) / userZoom.value
  const dy = (e.clientY - startY) / userZoom.value
  const p = draftFrame.value.placeholders[selectedIndex.value]
  p.x = Math.round(startPx + dx)
  p.y = Math.round(startPy + dy)
}

function stopDrag() {
  isDragging = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

let startRatio = 1

function startResize(e: MouseEvent, index: number) {
  selectedIndex.value = index
  isResizing = true
  startX = e.clientX
  startY = e.clientY
  const p = draftFrame.value.placeholders[index]
  startPw = p.width
  startPh = p.height
  startRatio = p.width / p.height || 1
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing) return
  const dx = (e.clientX - startX) / userZoom.value
  const dy = (e.clientY - startY) / userZoom.value
  const p = draftFrame.value.placeholders[selectedIndex.value]
  
  let newW = Math.max(10, Math.round(startPw + dx))
  let newH = Math.max(10, Math.round(startPh + dy))
  
  if (p.aspectRatioLocked) {
    newH = Math.round(newW / startRatio)
  }
  
  p.width = newW
  p.height = newH
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
  justify-content: space-between;
  padding: 1rem 2rem;
  background: #111;
  border-bottom: 1px solid #2a2a2a;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.btn-icon-nav {
  background: #2a2a2a;
  border: none;
  color: #fff;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-icon-nav:hover { background: #3a3a3a; }
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

.ph-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.ph-header h3 { margin: 0; font-size: 1rem; color: #fff; }

.canvas-area {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  overflow: auto;
  position: relative;
  background: #0b0b0b;
  display: flex;
  cursor: grab;
}
.canvas-container:active {
  cursor: grabbing;
}
.canvas-container.is-panning * {
  pointer-events: none;
}

.outer-canvas-wrapper {
  margin: auto;
}

.canvas-wrapper {
  position: relative;
  background: transparent;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
}

.zoom-toolbar {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: #222;
  border: 1px solid #333;
  padding: 0.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.zoom-toolbar span { color: #fff; font-size: 0.875rem; min-width: 40px; text-align: center; }
.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; border-radius: 4px; }

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
  background: rgba(33, 150, 243, 0.7);
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
