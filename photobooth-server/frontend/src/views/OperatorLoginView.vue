<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1>hellomyphoto</h1>
        <p>Event Operator Login</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="field">
          <label for="password">Operator Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="Enter password"
            required
            autocomplete="current-password"
          />
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <button type="submit" class="btn-login" :disabled="loading">
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
import { toast } from 'vue3-toastify'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const password = ref('')
const error = ref('')
const loading = ref(false)

const token = computed(() => route.params.token as string)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await axios.post('/api/auth/operator-login', { token: token.value, password: password.value })
    if (data.success) {
      authStore.setToken(data.accessToken, data.user)
      toast.success('Logged in successfully')
      router.push(`/events/${data.user.eventId}`)
    }
  } catch (err: any) {
    console.error('Operator login error:', err)
    error.value = err.response?.data?.error || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--color-bg);
  padding: 1rem;
}

.login-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.login-header p {
  color: var(--color-text-sub);
  margin: 0.5rem 0 0;
  font-size: var(--text-sm);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-sub);
}

.field input {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-base);
  outline: none;
  transition: border-color 0.2s;
}

.field input:focus {
  border-color: var(--color-text-muted);
}

.error-msg {
  color: var(--color-error);
  font-size: var(--text-sm);
  margin: 0;
}

.btn-login {
  padding: 0.75rem;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-login:hover {
  opacity: 0.9;
}

.btn-login:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .login-card {
    border: none;
    background: transparent;
    padding: 1.5rem;
    box-shadow: none;
  }
}
</style>
