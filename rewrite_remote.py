import re

filepath = 'photobooth-server/frontend/src/views/EventRemoteView.vue'
with open(filepath, 'r') as f:
    content = f.read()

new_template = """<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Booth Remote" />

    <div class="app-page-layout settings-container">
      <EventControlPanel
        :connected="boothConnected"
        :event-id="event.id"
        :booth-state="boothState"
        :send-message="sendMessage"
        @retry="retryConnection"
      />
    </div>
  </div>
</template>"""

# Replace template
template_regex = r'<template>.*?</template>'
content = re.sub(template_regex, new_template, content, flags=re.DOTALL)

# Add import EventControlPanel
import_stmt = "import EventControlPanel from '../components/EventControlPanel.vue'"
if import_stmt not in content:
    content = content.replace("import AppTopNav from '../components/ui/AppTopNav.vue'", "import AppTopNav from '../components/ui/AppTopNav.vue'\n" + import_stmt)

# Add retryConnection function
if "function retryConnection" not in content:
    retry_func = """
function retryConnection() {
  const socket = connectWs()
  if (socket) {
    if (socket.connected) {
      subscribe(eventId.value)
    } else {
      socket.on('connect', () => subscribe(eventId.value))
    }
  }
}
"""
    content = content.replace("async function copyOtp() {", retry_func + "\nasync function copyOtp() {")

# Remove unused logic (triggerAction, triggerReshot, overrideFrame, frames)
content = re.sub(r'const frames = ref<any\[\]>\(\[\]\)', '', content)
content = re.sub(r'const selectedFrameId = ref\(\'\'\)', '', content)
content = re.sub(r'const otpCopied = ref\(false\)', '', content)
content = re.sub(r'async function copyOtp\(\) \{.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'function triggerAction\([^)]*\) \{.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'function triggerReshot\(\) \{.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'function overrideFrame\(\) \{.*?\n\}', '', content, flags=re.DOTALL)

# Clean up CSS since EventControlPanel handles it now
css_new = """<style scoped>
.page-wrapper {
  background: var(--color-bg);
  min-height: 100vh;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
}
.settings-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem;
  width: 100%;
}
</style>"""
css_regex = r'<style scoped>.*?</style>'
content = re.sub(css_regex, css_new, content, flags=re.DOTALL)

with open(filepath, 'w') as f:
    f.write(content)

