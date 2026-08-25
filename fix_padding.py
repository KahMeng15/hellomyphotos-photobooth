import re

filepath = 'photobooth-server/frontend/src/views/EventDetailView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Remove the extra 2rem padding from .photo-feed so it falls back to the .dashboard-grid-full 1.5rem padding
content = content.replace(".photo-feed {\n  padding: 2rem;\n}", ".photo-feed {\n  /* Removed to inherit standard grid padding */\n}")

with open(filepath, 'w') as f:
    f.write(content)
