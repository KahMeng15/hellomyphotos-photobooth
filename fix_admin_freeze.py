import os

# 1. Fix AppTopNav.vue classes for back button
filepath_topnav = 'photobooth-server/frontend/src/components/ui/AppTopNav.vue'
with open(filepath_topnav, 'r') as f:
    content = f.read()

content = content.replace('class="app-btn app-btn--ghost app-btn--icon"', 'class="nav-icon"')

with open(filepath_topnav, 'w') as f:
    f.write(content)

# 2. Fix AdminView.vue to make tabs sticky
filepath_admin = 'photobooth-server/frontend/src/views/AdminView.vue'
with open(filepath_admin, 'r') as f:
    content = f.read()

css_old = """.admin-tabs-container {
  display: flex;
  justify-content: flex-start;
  padding: 0 var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}"""

css_new = """.admin-tabs-container {
  display: flex;
  justify-content: flex-start;
  padding: 0 var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 58px; /* Height of AppTopNav */
  z-index: 40;
}"""

content = content.replace(css_old, css_new)

with open(filepath_admin, 'w') as f:
    f.write(content)

print("Fixed topnav button classes and admin tabs sticky behavior.")
