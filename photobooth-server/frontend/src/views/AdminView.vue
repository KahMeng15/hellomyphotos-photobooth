<template>
  <div class="admin-page">
    <AppTopNav mode="admin" currentTitle="System Admin" />
    <div class="admin-tabs-container">
      <div class="admin-tabs">
        <button :class="['tab-btn', { active: currentTab === 'settings' }]" @click="currentTab = 'settings'">Global Settings</button>
        <button v-if="authStore.user?.role === 'admin'" :class="['tab-btn', { active: currentTab === 'users' }]" @click="currentTab = 'users'">Users</button>
        <button :class="['tab-btn', { active: currentTab === 'health' }]" @click="currentTab = 'health'">Server Health</button>
      </div>
    </div>

    <div class="admin-content">
      <div v-if="currentTab === 'health'" class="health-container">
        

        <section class="card">
          <h2>Server Health</h2>
          <p class="card-desc">System diagnostics and storage information.</p>
          <div class="settings-box" v-if="health">
            <div class="field-row">
              <label>Uptime</label>
              <div class="value">{{ formatUptime(health.uptime) }}</div>
            </div>
            <div class="field-row">
              <label>Memory</label>
              <div class="value">{{ health.system?.memory?.usagePercent }}%</div>
            </div>
            <div class="field-row">
              <label>Photos</label>
              <div class="value">{{ health.storage?.photos }}</div>
            </div>
            <div class="field-row">
              <label>Queue Depth</label>
              <div class="value">{{ health.queue?.depth || 0 }}</div>
            </div>
            <div class="field-row">
              <label>WebSocket Connections</label>
              <div class="value">{{ health.connections?.websocket || 0 }}</div>
            </div>
          </div>
          <p v-else class="empty">Loading health data...</p>
          <div class="card-actions">
            <button @click="fetchHealth" class="btn-secondary">Refresh</button>
          </div>
        </section>
      </div>

      <div v-if="currentTab === 'settings'">
        <SettingsViewEmbedded />
      </div>

      <div v-if="currentTab === 'users' && authStore.user?.role === 'admin'">
        <UsersViewEmbedded />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppTopNav from '../components/ui/AppTopNav.vue'
import AppPageLayout from '../components/ui/AppPageLayout.vue'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
import SettingsViewEmbedded from './SettingsView.vue'
import UsersViewEmbedded from './UsersView.vue'

const router = useRouter()
const authStore = useAuthStore()
const health = ref<any>(null)
const currentTab = ref('settings')

onMounted(async () => {
  await fetchHealth()
})

async function fetchHealth() {
  try {
    const { data } = await axios.get('/api/health')
    health.value = data
  } catch {}
}









function goBack() {
  router.back()
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.admin-header {
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

.admin-header h1 {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 0;
  color: var(--color-text);
}

.admin-tabs-container {
  display: flex;
  justify-content: flex-start;
  padding: 0 var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 58px; /* Height of AppTopNav */
  z-index: 40;
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
}

.admin-content {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.admin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
}

.admin-card h2 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 1rem;
}

.upload-area {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 2rem;
  text-align: center;
  color: var(--color-text-muted);
  margin-bottom: 1rem;
}

.upload-area p {
  margin: 0 0 0.75rem;
}

.frame-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.frame-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-sm);
}

.frame-name {
  font-size: var(--text-sm);
  color: var(--color-text);
}

.btn-icon {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.25rem;
}

.btn-icon:hover {
  color: var(--color-error);
}

.btn-ghost {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.btn-ghost:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.btn-secondary {
  background: var(--color-border);
  color: var(--color-text);
  border: none;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.health-stats {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}

.stat-value {
  font-size: var(--text-base);
  font-weight: 600;
}

.empty {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

@media (max-width: 768px) {
  .admin-grid {
    grid-template-columns: 1fr;
  }
}

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin: 1.5rem auto;
  max-width: 800px;
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
.field-row:nth-child(even) {
  background: var(--color-surface-alt);
}
.field-row label {
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}
.field-row .value {
  font-size: var(--text-base);
  font-weight: 500;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.5rem;
}
</style>
