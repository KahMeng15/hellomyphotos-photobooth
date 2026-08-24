import os

filepath = 'photobooth-server/frontend/src/components/ui/AppTopNav.vue'
with open(filepath, 'r') as f:
    content = f.read()

content = content.replace(
    '''<button v-if="!currentTitle" @click="$emit('toggle-panel')" class="nav-icon" title="Booth Controller">''',
    '''<button @click="$emit('toggle-panel')" class="nav-icon" title="Booth Controller">'''
)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed AppTopNav.")
