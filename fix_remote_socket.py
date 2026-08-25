import re

filepath = 'photobooth-server/frontend/src/views/EventRemoteView.vue'
with open(filepath, 'r') as f:
    content = f.read()

old_block = """  const socket = connectWs()
  if (socket) {
    subscribe(eventId.value)
    socket.on('booth-connected', (payload) => {"""

new_block = """  const socket = connectWs()
  if (socket) {
    if (socket.connected) {
      subscribe(eventId.value)
    } else {
      socket.on('connect', () => subscribe(eventId.value))
    }
    socket.on('booth-connected', (payload) => {"""

content = content.replace(old_block, new_block)

with open(filepath, 'w') as f:
    f.write(content)
