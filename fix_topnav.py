import os

filepath = 'photobooth-server/frontend/src/components/ui/AppTopNav.vue'
with open(filepath, 'r') as f:
    content = f.read()

old_btn = '''<button @click="$emit('toggle-panel')" class="nav-icon" title="Booth Controller">'''
new_btn = '''<button @click="currentTitle ? router.push(`/events/${event.id}`) : $emit('toggle-panel')" :class="['nav-icon', { active: !currentTitle }]" title="Booth Controller">'''

content = content.replace(old_btn, new_btn)

with open(filepath, 'w') as f:
    f.write(content)
