<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Analytics" />

    <div class="app-page-layout analytics-container">
      <div v-if="loading" class="app-empty-state">
        <p>Loading analytics...</p>
      </div>
      
      <div v-else-if="analytics">
        <section class="card">
          <h2>Overview</h2>
          <p class="card-desc">Traffic and engagement metrics for this event.</p>
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ analytics.totalVisits }}</span>
              <span class="stat-label">Total Views</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ analytics.uniqueVisitors }}</span>
              <span class="stat-label">Unique Visitors</span>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>Recent Activity</h2>
          <p class="card-desc">Latest visitor interactions with the gallery.</p>
          <div class="settings-box">
            <table class="logs-table" v-if="analytics.logs.length > 0">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Source</th>
                  <th>Device</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in analytics.logs" :key="log.id">
                  <td class="log-time" data-label="Time">{{ formatTime(log.created_at) }}</td>
                  <td data-label="Action">
                    <span class="badge" :class="log.action === 'download' ? 'badge-blue' : 'badge-gray'">
                      {{ log.action }}
                    </span>
                  </td>
                  <td data-label="Source">
                    <span class="badge badge-purple" v-if="log.source === 'qr'">QR</span>
                    <span class="badge badge-gray" v-else>Direct</span>
                  </td>
                  <td class="log-device" data-label="Device">{{ log.device_type }} / {{ log.os }}</td>
                  <td class="log-target" data-label="Target" :title="log.target_file || '-'">{{ log.target_file || '-' }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else class="app-empty-state">No activity yet.</div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppTopNav from '../components/ui/AppTopNav.vue'
// import AppPageLayout from '../components/ui/AppPageLayout.vue'
import axios from 'axios'

const router = useRouter()
const route = useRoute()

const eventId = computed(() => route.params.id as string)
const event = ref<any>(null)
const loading = ref(true)
const analytics = ref<any>(null)

async function fetchData() {
  try {
    const { data: eventData } = await axios.get(`/api/admin/events/${eventId.value}`)
    event.value = eventData.event

    const { data: analyticsData } = await axios.get(`/api/admin/events/${eventId.value}/analytics`)
    analytics.value = analyticsData
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function formatTime(str: string) {
  const d = new Date(str)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.page-wrapper {
  background: var(--color-bg);
  min-height: 100vh;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
}
.page-content {
  flex: 1;
  display: flex;
  justify-content: center;
}


.analytics-container {
  max-width: 900px;
  margin: 0 auto;
}
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

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 1.5rem;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}
.stat-label {
  color: var(--color-text-sub);
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.75rem;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: var(--text-sm);
}
.logs-table th {
  padding: 1rem 1.25rem;
  font-weight: 500;
  color: var(--color-text-sub);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.logs-table td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}
.logs-table tbody tr:last-child td {
  border-bottom: none;
}
.logs-table tbody tr:nth-child(even) {
  background: var(--color-surface-alt);
}
.log-time, .log-device {
  color: var(--color-text-sub) !important;
}
.log-target {
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-lg);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
.badge-blue {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}
.badge-gray {
  background: rgba(156, 163, 175, 0.2);
  color: #9ca3af;
}
.badge-purple {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

@media (max-width: 768px) {
  .settings-box {
    overflow-x: auto;
  }
  .logs-table thead {
    display: none;
  }
  .logs-table, .logs-table tbody, .logs-table tr, .logs-table td {
    display: block;
    width: 100%;
  }
  .logs-table tr {
    border-bottom: 1px solid var(--color-border);
    padding: 0.5rem 0;
  }
  .logs-table td {
    border: none;
    padding: 0.25rem 1.25rem;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .logs-table td::before {
    content: attr(data-label);
    font-size: 0.75rem;
    color: var(--color-text-sub);
    text-transform: uppercase;
  }
}
</style>
