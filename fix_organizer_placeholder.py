import os

filepath = 'photobooth-server/frontend/src/views/EventSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

content = content.replace(
    'placeholder="e.g. Acme Corp"', 
    'placeholder="Faculty of Computer Science and Information Technology"'
)

with open(filepath, 'w') as f:
    f.write(content)

print("Updated placeholder.")
