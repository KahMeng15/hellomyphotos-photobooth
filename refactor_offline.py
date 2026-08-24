import os

filepath = 'photobooth-client/src/renderer/components/OfflineIndicator.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Replace constructor body
import re
# Use regex to strip out everything inside constructor and replace with clean classes
# Actually, I can just write out the clean code.
replacement = """  constructor(container: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'ui-offline-indicator'

    this.dotEl = document.createElement('span')
    this.dotEl.className = 'ui-offline-dot'
    this.el.appendChild(this.dotEl)

    this.textEl = document.createElement('span')
    this.textEl.textContent = 'Server Disconnected'
    this.textEl.className = 'ui-offline-text'
    this.el.appendChild(this.textEl)

    this.queueEl = document.createElement('span')
    this.queueEl.className = 'ui-offline-queue'
    this.el.appendChild(this.queueEl)
    
    container.appendChild(this.el)
  }"""

# Find constructor block
start = content.find("  constructor(container: HTMLElement) {")
end = content.find("  private isOnline: boolean = true")

if start != -1 and end != -1:
    content = content[:start] + replacement + "\n\n" + content[end:]

# Clean up updateState() which does direct style mutations that are better handled by classes.
# But wait, updateState is dynamically updating styles based on state.
# We can just change `updateState` to modify classes if needed, but it sets background manually.
# Let's replace updateState entirely.
update_replacement = """  private updateState() {
    if (this.isOnline) {
      this.el.style.display = 'none'
    } else {
      this.el.style.display = 'flex'
      this.textEl.textContent = 'Server Disconnected'
      
      if (this.retryMsg) {
        this.queueEl.textContent = this.retryMsg
        this.queueEl.style.display = 'block'
      } else if (this.depth > 0) {
        this.queueEl.textContent = `${this.depth} queued`
        this.queueEl.style.display = 'block'
      } else {
        this.queueEl.style.display = 'none'
      }
    }
  }"""

start2 = content.find("  private updateState() {")
end2 = content.find("  setOnline(online: boolean) {")
if start2 != -1 and end2 != -1:
    content = content[:start2] + update_replacement + "\n\n" + content[end2:]

with open(filepath, 'w') as f:
    f.write(content)

print("OfflineIndicator refactored.")
