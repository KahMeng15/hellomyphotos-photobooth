<template>
  <div class="users-page">
    <main class="users-main">
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
    </main>

    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal-content">
          <h2>Add New User</h2>
          <div class="form-field">
            <label>Email</label>
            <input type="email" v-model="newUser.email" placeholder="operator@example.com" />
          </div>
          <div class="form-field">
            <label>Password</label>
            <input type="password" v-model="newUser.password" />
          </div>
          <div class="form-field">
            <label>Role</label>
            <select v-model="newUser.role">
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
            </select>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" @click="showAddModal = false">Cancel</button>
            <button class="btn-primary" @click="addUser" :disabled="loading">
              {{ loading ? 'Saving...' : 'Add User' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { toast } from 'vue3-toastify'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const users = ref<any[]>([])
const showAddModal = ref(false)
const loading = ref(false)
const newUser = ref({ email: '', password: '', role: 'operator' })

async function fetchUsers() {
  try {
    const { data } = await axios.get('/api/admin/users')
    users.value = data.users
  } catch (err: any) {
    alert(err.response?.data?.error || 'Failed to fetch users')
  }
}

async function addUser() {
  if (!newUser.value.email || !newUser.value.password) return
  loading.value = true
  try {
    await axios.post('/api/admin/users', newUser.value)
    showAddModal.value = false
    newUser.value = { email: '', password: '', role: 'operator' }
    toast.success('User added successfully')
    await fetchUsers()
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to add user')
  } finally {
    loading.value = false
  }
}

async function deleteUser(id: string) {
  if (!confirm('Are you sure you want to delete this user?')) return
  try {
    await axios.delete(`/api/admin/users/${id}`)
    toast.success('User deleted')
    await fetchUsers()
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to delete user')
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<style scoped>
.users-page {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 50;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.header-left h1 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0;
}
.btn-ghost {
  background: none;
  border: none;
  color: var(--color-text-sub);
  cursor: pointer;
  padding: 0.25rem;
}
.btn-ghost:hover {
  color: var(--color-text);
}
.users-main {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
.users-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.users-header h2 {
  font-size: 1.25rem;
  font-weight: 500;
  margin: 0;
}
.user-grid {
  display: grid;
  gap: 1rem;
}
.user-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.user-email {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 500;
}
.user-role {
  font-size: var(--text-xs);
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-lg);
  background: var(--color-border);
  width: max-content;
}
.role-admin {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}
.role-operator {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}
.btn-primary {
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  font-weight: 500;
  cursor: pointer;
}
.btn-primary:hover {
  background: #e5e5e5;
}
.btn-sm {
  font-size: var(--text-sm);
  padding: 0.4rem 0.75rem;
}
.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn-icon {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.5rem;
}
.btn-icon:hover {
  color: var(--color-error);
}

/* Modal styles from existing app */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  width: 100%;
  max-width: 400px;
}
.modal-content h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.25rem;
}
.form-field {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.form-field label {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}
.form-field input, .form-field select {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.5rem;
  border-radius: var(--radius-sm);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
</style>
