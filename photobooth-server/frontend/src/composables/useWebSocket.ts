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

    const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
    const socketPath = baseUrl ? `${baseUrl}/socket.io` : '/socket.io'

    const socket = io({
      path: socketPath,
      auth: { token: auth.accessToken },
      transports: ['polling', 'websocket'],
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
