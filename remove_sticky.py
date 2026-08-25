import re

filepath = 'photobooth-server/frontend/src/views/EventDetailView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace sticky position in both places
old_sticky = """  .remote-sidebar {
    display: flex;
    position: sticky;
    top: 1.5rem;
  }"""
new_sticky = """  .remote-sidebar {
    display: flex;
    flex-direction: column;
  }"""
content = content.replace(old_sticky, new_sticky)

with open(filepath, 'w') as f:
    f.write(content)
