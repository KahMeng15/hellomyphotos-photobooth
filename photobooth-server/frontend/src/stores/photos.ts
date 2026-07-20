import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export interface Event {
  id: string
  name: string
  date: string
  description: string
  otp: string
  status: string
  created_at: string
}

export interface PhotoSession {
  sessionId: string
  photoCount: number
  firstPhoto: Photo | null
  photos: Photo[]
  timestamps: string[]
  createdAt: string
}

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
  const sessions = ref<PhotoSession[]>([])
  const frames = ref<Frame[]>([])
  const selectedPhoto = ref<Photo | null>(null)
  const selectedSession = ref<PhotoSession | null>(null)
  const showQrCode = ref(false)
  const qrUrl = ref('')
  const loading = ref(false)
  const queueDepth = ref(0)

  // Events
  const events = ref<Event[]>([])
  const currentEventId = ref<string | null>(null)

  const latestPhotos = computed(() => photos.value.slice(0, 50))

  // ── Events ──

  async function fetchEvents(includeEnded = false) {
    try {
      const { data } = await axios.get(`/api/admin/events?includeEnded=${includeEnded}`)
      events.value = data.events
    } catch (err) {
      console.error('Failed to fetch events', err)
    }
  }

  async function createEvent(name: string, date: string, description: string) {
    const { data } = await axios.post('/api/admin/events', { name, date, description })
    await fetchEvents()
    return data
  }

  async function endEvent(eventId: string) {
    await axios.post(`/api/admin/events/${eventId}/end`)
    await fetchEvents(true)
  }

  async function deleteEvent(eventId: string) {
    await axios.delete(`/api/admin/events/${eventId}`)
    await fetchEvents(true)
  }

  // ── Event Photo Sessions ──

  async function fetchEventSessions(eventId: string) {
    try {
      const { data } = await axios.get(`/api/admin/events/${eventId}/photos`)
      sessions.value = data.sessions
      return data
    } catch (err) {
      console.error('Failed to fetch event sessions', err)
      return null
    }
  }

  async function deleteEventSession(eventId: string, sessionId: string) {
    try {
      await axios.delete(`/api/admin/events/${eventId}/session/${sessionId}`)
      sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId)
      if (selectedSession.value?.sessionId === sessionId) clearSelection()
      if (selectedPhoto.value?.sessionId === sessionId) clearSelection()
    } catch (err) {
      console.error('Failed to delete event session', err)
    }
  }

  // ── Legacy ──

  async function fetchPhotos() {
    try {
      const { data } = await axios.get('/api/admin/photos')
      photos.value = data.photos
    } catch (err) {
      console.error('Failed to fetch photos', err)
    }
  }

  async function fetchSessions() {
    try {
      const { data } = await axios.get('/api/admin/sessions')
      sessions.value = data.sessions
    } catch (err) {
      console.error('Failed to fetch sessions', err)
    }
  }

  async function createShareLink(eventId: string): Promise<string> {
    const { data } = await axios.post('/api/share/create', { eventId })
    return data.url
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
    selectedSession.value = null
  }

  function selectSession(session: PhotoSession) {
    selectedSession.value = session
    selectedPhoto.value = null
  }

  function clearSelection() {
    selectedPhoto.value = null
    selectedSession.value = null
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
      sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId)
      if (selectedSession.value?.sessionId === sessionId) clearSelection()
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
    sessions,
    frames,
    selectedPhoto,
    selectedSession,
    showQrCode,
    qrUrl,
    loading,
    queueDepth,
    latestPhotos,
    events,
    currentEventId,
    fetchEvents,
    createEvent,
    endEvent,
    deleteEvent,
    fetchEventSessions,
    deleteEventSession,
    fetchPhotos,
    fetchSessions,
    createShareLink,
    fetchFrames,
    addPhoto,
    selectPhoto,
    selectSession,
    clearSelection,
    triggerQrCode,
    deletePhoto,
    deleteSession,
    uploadFrame,
    deleteFrame,
  }
})
