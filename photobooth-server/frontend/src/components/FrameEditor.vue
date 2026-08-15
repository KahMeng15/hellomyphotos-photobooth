<template>
  <div class="frame-editor">
    <div class="editor-header">
      <div class="header-left">
        <button @click="requestClose" class="btn-icon-nav" title="Back">
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
          <div class="input-grid" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
            <label>W (px): <input type="number" :value="draftFrame.canvasWidth" @input="updateWCanvas" class="number-input" /></label>
            <label>H (px): <input type="number" :value="draftFrame.canvasHeight" @input="updateHCanvas" class="number-input" /></label>
          </div>
        </div>

        <div class="section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">Layers</h3>
            <div>
              <button @click="addText" class="btn-secondary btn-sm" title="Add Text" style="margin-right: 0.5rem;">+ Text</button>
              <button @click="addPlaceholder" class="btn-secondary btn-sm" :disabled="draftFrame.placeholders.length >= 10" title="Add Placeholder">+ Placeholder</button>
            </div>
          </div>
          
          <div class="placeholder-list">
            <div 
              v-for="(layer, index) in layerList" 
              :key="layer.id"
              :class="['placeholder-item', { 
                active: selectedType === layer.type && selectedIndex === layer.index, 
                'is-image': layer.type === 'image',
                'drag-over-top': dragOverIndex === index && dragOverPosition === 'top',
                'drag-over-bottom': dragOverIndex === index && dragOverPosition === 'bottom'
              }]"
              draggable="true"
              @dragstart="onLayerDragStart($event, index)"
              @dragover.prevent="onLayerDragOver($event, index)"
              @dragleave="onLayerDragLeave($event)"
              @dragend="onLayerDragEnd"
              @drop="onLayerDrop($event, index)"
              @click="if (layer.type !== 'image') { selectedType = layer.type; selectedIndex = layer.index; }"
            >
              <div class="layer-left">
                <span class="drag-handle">☰</span>
                <span>{{ layer.name }}</span>
              </div>
              <button v-if="layer.type !== 'image'" @click.stop="removeItem(layer.type, layer.index)" class="btn-icon btn-danger-icon">×</button>
            </div>
          </div>
        </div>

        <div v-if="selectedType === 'text' && selectedText" class="section">
          <div class="ph-header">
            <h3 style="display: flex; align-items: center; width: 100%;">
              <input type="text" v-model="selectedText.name" style="flex: 1; min-width: 0; background: transparent; color: white; border: none; border-bottom: 1px solid #444; font-size: 1.1rem; padding: 2px 0;" />
            </h3>
          </div>
          <label style="display:block; margin-bottom: 0.5rem; color:#ccc; font-size: 0.875rem;">
            Content (e.g. {{date}}, {{time}}, {{filename}}):
            <input type="text" v-model="selectedText.text" class="number-input" style="width:100%; margin-top:0.25rem;" />
          </label>
          <div class="input-grid">
            <label>Anchor Y: 
              <select v-model="selectedText.anchorY" class="number-input">
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label>Offset Y: <input type="number" v-model.number="selectedText.offsetY" class="number-input" /></label>
            <label>Anchor X: 
              <select v-model="selectedText.anchorX" class="number-input">
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>Offset X: <input type="number" v-model.number="selectedText.offsetX" class="number-input" :disabled="selectedText.anchorX === 'center'" /></label>
            <label>Font Size: <input type="number" v-model.number="selectedText.fontSize" class="number-input" /></label>
            <label>Color: <input type="color" v-model="selectedText.color" class="number-input" style="padding:0; height: 32px;" /></label>
            <label>Align: 
              <select v-model="selectedText.align" class="number-input">
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>Orientation: 
              <select v-model.number="selectedText.orientation" class="number-input">
                <option :value="0">0°</option>
                <option :value="90">90° (Clockwise)</option>
                <option :value="180">180° (Upside Down)</option>
                <option :value="-90">-90° (Counter-clockwise)</option>
              </select>
            </label>
          </div>
        </div>

        <div v-if="selectedType === 'placeholder' && selectedPlaceholder" class="section">
          <div class="ph-header">
            <h3 style="display: flex; align-items: center; width: 100%; margin-right: 0.5rem;">
              <input type="text" v-model="selectedPlaceholder.name" style="flex: 1; min-width: 0; background: transparent; color: white; border: none; border-bottom: 1px solid #444; font-size: 1.1rem; padding: 2px 0;" />
            </h3>
            <button @click="selectedPlaceholder.aspectRatioLocked = !selectedPlaceholder.aspectRatioLocked" class="btn-icon" :title="selectedPlaceholder.aspectRatioLocked ? 'Unlock Aspect Ratio' : 'Lock Aspect Ratio'">
              <svg v-if="selectedPlaceholder.aspectRatioLocked" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
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
          <div 
            v-for="(t, i) in draftFrame.texts" 
            :key="'txt-'+i"
            :class="['text-box', { active: selectedType === 'text' && selectedIndex === i }]"
            :style="{
              [t.anchorY]: `${t.offsetY}px`,
              [t.anchorX]: t.anchorX !== 'center' ? `${t.offsetX}px` : undefined,
              left: t.anchorX === 'center' ? '50%' : undefined,
              transform: (t.anchorX === 'center' ? 'translateX(-50%) ' : '') + `rotate(${t.orientation || 0}deg)`,
              transformOrigin: t.anchorX === 'center' ? 'center center' : (t.anchorX === 'right' ? 'right center' : 'left center'),
              fontSize: `${t.fontSize}px`,
              color: t.color,
              textAlign: t.align || 'left',
              zIndex: 20
            }"
            @mousedown.stop="selectedType = 'text'; selectedIndex = i"
          >
            {{ t.text || 'Custom Text' }}
          </div>
          </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showExitModal" class="modal-overlay">
      <div class="modal">
        <h3>Unsaved Changes</h3>
        <p>You have unsaved changes to this frame. Do you want to save them before exiting?</p>
        <div class="modal-actions">
          <button @click="showExitModal = false" class="btn-secondary">Cancel</button>
          <button @click="emit('close')" class="btn-danger">Don't Save</button>
          <button @click="save" class="btn-primary">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import axios from 'axios'
