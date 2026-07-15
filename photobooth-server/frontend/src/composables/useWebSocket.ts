import { ref, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/auth'

export function useWebSocket() {
  const ws = ref<Socket | null>(null)
  const connected = ref(false)

  function connect() {
    const auth = useAuthStore()
    if (!auth.accessToken) return

    const socket = io({
      auth: { token: auth.accessToken },
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      connected.value = true
    })

    socket.on('disconnect', () => {
      connected.value = false
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

  onUnmounted(() => {
    disconnect()
  })

  return { ws, connected, connect, disconnect, sendMessage }
}
