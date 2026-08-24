import os
import re

filepath = 'photobooth-server/frontend/src/views/EventBoothSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Add remote config state and request logic
script_add = """
const remoteConfig = ref<any>(null)
let socketRef: any = null

onMounted(async () => {
"""

script_logic = """
    const socket = connectWs()
    if (socket) {
      socketRef = socket
      subscribe(eventId.value)
      socket.on('booth-connected', (payload) => {
        if (payload.eventId === eventId.value) {
          boothConnected.value = payload.connected
          if (payload.connected) {
            socket.emit('request-booth-config', eventId.value)
          } else {
            remoteConfig.value = null
          }
        }
      })
      
      socket.on('booth-config', (payload) => {
        if (payload.eventId === eventId.value) {
          remoteConfig.value = payload.config
        }
      })
      
      // Request initially just in case
      socket.emit('request-booth-config', eventId.value)
    }
"""

content = content.replace("onMounted(async () => {", script_add)

# Replace the old ws connection logic
old_ws = """    const socket = connectWs()
    if (socket) {
      subscribe(eventId.value)
      socket.on('booth-connected', (payload) => {
        if (payload.eventId === eventId.value) {
          boothConnected.value = payload.connected
        }
      })
    }"""
content = content.replace(old_ws, script_logic)

# In saveSettings, also save remote config
save_old = """    toast.success('Settings saved successfully')
  } catch {
    toast.error('Failed to save settings')
  }
  settingsSaving.value = false"""
save_new = """    if (boothConnected.value && remoteConfig.value && socketRef) {
      socketRef.emit('update-booth-config', { eventId: eventId.value, config: remoteConfig.value })
    }
    toast.success('Settings saved successfully')
  } catch {
    toast.error('Failed to save settings')
  }
  settingsSaving.value = false"""
content = content.replace(save_old, save_new)

# Add UI section
ui_section = """
      <section class="card" v-if="boothConnected && remoteConfig">
        <h2>Live Booth Hardware</h2>
        <p class="card-desc">These settings live only on the local machine and are being updated over WebSockets.</p>
        <div class="settings-box">
          
          <div class="field-row">
            <label>Camera Source</label>
            <select v-model="remoteConfig.cameraMode" class="custom-select">
              <option value="webcam">Webcam (USB/Built-in)</option>
              <option value="dslr">DSLR (Sony/Canon/Nikon)</option>
            </select>
          </div>
          
          <div class="field-row" v-if="remoteConfig.cameraMode === 'dslr'">
            <label>DSLR Liveview Mode</label>
            <select v-model="remoteConfig.liveviewMode" class="custom-select">
              <option value="mjpeg">MJPEG Stream (Smooth)</option>
              <option value="polling">Polling (Low Bandwidth)</option>
            </select>
          </div>

          <div class="field-row">
            <label>Auto-Start Session on Idle</label>
            <div class="focus-toggle" style="display:flex; background:var(--color-border); border-radius:100px; padding:2px;">
              <button :class="['focus-btn', remoteConfig.autoPreview ? 'focus-active' : '']" @click="remoteConfig.autoPreview = true">ON</button>
              <button :class="['focus-btn', !remoteConfig.autoPreview ? 'focus-active' : '']" @click="remoteConfig.autoPreview = false">OFF</button>
            </div>
          </div>
          
          <div class="field-row">
            <label>Development Simulation</label>
            <div class="focus-toggle" style="display:flex; background:var(--color-border); border-radius:100px; padding:2px;">
              <button :class="['focus-btn', remoteConfig.devSimulationEnabled ? 'focus-active' : '']" @click="remoteConfig.devSimulationEnabled = true">ENABLED</button>
              <button :class="['focus-btn', !remoteConfig.devSimulationEnabled ? 'focus-active' : '']" @click="remoteConfig.devSimulationEnabled = false">DISABLED</button>
            </div>
          </div>
          
        </div>
      </section>
      
      <div class="page-actions">
"""

content = content.replace('      <div class="page-actions">', ui_section)

# Add select CSS
css_select = """
.custom-select {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  outline: none;
  min-width: 200px;
}
.custom-select:focus {
  border-color: var(--color-text-sub);
}
"""
content = content.replace("</style>", css_select + "\n</style>")

with open(filepath, 'w') as f:
    f.write(content)

print("Updated Booth Settings UI with live config.")