import { toast } from 'vue3-toastify'

const props = defineProps<{ eventId: string, frame: any }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const draftFrame = ref(JSON.parse(JSON.stringify(props.frame)))
if (!draftFrame.value.layering) {
  draftFrame.value.layering = 'foreground'
}

draftFrame.value.placeholders.forEach((p: any, i: number) => {
  if (!p.name) p.name = `Placeholder ${i + 1}`
  if (!p._id) p._id = Math.random().toString(36).substring(7)
})

if (!draftFrame.value.texts) {
  draftFrame.value.texts = []
} else {
  draftFrame.value.texts.forEach((t: any, i: number) => {
    if (!t.name) t.name = `Text ${i + 1}`
    if (!t._id) t._id = Math.random().toString(36).substring(7)
  })
}

const isDirty = ref(false)
const showExitModal = ref(false)

watch(() => draftFrame.value, () => {
  isDirty.value = true
}, { deep: true })

setTimeout(() => { isDirty.value = false }, 10)

function requestClose() {
  if (isDirty.value) {
    showExitModal.value = true
  } else {
    emit('close')
  }
}

const imageUrl = computed(() => `/api/admin/events/${props.eventId}/frames/${draftFrame.value.id}/image?t=${Date.now()}`)

const saving = ref(false)

function updateWCanvas(e: Event) {
  const w = parseInt((e.target as HTMLInputElement).value) || 0
  if (draftFrame.value.canvasWidth === 0 || w <= 0) return
  
  const scale = w / draftFrame.value.canvasWidth
  const ratio = draftFrame.value.canvasWidth / draftFrame.value.canvasHeight
  
  draftFrame.value.canvasWidth = w
  draftFrame.value.canvasHeight = Math.round(w / ratio)
  
  draftFrame.value.placeholders.forEach((p: any) => {
    p.x = Math.round(p.x * scale)
    p.y = Math.round(p.y * scale)
    p.width = Math.round(p.width * scale)
    p.height = Math.round(p.height * scale)
    p.cropTop = Math.round((p.cropTop || 0) * scale)
    p.cropBottom = Math.round((p.cropBottom || 0) * scale)
    p.cropLeft = Math.round((p.cropLeft || 0) * scale)
    p.cropRight = Math.round((p.cropRight || 0) * scale)
  })
}

