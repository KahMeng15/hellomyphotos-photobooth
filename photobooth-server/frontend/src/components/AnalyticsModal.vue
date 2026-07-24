<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content analytics-modal">
      <header class="modal-header">
        <h2>Event Analytics</h2>
        <button class="btn-icon" @click="$emit('close')">✕</button>
      </header>

      <div class="analytics-content" v-if="loading">
        <p>Loading analytics...</p>
      </div>
      
      <div class="analytics-content" v-else-if="analytics">
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

        <h3>Recent Activity</h3>
        <div class="logs-container">
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
                <td>{{ formatTime(log.created_at) }}</td>
                <td>
                  <span class="badge" :class="log.action === 'download' ? 'badge-blue' : 'badge-gray'">
                    {{ log.action }}
                  </span>
                </td>
                <td>
                  <span class="badge badge-purple" v-if="log.source === 'qr'">QR</span>
                  <span class="badge badge-gray" v-else>Direct</span>
                </td>
                <td>{{ log.device_type }} / {{ log.os }}</td>
                <td class="target-col" :title="log.target_file || '-'">{{ log.target_file || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-state">No activity yet.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

const props = defineProps<{
  eventId: string
}>()

const emit = defineEmits(['close'])

const loading = ref(true)
const analytics = ref<any>(null)

async function fetchAnalytics() {
  try {
    const { data } = await axios.get(`/api/admin/events/${props.eventId}/analytics`)
    analytics.value = data
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
  fetchAnalytics()
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.analytics-modal {
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  overflow: hidden;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #333;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
  color: #fff;
}
.btn-icon {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 1.25rem;
}
.btn-icon:hover {
  color: #fff;
}
.analytics-content {
  padding: 1.5rem;
  overflow-y: auto;
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
h3 {
  margin: 0 0 1rem 0;
  color: #fff;
  font-size: 1.1rem;
}
.logs-container {
  background: #222;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
}
.logs-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;
}
.logs-table th, .logs-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333;
  color: #ccc;
}
.logs-table th {
  background: #2a2a2a;
  font-weight: 500;
  color: #fff;
}
.logs-table tr:last-child td {
  border-bottom: none;
}
.target-col {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
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
.empty-state {
  text-align: center;
  padding: 2rem;
  color: #888;
}
</style>
