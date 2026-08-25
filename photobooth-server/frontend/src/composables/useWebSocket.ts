import { ref, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/auth'

export function useWebSocket() {
  const ws = ref<Socket | null>(null)
  const connected = ref(false)

  function connect() {
    if (ws.value?.connected) return ws.value

    const auth = useAuthStore()
    if (!auth.accessToken) return

    // Extract the base path dynamically from the current URL to ensure it works
    // even if VITE_BASE_URL was not set during build.
    const pathname = window.location.pathname
    let basePath = ''
    if (pathname.includes('/hellomyphotos-photobooth-test')) {
      basePath = '/hellomyphotos-photobooth-test'
    } else {
      basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
    }

    const socketUrl = `${window.location.protocol}//${window.location.host}`
    const socket = io(socketUrl, {
      path: `${basePath}/socket.io`,
      auth: { token: auth.accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    })

    socket.on('connect', () => {
      connected.value = true
    })

    socket.on('disconnect', () => {
      connected.value = false
    })

    socket.on('connect_error', async (err) => {
      if (err.message === 'Invalid token' || err.message === 'No auth token') {
        const auth = useAuthStore()
        const refreshed = await auth.refreshToken()
        if (refreshed && socket.auth) {
          socket.auth = { token: auth.accessToken }
        }
      }
    })

    ws.value = socket
    return socket
  }

  function disconnect() {
    ws.value?.disconnect()
    ws.value = null
    connected.value = false
  }

  function sendMessage(event: string, data: any) {
    ws.value?.emit(event, data)
  }

  function subscribe(eventId: string) {
    ws.value?.emit('subscribe', eventId)
  }

  function unsubscribe(eventId: string) {
    ws.value?.emit('unsubscribe', eventId)
  }

  onUnmounted(() => {
    disconnect()
  })

  return { ws, connected, connect, disconnect, sendMessage, subscribe, unsubscribe }
}
