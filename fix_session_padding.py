import re

filepath = 'photobooth-server/frontend/src/components/SessionViewer.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Update .viewer-body padding to 1.5rem
content = content.replace("padding: 1.5rem 2rem;", "padding: 1.5rem;")
# Update .session-header padding to match
content = content.replace("padding: 0.75rem 2rem;", "padding: 0.75rem 1.5rem;")

with open(filepath, 'w') as f:
    f.write(content)
