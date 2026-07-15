import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ email: string; role: string } | null>(null)
  const accessToken = ref<string | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => !!user.value && !!accessToken.value)

  async function login(email: string, password: string) {
    loading.value = true
    try {
      const { data } = await axios.post('/api/auth/login', { email, password })
      user.value = data.user
      accessToken.value = data.accessToken
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`
      return data
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await axios.post('/api/auth/logout')
    } catch {
    } finally {
      user.value = null
      accessToken.value = null
      delete axios.defaults.headers.common['Authorization']
    }
  }

  async function checkAuth() {
    try {
      const { data } = await axios.get('/api/auth/me')
      user.value = data.user
      accessToken.value = 'restored'
      return true
    } catch {
      user.value = null
      accessToken.value = null
      return false
    }
  }

  async function refreshToken() {
    try {
      const { data } = await axios.post('/api/auth/refresh')
      accessToken.value = data.accessToken
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`
      return true
    } catch {
      await logout()
      return false
    }
  }

  return { user, accessToken, loading, isAuthenticated, login, logout, checkAuth, refreshToken }
})
