import re

filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

css_append = """
.focus-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.custom-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
"""

content = content.replace("</style>", css_append)

with open(filepath, 'w') as f:
    f.write(content)
