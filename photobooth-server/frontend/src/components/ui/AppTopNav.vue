<template>
  <header class="app-top-nav">
    <div class="nav-left">
      <!-- Home Mode -->
      <h1 v-if="mode === 'home'" class="logo-text">hellomyphoto</h1>
      
      <!-- Event Mode -->
      <template v-else-if="mode === 'event'">
        <button @click="navigateBack" class="app-btn app-btn--ghost app-btn--icon" :title="currentTitle ? 'Back to event' : 'Back to events'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 class="event-nav-title">
          <span class="event-name">{{ event?.name || 'Untitled Event' }}</span>
          <span v-if="currentTitle" class="nav-divider">/</span>
          <span v-if="currentTitle" class="nav-subtitle">{{ currentTitle }}</span>
          <span v-if="!currentTitle && event?.status" class="event-status" :class="`status-${event.status}`">{{ event.status }}</span>
        </h1>
      </template>
    </div>

    <div class="nav-right">
      <!-- Subpage Links (Only in Event Mode) -->
      <template v-if="mode === 'event' && event">
        <button @click="router.push(`/events/${event.id}/analytics`)" :class="['nav-icon', { active: currentRoute === 'analytics' }]" title="Analytics">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        </button>
        <button @click="router.push(`/events/${event.id}/settings/event`)" :class="['nav-icon', { active: currentRoute === 'settings/event' }]" title="Event Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button @click="router.push(`/events/${event.id}/settings/booth`)" :class="['nav-icon', { active: currentRoute === 'settings/booth' }]" title="Booth Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
        </button>
        <button @click="router.push(`/events/${event.id}/frames`)" :class="['nav-icon', { active: currentRoute === 'frames' }]" title="Frames">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        </button>
        <button v-if="!currentTitle" @click="$emit('toggle-panel')" class="nav-icon" title="Booth Controller">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
        <div class="nav-separator"></div>
      </template>

      <!-- User Dropdown (Always visible) -->
      <UserDropdown />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import UserDropdown from './UserDropdown.vue'

const props = withDefaults(defineProps<{
  mode?: 'home' | 'event' | 'admin'
  event?: any
  currentTitle?: string
}>(), {
  mode: 'event',
  currentTitle: ''
})

const emit = defineEmits(['toggle-panel'])

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

function navigateBack() {
  if (props.mode === 'admin') {
    router.push('/events')
  } else if (props.currentTitle) {
    router.push(`/events/${props.event?.id}`)
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
</script>

<style scoped>
.app-top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: var(--z-modal);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.logo-text {
  font-size: var(--text-xl);
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.event-nav-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.nav-divider, .nav-subtitle {
  color: var(--color-text-sub);
  font-weight: 400;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.nav-icon {
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-sub);
  cursor: pointer;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-base);
}

.nav-icon:hover {
  background: var(--color-surface-alt);
  color: var(--color-text);
  border-color: var(--color-border);
}

.nav-icon.active {
  background: var(--color-border);
  color: var(--color-text);
  border-color: var(--color-border);
}

.nav-separator {
  width: 1px;
  height: 24px;
  background: var(--color-border);
  margin: 0 var(--space-2);
}

.event-status {
  font-size: var(--text-xs);
  text-transform: uppercase;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  font-weight: 600;
  letter-spacing: 0.05em;
}

.status-active {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-success);
}
.status-ended {
  background: color-mix(in srgb, var(--color-error) 15%, transparent);
  color: var(--color-error);
}
.status-draft {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
}
</style>