function updateHCanvas(e: Event) {
  const h = parseInt((e.target as HTMLInputElement).value) || 0
  if (draftFrame.value.canvasHeight === 0 || h <= 0) return
  
  const scale = h / draftFrame.value.canvasHeight
  const ratio = draftFrame.value.canvasWidth / draftFrame.value.canvasHeight
  
  draftFrame.value.canvasHeight = h
  draftFrame.value.canvasWidth = Math.round(h * ratio)
  
  draftFrame.value.placeholders.forEach((p: any) => {
    p.x = Math.round(p.x * scale)
    p.y = Math.round(p.y * scale)
    p.width = Math.round(p.width * scale)
    p.height = Math.round(p.height * scale)
    p.cropTop = Math.round((p.cropTop || 0) * scale)
    p.cropBottom = Math.round((p.cropBottom || 0) * scale)
    p.cropLeft = Math.round((p.cropLeft || 0) * scale)
    p.cropRight = Math.round((p.cropRight || 0) * scale)
  })
}

const selectedType = ref<'placeholder' | 'text'>('placeholder')
const selectedIndex = ref<number>(0)

const selectedPlaceholder = computed(() => selectedType.value === 'placeholder' ? draftFrame.value.placeholders[selectedIndex.value] : null)
const selectedText = computed(() => selectedType.value === 'text' ? draftFrame.value.texts[selectedIndex.value] : null)

const layerList = computed(() => {
  const phs = draftFrame.value.placeholders.map((p: any, i: number) => ({
    type: 'placeholder',
    index: i,
    name: p.name,
    id: p._id
  }))
  
  const txts = draftFrame.value.texts.map((t: any, i: number) => ({
    type: 'text',
    index: i,
    name: t.name,
    id: t._id
  }))
  
  const frameImg = {
    type: 'image',
    index: -1,
    name: 'Frame Image',
    id: 'frame-image'
  }
  
  if (draftFrame.value.layering === 'foreground') {
    return [...txts.reverse(), frameImg, ...phs.reverse()]
  } else {
    return [...txts.reverse(), ...phs.reverse(), frameImg]
  }
})

let dragLayerIndex = -1
const dragOverIndex = ref(-1)
const dragOverPosition = ref<'top' | 'bottom'>('top')

function onLayerDragStart(e: DragEvent, index: number) {
  dragLayerIndex = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }
}

function onLayerDragOver(e: DragEvent, index: number) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const y = e.clientY - rect.top
  dragOverIndex.value = index
  dragOverPosition.value = (y < rect.height / 2) ? 'top' : 'bottom'
}

function onLayerDragLeave(e: DragEvent) {
  const relatedTarget = e.relatedTarget as HTMLElement | null
  const currentTarget = e.currentTarget as HTMLElement | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return
  }
  dragOverIndex.value = -1
}

function onLayerDragEnd() {
  dragOverIndex.value = -1
  dragLayerIndex = -1
}

function onLayerDrop(e: DragEvent, dropIndex: number) {
  dragOverIndex.value = -1
  
  let targetIndex = dropIndex
  if (dragOverPosition.value === 'bottom') {
    targetIndex += 1
  }
  if (dragLayerIndex < targetIndex) {
    targetIndex -= 1
  }
  
  if (dragLayerIndex === -1 || dragLayerIndex === targetIndex) return
  
  const newLayers = [...layerList.value]
  const [moved] = newLayers.splice(dragLayerIndex, 1)
  newLayers.splice(targetIndex, 0, moved)
  
  const currentSelectedType = selectedType.value
  const currentSelectedIndex = selectedIndex.value
  let currentSelectedItem = null
  if (currentSelectedType === 'placeholder') {
    currentSelectedItem = draftFrame.value.placeholders[currentSelectedIndex]
  } else if (currentSelectedType === 'text') {
    currentSelectedItem = draftFrame.value.texts[currentSelectedIndex]
  }

  const newPlaceholders: any[] = []
  const newTexts: any[] = []
  let newLayering = 'foreground'
  
  const imgIndex = newLayers.findIndex(l => l.type === 'image')
  if (imgIndex === 0 || (imgIndex > 0 && newLayers.slice(0, imgIndex).every(l => l.type === 'text'))) {
    newLayering = 'foreground'
  } else {
    newLayering = 'background'
  }
  
  for (let i = newLayers.length - 1; i >= 0; i--) {
    const layer = newLayers[i]
    if (layer.type === 'placeholder') {
      newPlaceholders.push(draftFrame.value.placeholders[layer.index])
    } else if (layer.type === 'text') {
      newTexts.push(draftFrame.value.texts[layer.index])
    }
  }
  
  draftFrame.value.placeholders = newPlaceholders
  draftFrame.value.texts = newTexts
  draftFrame.value.layering = newLayering
  
  if (currentSelectedItem) {
    if (currentSelectedType === 'placeholder') {
      const newIdx = newPlaceholders.indexOf(currentSelectedItem)
      if (newIdx !== -1) {
        selectedIndex.value = newIdx
      }
    } else if (currentSelectedType === 'text') {
      const newIdx = newTexts.indexOf(currentSelectedItem)
      if (newIdx !== -1) {
        selectedIndex.value = newIdx
      }
    }
  }
}

