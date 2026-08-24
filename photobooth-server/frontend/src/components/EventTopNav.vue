<template>
  <header class="dashboard-header">
    <div class="header-left">
      <button v-if="currentTitle || authStore.user?.role === 'admin'" @click="navigateBack" class="btn-back" :title="currentTitle ? 'Back to event' : 'Back to event list'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h1>
        <span class="event-name">{{ event.name || 'Untitled Event' }}</span>
        <span v-if="currentTitle" class="nav-divider">/</span>
        <span v-if="currentTitle" class="nav-subtitle">{{ currentTitle }}</span>
        <span v-if="!currentTitle && event.status" class="event-status" :class="`status-${event.status}`">{{ event.status }}</span>
      </h1>
    </div>
    <div class="header-right" style="display:flex; align-items:center; gap:0.5rem;">
      <button @click="router.push(`/events/${event.id}/analytics`)" :class="['btn-icon', { active: currentRoute === 'analytics' }]" title="Analytics">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      </button>
      <button @click="router.push(`/events/${event.id}/settings/event`)" :class="['btn-icon', { active: currentRoute === 'settings/event' }]" title="Event Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      <button @click="router.push(`/events/${event.id}/settings/booth`)" :class="['btn-icon', { active: currentRoute === 'settings/booth' }]" title="Booth Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="1" y1="14" x2="7" y2="14"></line>
          <line x1="9" y1="8" x2="15" y2="8"></line>
          <line x1="17" y1="16" x2="23" y2="16"></line>
        </svg>
      </button>
      <button @click="router.push(`/events/${event.id}/frames`)" :class="['btn-icon', { active: currentRoute === 'frames' }]" title="Frames">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      </button>
      
      <!-- Only show on root EventDetailView -->
      <button v-if="!currentTitle" @click="$emit('toggle-panel')" class="btn-icon btn-panel-toggle" title="Booth controller">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>

      <span class="user-email" style="color:#888; font-size:0.875rem; margin-left:0.5rem;">{{ authStore.user?.email }}</span>
      <button v-if="authStore.user?.role === 'admin'" @click="router.push('/admin')" class="btn-icon" title="Admin">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </button>
      <button @click="handleLogout" class="btn-icon" title="Logout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{
  event: any
  currentTitle: string
}>()

const emit = defineEmits(['toggle-panel'])

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

function navigateBack() {
  if (props.currentTitle) {
    router.push(`/events/${props.event.id}`)
  } else if (authStore.user?.role === 'admin') {
    router.push('/events')
  }
}

const currentRoute = computed(() => {
  const path = route.path
  if (path.includes('/analytics')) return 'analytics'
  if (path.includes('/frames')) return 'frames'
  if (path.includes('/settings/event')) return 'settings/event'
  if (path.includes('/settings/booth')) return 'settings/booth'
  return ''
})

import { ref } from 'vue'
import { toast } from 'vue3-toastify'
import axios from 'axios'
</script>

<style scoped>
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 2rem;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  position: sticky;
  top: 0;
  z-index: 50;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.header-left h1 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.nav-divider, .nav-subtitle {
  color: #888;
  font-weight: 400;
}

.btn-icon {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-icon:hover {
  background: #333;
  color: #fff;
}
.btn-icon.active {
  color: #fff;
  background: #444;
}
.event-status {
  font-size: 0.6875rem;
  text-transform: uppercase;
  padding: 0.125rem 0.5rem;
  border-radius: 100px;
}
.status-active {
  background: #1a3a2a;
  color: #4caf50;
}
.status-ended {
  background: #3a1a1a;
  color: #f44336;
}
.status-draft {
  background: #3a3a1a;
  color: #ffc107;
}
</style>
