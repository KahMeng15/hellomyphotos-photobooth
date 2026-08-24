<template>
  <div class="user-dropdown-wrapper" ref="dropdownRef">
    <button @click="toggle" class="user-email-btn" :class="{ 'is-open': isOpen }">
      {{ authStore.user?.email }}
    </button>
    
    <div v-if="isOpen" class="dropdown-menu">
      <button v-if="authStore.user?.role === 'admin'" @click="goToAdmin" class="dropdown-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        Admin Dashboard
      </button>
      
      <div v-if="authStore.user?.role === 'admin'" class="dropdown-divider"></div>
      
      <button @click="handleLogout" class="dropdown-item danger">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Logout
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

function toggle() {
  isOpen.value = !isOpen.value
}

function closeDropdown(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdown)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})

function goToAdmin() {
  isOpen.value = false
  router.push('/admin')
}

async function handleLogout() {
  isOpen.value = false
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.user-dropdown-wrapper {
  position: relative;
  display: inline-block;
}

.user-email-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-sub);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-base);
}

.user-email-btn:hover, .user-email-btn.is-open {
  background: var(--color-border);
  color: var(--color-text);
}

.chevron {
  transition: transform var(--transition-base);
}
.chevron.rotate {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-1);
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  min-width: 200px;
  z-index: var(--z-modal);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  background: transparent;
  border: none;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-base);
}

.dropdown-item:hover {
  background: var(--color-border);
}

.dropdown-item.danger {
  color: var(--color-error);
}
.dropdown-item.danger:hover {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0;
}
</style>
