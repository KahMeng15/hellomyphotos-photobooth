import os

filepath = 'photobooth-server/frontend/src/views/UsersView.vue'
with open(filepath, 'r') as f:
    content = f.read()

old_html = """    <main class="users-main">
      <div class="users-header">
        <h2>Users</h2>
        <button @click="showAddModal = true" class="btn-primary btn-sm">Add User</button>
      </div>

      <div class="user-grid">
        <div v-for="user in users" :key="user.id" class="user-card">
          <div class="user-info">
            <h3 class="user-email">{{ user.email }}</h3>
            <span class="user-role" :class="`role-${user.role}`">{{ user.role }}</span>
          </div>
          <button v-if="user.email !== authStore.user?.email" @click="deleteUser(user.id)" class="btn-icon">✕</button>
        </div>
      </div>
    </main>"""

new_html = """    <main class="users-main">
      <section class="card">
        <h2>System Users</h2>
        <p class="card-desc">Manage administrators and operators for your photobooth.</p>
        <div class="settings-box">
          <div v-for="user in users" :key="user.id" class="field-row">
            <div class="user-info">
              <h3 class="user-email">{{ user.email }}</h3>
              <span class="user-role" :class="`role-${user.role}`">{{ user.role }}</span>
            </div>
            <button v-if="user.email !== authStore.user?.email" @click="deleteUser(user.id)" class="btn-icon" title="Remove User">✕</button>
          </div>
        </div>
        <div class="card-actions">
          <button @click="showAddModal = true" class="btn-primary">Add User</button>
        </div>
      </section>
    </main>"""

content = content.replace(old_html, new_html)

# Add CSS for card
css_add = """
.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.card h2 {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 0.25rem;
}
.card-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0 0 1.25rem;
}
.settings-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}
.field-row:last-child {
  border-bottom: none;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.5rem;
}
"""

content = content.replace("</style>", css_add + "</style>")

# Remove old CSS
content = content.replace(".user-grid {\n  display: grid;\n  gap: 1rem;\n}", "")
content = content.replace(".user-card {\n  background: var(--color-surface);\n  border: 1px solid var(--color-border);\n  border-radius: var(--radius-md);\n  padding: 1rem;\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}", "")
content = content.replace(".users-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  margin-bottom: 1.5rem;\n}", "")

with open(filepath, 'w') as f:
    f.write(content)

print("UsersView updated.")
