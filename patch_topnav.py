import re

filepath = 'photobooth-server/frontend/src/components/ui/AppTopNav.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace the remote button
btn_regex = r'<button @click="router\.push\(`/events/\$\{event\.id\}/remote`\)"[^>]*title="Booth Remote">.*?</button>'

new_btn = """<button @click="router.push(`/events/${event.id}/remote`)" :class="['nav-icon', 'remote-icon-nav', { 'hide-on-desktop': !currentTitle, active: currentRoute === 'remote' }]" title="Booth Remote">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
        </button>"""

content = re.sub(btn_regex, new_btn, content, flags=re.DOTALL)

with open(filepath, 'w') as f:
    f.write(content)
