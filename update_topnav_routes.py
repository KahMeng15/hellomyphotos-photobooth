import os

filepath = 'photobooth-server/frontend/src/components/ui/AppTopNav.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace the Camera icon with the remote route, and add a Gallery icon before it.
icons_old = """        <button @click="router.push(`/events/${event.id}/frames`)" :class="['nav-icon', { active: currentRoute === 'frames' }]" title="Frames">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        </button>
        <button @click="currentTitle ? router.push(`/events/${event.id}`) : $emit('toggle-panel')" :class="['nav-icon', { active: !currentTitle }]" title="Booth Controller">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
        </button>"""

icons_new = """        <button @click="router.push(`/events/${event.id}/frames`)" :class="['nav-icon', { active: currentRoute === 'frames' }]" title="Frames">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        </button>
        <button @click="router.push(`/events/${event.id}`)" :class="['nav-icon', { active: currentRoute === '' }]" title="Photo Gallery">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
        <button @click="router.push(`/events/${event.id}/remote`)" :class="['nav-icon', { active: currentRoute === 'remote' }]" title="Booth Remote">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
        </button>"""

content = content.replace(icons_old, icons_new)

with open(filepath, 'w') as f:
    f.write(content)
