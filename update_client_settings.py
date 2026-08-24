import os
import re

filepath = 'photobooth-client/src/renderer/components/Settings.ts'
with open(filepath, 'r') as f:
    content = f.read()

injection = """
    // Listen for remote config commands
    document.addEventListener('booth-ws-command', async (e: Event) => {
      const cmd = (e as CustomEvent).detail
      if (cmd.type === 'request-config') {
        if (boothSocket?.connected) {
          const liveConfig = await window.hellomyphoto?.getSettings() || this.settings
          boothSocket.emit('booth-config', liveConfig)
        }
      } else if (cmd.type === 'update-config') {
        if (cmd.config) {
          console.log('[booth] Applying remote config update:', cmd.config)
          this.settings = { ...this.settings, ...cmd.config }
          if (window.hellomyphoto) {
            await window.hellomyphoto.saveSettings(this.settings)
          }
          this.populateUiFromSettings()
          this.onChange(this.settings)
          if (boothSocket?.connected) {
            boothSocket.emit('booth-config', this.settings) // Ack back
          }
        }
      }
    })
"""

# Insert right before "// Listen for socket status changes"
content = content.replace("    // Listen for socket status changes", injection + "\n    // Listen for socket status changes")

with open(filepath, 'w') as f:
    f.write(content)

print("Updated Settings.ts with remote config handling.")
