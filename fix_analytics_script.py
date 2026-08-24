import os
import re

filepath = 'photobooth-server/frontend/src/views/EventAnalyticsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Remove the broken injection around fetchData
broken_text = """async function fetchData()

  const socket = connectWs()
  if (socket) {
    subscribe(eventId.value)
    socket.on('booth-connected', (payload) => {
      if (payload.eventId === eventId.value) boothConnected.value = payload.connected
    })
    socket.on('booth-state', (payload) => {
      if (payload.eventId === eventId.value) boothState.value = payload.state
    })
  }
 {"""
content = content.replace(broken_text, "async function fetchData() {")

# Inject it properly into onMounted
mount_add = """onMounted(() => {
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
content = content.replace("onMounted(() => {", mount_add)

with open(filepath, 'w') as f:
    f.write(content)
