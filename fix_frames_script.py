import os

filepath = 'photobooth-server/frontend/src/views/EventFramesView.vue'
with open(filepath, 'r') as f:
    content = f.read()

mount_add = """onMounted(async () => {
  const socket = connectWs()
  if (socket) {
    subscribe(eventId.value)
    socket.on('booth-connected', (payload) => {
      if (payload.eventId === eventId.value) boothConnected.value = payload.connected
    })
    socket.on('booth-state', (payload) => {
      if (payload.eventId === eventId.value) boothState.value = payload.state
    })
  }"""
content = content.replace("onMounted(async () => {", mount_add)

with open(filepath, 'w') as f:
    f.write(content)
