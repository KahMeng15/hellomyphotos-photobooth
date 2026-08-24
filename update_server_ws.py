import os
import re

filepath = 'photobooth-server/src/server.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Add Operator events
operator_events_old = """    socket.on('trigger-reshot', (data: { eventId: string }) => {
      forwardToBooth(data.eventId, { type: 'reshot' })
    })"""
operator_events_new = """    socket.on('trigger-reshot', (data: { eventId: string }) => {
      forwardToBooth(data.eventId, { type: 'reshot' })
    })

    socket.on('request-booth-config', (eventId: string) => {
      forwardToBooth(eventId, { type: 'request-config' })
    })

    socket.on('update-booth-config', (data: { eventId: string, config: any }) => {
      forwardToBooth(data.eventId, { type: 'update-config', config: data.config })
    })"""
content = content.replace(operator_events_old, operator_events_new)

# Add Booth events
booth_events_old = """    socket.on('booth-state', (data: { state: string }) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('booth-state', { ...data, eventId })
        }
      }
    })"""
booth_events_new = """    socket.on('booth-state', (data: { state: string }) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('booth-state', { ...data, eventId })
        }
      }
    })

    socket.on('booth-config', (config: any) => {
      const subs = operatorSubscriptions.get(eventId)
      if (subs) {
        for (const sid of subs) {
          io.to(sid).emit('booth-config', { eventId, config })
        }
      }
    })"""
content = content.replace(booth_events_old, booth_events_new)

with open(filepath, 'w') as f:
    f.write(content)

print("Updated server.ts WebSocket logic.")
