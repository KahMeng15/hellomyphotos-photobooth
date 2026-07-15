import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export interface Photo {
  id: string
  url: string
  thumbnail: string
  size: number
  timestamp: string
  sessionId?: string
  frameName?: string | null
}

export interface Frame {
  id: string
  name: string
  size: number
  createdAt: string
}

export const usePhotosStore = defineStore('photos', () => {
  const photos = ref<Photo[]>([])
  const frames = ref<Frame[]>([])
  const selectedPhoto = ref<Photo | null>(null)
  const showQrCode = ref(false)
  const qrUrl = ref('')
  const loading = ref(false)
  const queueDepth = ref(0)

  const latestPhotos = computed(() => photos.value.slice(0, 50))

  async function fetchPhotos() {
    try {
      const { data } = await axios.get('/api/admin/photos')
      photos.value = data.photos
    } catch (err) {
      console.error('Failed to fetch photos', err)
    }
  }

  async function fetchFrames() {
    try {
      const { data } = await axios.get('/api/admin/frames')
      frames.value = data.frames
    } catch (err) {
      console.error('Failed to fetch frames', err)
    }
  }

  function addPhoto(photo: Photo) {
    photos.value.unshift(photo)
    if (photos.value.length > 200) {
      photos.value = photos.value.slice(0, 200)
    }
  }

  function selectPhoto(photo: Photo) {
    selectedPhoto.value = photo
  }

  function clearSelection() {
    selectedPhoto.value = null
    showQrCode.value = false
  }

  function triggerQrCode(photo: Photo) {
    qrUrl.value = `${window.location.origin}/api/photos/${photo.id}`
    showQrCode.value = true
  }

  async function deletePhoto(id: string) {
    try {
      await axios.delete(`/api/admin/photos/${id}`)
      photos.value = photos.value.filter((p) => p.id !== id)
      if (selectedPhoto.value?.id === id) clearSelection()
    } catch (err) {
      console.error('Failed to delete photo', err)
    }
  }

  async function deleteSession(sessionId: string) {
    try {
      await axios.delete(`/api/admin/session/${sessionId}`)
      photos.value = photos.value.filter((p) => p.sessionId !== sessionId)
      if (selectedPhoto.value?.sessionId === sessionId) clearSelection()
    } catch (err) {
      console.error('Failed to delete session', err)
    }
  }

  async function uploadFrame(file: File) {
    const formData = new FormData()
    formData.append('frame', file)
    try {
      const { data } = await axios.post('/api/admin/frames', formData)
      await fetchFrames()
      return data
    } catch (err) {
      console.error('Failed to upload frame', err)
      throw err
    }
  }

  async function deleteFrame(id: string) {
    try {
      await axios.delete(`/api/admin/frames/${id}`)
      frames.value = frames.value.filter((f) => f.id !== id)
    } catch (err) {
      console.error('Failed to delete frame', err)
    }
  }

  return {
    photos,
    frames,
    selectedPhoto,
    showQrCode,
    qrUrl,
    loading,
    queueDepth,
    latestPhotos,
    fetchPhotos,
    fetchFrames,
    addPhoto,
    selectPhoto,
    clearSelection,
    triggerQrCode,
    deletePhoto,
    deleteSession,
    uploadFrame,
    deleteFrame,
  }
})
