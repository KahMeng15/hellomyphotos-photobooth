import os

filepath = 'photobooth-server/frontend/src/views/EventBoothSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

content = content.replace(
    'const { connect: connectWs, disconnect: disconnectWs, subscribe, ws } = useWebSocket()',
    'const { connect: connectWs, disconnect: disconnectWs, subscribe, ws, sendMessage } = useWebSocket()'
)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed sendMessage.")
