import os

filepath = 'photobooth-server/frontend/src/components/ui/UserDropdown.vue'
with open(filepath, 'r') as f:
    content = f.read()

# The SVG block to remove:
svg_to_remove = """
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron" :class="{ 'rotate': isOpen }">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>"""

content = content.replace(svg_to_remove, "")

with open(filepath, 'w') as f:
    f.write(content)

print("Arrow removed.")
