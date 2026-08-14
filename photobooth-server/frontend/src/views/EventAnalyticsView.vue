<template>
  <div class="dashboard page-wrapper" v-if="event">
    <EventTopNav :event="event" currentTitle="Analytics" />

    <div class="page-content" style="padding: 2rem;">
      <div class="analytics-content" v-if="loading" style="max-width: 800px; margin: 0 auto; width: 100%;">
        <p>Loading analytics...</p>
      </div>
      
      <div class="analytics-content" v-else-if="analytics" style="max-width: 800px; margin: 0 auto; width: 100%;">
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

        <h3 style="margin: 0 0 1rem 0; color: #fff; font-size: 1.1rem;">Recent Activity</h3>
        <div class="logs-container" style="background: #222; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
          <table class="logs-table" v-if="analytics.logs.length > 0" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem;">
            <thead>
              <tr>
                <th style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; background: #2a2a2a; font-weight: 500; color: #fff;">Time</th>
                <th style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; background: #2a2a2a; font-weight: 500; color: #fff;">Action</th>
                <th style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; background: #2a2a2a; font-weight: 500; color: #fff;">Source</th>
                <th style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; background: #2a2a2a; font-weight: 500; color: #fff;">Device</th>
                <th style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; background: #2a2a2a; font-weight: 500; color: #fff;">Target</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in analytics.logs" :key="log.id">
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; color: #ccc;">{{ formatTime(log.created_at) }}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; color: #ccc;">
                  <span class="badge" :class="log.action === 'download' ? 'badge-blue' : 'badge-gray'" style="padding: 0.2rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">
                    {{ log.action }}
                  </span>
                </td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; color: #ccc;">
                  <span class="badge badge-purple" v-if="log.source === 'qr'" style="padding: 0.2rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">QR</span>
                  <span class="badge badge-gray" v-else style="padding: 0.2rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">Direct</span>
                </td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; color: #ccc;">{{ log.device_type }} / {{ log.os }}</td>
                <td class="target-col" :title="log.target_file || '-'" style="padding: 0.75rem 1rem; border-bottom: 1px solid #333; color: #ccc; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ log.target_file || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-state" style="text-align: center; padding: 2rem; color: #888;">No activity yet.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import EventTopNav from '../components/EventTopNav.vue'
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
  background: #1a1a1a;
  min-height: 100vh;
  color: #fff;
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
  background: #222;
  border: 1px solid #333;
  padding: 1.5rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #fff;
}
.stat-label {
  color: #888;
  font-size: 0.875rem;
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
