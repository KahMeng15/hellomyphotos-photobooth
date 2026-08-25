import re

filepath = 'photobooth-server/frontend/src/views/EventDetailView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Remove overflow-y: auto from .photo-feed
content = content.replace("  overflow-y: auto;\n  padding: 2rem;", "  padding: 2rem;")

# 2. Put position: sticky back on .remote-sidebar so it follows the user as they scroll the page!
old_sidebar_css = """  .remote-sidebar {
    display: flex;
    flex-direction: column;
  }"""
new_sidebar_css = """  .remote-sidebar {
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 1.5rem;
  }"""
content = content.replace(old_sidebar_css, new_sidebar_css)

with open(filepath, 'w') as f:
    f.write(content)
