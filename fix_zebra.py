import os

files = [
    'photobooth-server/frontend/src/views/AdminView.vue',
    'photobooth-server/frontend/src/views/UsersView.vue',
    'photobooth-server/frontend/src/views/SettingsView.vue'
]

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    css_old = """.field-row:last-child {
  border-bottom: none;
}"""
    css_new = """.field-row:last-child {
  border-bottom: none;
}
.field-row:nth-child(even) {
  background: var(--color-surface-alt);
}"""

    content = content.replace(css_old, css_new)

    with open(filepath, 'w') as f:
        f.write(content)

print("Zebra striping added to field rows.")
