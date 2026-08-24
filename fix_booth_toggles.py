import os
import re

filepath = 'photobooth-server/frontend/src/views/EventBoothSettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Fix HTML inline styles on focus-toggle
content = content.replace(
    'class="focus-toggle" style="display:flex; background:var(--color-border); border-radius:100px; padding:2px;"',
    'class="focus-toggle"'
)

# Fix CSS for focus-btn and add focus-toggle
old_css = """.focus-btn {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text-sub);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all 0.2s;
}
.focus-active {
  background: var(--color-text);
  color: var(--color-bg);
  border-color: var(--color-text);
}"""

new_css = """.focus-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  width: max-content;
}
.focus-btn {
  background: var(--color-surface);
  border: none;
  color: var(--color-text-sub);
  padding: 0.375rem 0.75rem;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.focus-active {
  background: var(--color-border);
  color: var(--color-text);
}"""

content = content.replace(old_css, new_css)

with open(filepath, 'w') as f:
    f.write(content)

print("Fixed focus-toggle styling in EventBoothSettingsView.")
