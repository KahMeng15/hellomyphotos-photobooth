<template>
  <div class="dashboard page-wrapper" v-if="event">
    <AppTopNav mode="event" :event="event" currentTitle="Analytics" />

    <div class="app-page-layout">
      <div class="analytics-content" v-if="loading" >
        <p>Loading analytics...</p>
      </div>
      
      <div class="analytics-content" v-else-if="analytics" >
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

        <h3 style="margin: 0 0 1rem 0; color: var(--color-text); font-size: 1.1rem;">Recent Activity</h3>
        <div class="logs-container" style="background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;">
          <table class="logs-table" v-if="analytics.logs.length > 0" style="width: 100%; border-collapse: collapse; text-align: left; font-size: var(--text-sm);">
            <thead>
              <tr>
                <th >Time</th>
                <th >Action</th>
                <th >Source</th>
                <th >Device</th>
                <th >Target</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in analytics.logs" :key="log.id">
                <td >{{ formatTime(log.created_at) }}</td>
                <td >
                  <span class="badge" :class="log.action === 'download' ? 'badge-blue' : 'badge-gray'" >
                    {{ log.action }}
                  </span>
                </td>
                <td >
                  <span class="badge badge-purple" v-if="log.source === 'qr'" >QR</span>
                  <span class="badge badge-gray" v-else >Direct</span>
                </td>
                <td >{{ log.device_type }} / {{ log.os }}</td>
                <td class="target-col" :title="log.target_file || '-'" >{{ log.target_file || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-state" style="text-align: center; padding: 2rem; color: var(--color-text-sub);">No activity yet.</p>
        </div>
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

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 2rem;
}
.stat-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-text);
}
.stat-label {
  color: var(--color-text-sub);
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.5rem;
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
</style>
