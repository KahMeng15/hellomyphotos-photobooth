import os

filepath = 'photobooth-server/frontend/src/views/UsersView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace HTML
old_html = """          <div v-for="user in users" :key="user.id" class="field-row">
            <div class="user-info">
              <h3 class="user-email">{{ user.email }}</h3>
              <span class="user-role" :class="`role-${user.role}`">{{ user.role }}</span>
            </div>
            <button v-if="user.email !== authStore.user?.email" @click="deleteUser(user.id)" class="btn-icon" title="Remove User">✕</button>
          </div>"""

new_html = """          <div v-for="user in users" :key="user.id" class="field-row">
            <div class="user-info">
              <h3 class="user-email">{{ user.email }}</h3>
            </div>
            <div class="user-actions">
              <span class="user-role" :class="`role-${user.role}`">{{ user.role }}</span>
              <button v-if="user.email !== authStore.user?.email" @click="deleteUser(user.id)" class="btn-icon" title="Remove User">✕</button>
              <div v-else class="btn-icon-placeholder"></div>
            </div>
          </div>"""

content = content.replace(old_html, new_html)

# Add CSS for .user-actions and .btn-icon-placeholder
# and update user-role to not need width: max-content necessarily
css_add = """
.user-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.btn-icon-placeholder {
  width: 32px; /* roughly the size of the icon button to keep alignment consistent */
}
"""

content = content.replace(".user-info {", css_add + "\n.user-info {")

with open(filepath, 'w') as f:
    f.write(content)

print("Users tag aligned to right.")
