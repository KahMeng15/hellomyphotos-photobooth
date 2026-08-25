import re

filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

old_props = """const props = defineProps<{
  connected: boolean
  eventId: string
  show: boolean
  sendMessage: (event: string, data: any) => void
  boothState: string | null
  totalSessions: number
  totalPhotos: number
}>()"""

new_props = """const props = defineProps<{
  connected: boolean
  eventId: string
  sendMessage: (event: string, data: any) => void
  boothState: string | null
  show?: boolean
  totalSessions?: number
  totalPhotos?: number
}>()"""

content = content.replace(old_props, new_props)

with open(filepath, 'w') as f:
    f.write(content)