function addPlaceholder() {
  const newName = `Placeholder ${draftFrame.value.placeholders.length + 1}`
  draftFrame.value.placeholders.push({
    x: 100,
    y: 100,
    width: 600,
    height: 400,
    borderRadius: 0,
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
    aspectRatioLocked: false,
    name: newName,
    _id: Math.random().toString(36).substring(7)
  })
}

function addText() {
  const newName = `Text ${draftFrame.value.texts.length + 1}`
  draftFrame.value.texts.push({
    text: '{{date}}',
    anchorY: 'bottom',
    anchorX: 'right',
    offsetY: 20,
    offsetX: 20,
    fontSize: 48,
    color: '#ffffff',
    align: 'left',
    orientation: 0,
    name: newName,
    _id: Math.random().toString(36).substring(7)
  })
  selectedType.value = 'text'
  selectedIndex.value = draftFrame.value.texts.length - 1
}

function removeItem(type: string, index: number) {
  if (type === 'placeholder') {
    draftFrame.value.placeholders.splice(index, 1)
  } else if (type === 'text') {
    draftFrame.value.texts.splice(index, 1)
  }
  selectedType.value = 'placeholder'
  selectedIndex.value = 0
}

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
  selectedType.value = 'placeholder'
  selectedIndex.value = Math.max(0, draftFrame.value.placeholders.length - 1)
}



async function save() {
  saving.value = true
  try {
    await axios.patch(`/api/admin/events/${props.eventId}/frames/${draftFrame.value.id}`, {
      name: draftFrame.value.name,
      placeholders: draftFrame.value.placeholders,
      texts: draftFrame.value.texts,
      layering: draftFrame.value.layering,
      canvasWidth: draftFrame.value.canvasWidth,
      canvasHeight: draftFrame.value.canvasHeight
    })
    toast.success('Frame configuration saved')
    emit('close')
  } catch (err) {
    console.error(err)
    toast.error('Failed to save frame')
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
  padding: 0.75rem 1.5rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.editor-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.btn-icon-nav {
  background: none;
  border: 1px solid #2a2a2a;
  color: #ccc;
  padding: 0.25rem;
  border-radius: 6px;
  cursor: pointer;
  line-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-icon-nav svg {
  width: 16px;
  height: 16px;
}
.btn-icon-nav:hover {
  border-color: #555;
  color: #fff;
}
.name-input {
  background: transparent;
  border: none;
  border-bottom: 1px dashed #555;
  color: #fff;
  font-size: 1.125rem;
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
.placeholder-item.is-image { border-left: 3px solid #4CAF50; }
.placeholder-item.drag-over-top { border-top: 2px solid #4CAF50; }
.placeholder-item.drag-over-bottom { border-bottom: 2px solid #4CAF50; }
.layer-left { display: flex; align-items: center; gap: 0.5rem; }
.drag-handle { cursor: grab; color: #666; font-size: 1rem; padding-right: 0.25rem; }
.drag-handle:active { cursor: grabbing; }

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

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal {
  background: #1e1e1e; padding: 2rem; border-radius: 12px;
  width: 90%; max-width: 400px;
}
.modal h3 { margin-top: 0; color: #fff; }
.modal p { color: #ccc; margin-bottom: 1.5rem; }
.modal-actions {
  display: flex; justify-content: flex-end; gap: 0.5rem;
}
.btn-danger {
  background: #f44336; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600;
}
.btn-danger:hover { background: #d32f2f; }

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

.text-box {
  position: absolute;
  cursor: pointer;
  white-space: nowrap;
  font-family: sans-serif;
  border: 1px dashed transparent;
  padding: 4px;
}
.text-box.active {
  border: 1px dashed #4CAF50;
  background: rgba(76, 175, 80, 0.2);
}
</style>
