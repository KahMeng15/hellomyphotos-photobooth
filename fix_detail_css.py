import re

filepath = 'photobooth-server/frontend/src/views/EventDetailView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Fix .dashboard height -> min-height
content = content.replace(".dashboard {\n  display: flex;\n  flex-direction: column;\n  height: 100vh;", ".dashboard {\n  display: flex;\n  flex-direction: column;\n  min-height: 100vh;")

# 2. Fix .remote-sidebar styles
old_sidebar_css = """  .remote-sidebar {
    display: flex;
    position: sticky;
    top: 1.5rem;
    height: calc(100vh - 3rem - 65px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }"""

new_sidebar_css = """  .remote-sidebar {
    display: flex;
    position: sticky;
    top: 1.5rem;
  }"""

content = content.replace(old_sidebar_css, new_sidebar_css)

with open(filepath, 'w') as f:
    f.write(content)
