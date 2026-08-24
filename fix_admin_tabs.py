import os

filepath = 'photobooth-server/frontend/src/views/AdminView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update Tabs HTML
old_tabs_html = """    <div class="admin-tabs-container">
      <div class="admin-tabs">
        <button :class="['tab-btn', { active: currentTab === 'frames' }]" @click="currentTab = 'frames'">Frames & Health</button>
        <button :class="['tab-btn', { active: currentTab === 'settings' }]" @click="currentTab = 'settings'">Global Settings</button>
        <button v-if="authStore.user?.role === 'admin'" :class="['tab-btn', { active: currentTab === 'users' }]" @click="currentTab = 'users'">Users</button>
      </div>
    </div>"""

new_tabs_html = """    <div class="admin-tabs-container">
      <div class="admin-tabs">
        <button :class="['tab-btn', { active: currentTab === 'settings' }]" @click="currentTab = 'settings'">Global Settings</button>
        <button v-if="authStore.user?.role === 'admin'" :class="['tab-btn', { active: currentTab === 'users' }]" @click="currentTab = 'users'">Users</button>
        <button :class="['tab-btn', { active: currentTab === 'health' }]" @click="currentTab = 'health'">Server Health</button>
      </div>
    </div>"""
content = content.replace(old_tabs_html, new_tabs_html)

# 2. Update default tab in script
content = content.replace("const currentTab = ref('frames')", "const currentTab = ref('settings')")

# 3. Remove Frame Library section
frame_section_start = content.find('<section class="admin-card">\n          <h2>Frame Library</h2>')
if frame_section_start != -1:
    frame_section_end = content.find('</section>', frame_section_start) + len('</section>')
    content = content[:frame_section_start] + content[frame_section_end:]

# Update v-if for frames tab to health
content = content.replace('v-if="currentTab === \'frames\'"', 'v-if="currentTab === \'health\'"')

# 4. Update Tabs CSS
# We need to replace the old css for admin-tabs-container, admin-tabs, tab-btn, and tab-btn.active
# Let's just do a big replace or string matching.

css_to_replace = """.admin-tabs-container {
  display: flex;
  justify-content: center;
  padding: var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.admin-tabs {
  display: flex;
  gap: 0.5rem;
  background: var(--color-border);
  padding: 0.25rem;
  border-radius: var(--radius-md);
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--color-text-sub);
  padding: 0.5rem 1rem;
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn.active {
  background: var(--color-border);
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}"""

new_css = """.admin-tabs-container {
  display: flex;
  justify-content: flex-start;
  padding: 0 var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.admin-tabs {
  display: flex;
  gap: var(--space-6);
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--color-text-sub);
  padding: var(--space-3) 0;
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -1px;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn.active {
  background: transparent;
  color: var(--color-text);
  box-shadow: none;
  border-bottom: 2px solid var(--color-text);
}"""

content = content.replace(css_to_replace, new_css)

with open(filepath, 'w') as f:
    f.write(content)

print("AdminView tabs aligned left, padded 0, frame library removed.")
