import re

filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Remove Teleport modal block
modal_regex = r'<Teleport to="body">.*?</Teleport>'
content = re.sub(modal_regex, '', content, flags=re.DOTALL)

# Update control-panel css
css_old = """.control-panel {
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}"""
css_new = """.control-panel {
  background: var(--color-surface);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}"""
content = content.replace(css_old, css_new)

# Remove mobile media query that hides control-panel
mq_regex = r'@media \(max-width: 768px\) \{.*?\}'
content = re.sub(mq_regex, '', content, flags=re.DOTALL)

with open(filepath, 'w') as f:
    f.write(content)
