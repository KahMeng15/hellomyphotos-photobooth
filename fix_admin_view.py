import os

filepath = 'photobooth-server/frontend/src/views/AdminView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace the hidden header with just the tabs, nicely styled
old_header = """    <header class="admin-header" style="display:none;">
      <button @click="router.push('/events')" class="btn-ghost">&larr; Dashboard</button>
      <h1>System Admin</h1>
      <div class="admin-tabs">
        <button :class="['tab-btn', { active: currentTab === 'frames' }]" @click="currentTab = 'frames'">Frames & Health</button>
        <button :class="['tab-btn', { active: currentTab === 'settings' }]" @click="currentTab = 'settings'">Global Settings</button>
        <button v-if="authStore.user?.role === 'admin'" :class="['tab-btn', { active: currentTab === 'users' }]" @click="currentTab = 'users'">Users</button>
      </div>
    </header>"""

new_header = """    <div class="admin-tabs-container">
      <div class="admin-tabs">
        <button :class="['tab-btn', { active: currentTab === 'frames' }]" @click="currentTab = 'frames'">Frames & Health</button>
        <button :class="['tab-btn', { active: currentTab === 'settings' }]" @click="currentTab = 'settings'">Global Settings</button>
        <button v-if="authStore.user?.role === 'admin'" :class="['tab-btn', { active: currentTab === 'users' }]" @click="currentTab = 'users'">Users</button>
      </div>
    </div>"""

content = content.replace(old_header, new_header)

# update CSS for admin-tabs-container
css_old = """.admin-tabs {
  display: flex;
  gap: 0.5rem;
  background: var(--color-border);
  padding: 0.25rem;
  border-radius: var(--radius-md);
}"""
css_new = """.admin-tabs-container {
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
}"""

content = content.replace(css_old, css_new)

with open(filepath, 'w') as f:
    f.write(content)

print("AdminView restored tabs.")
