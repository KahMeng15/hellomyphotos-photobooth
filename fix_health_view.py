import os

filepath = 'photobooth-server/frontend/src/views/AdminView.vue'
with open(filepath, 'r') as f:
    content = f.read()

old_html = """        <section class="admin-card">
          <h2>Server Health</h2>
          <div class="health-stats" v-if="health">
            <div class="stat">
              <span class="stat-label">Uptime</span>
              <span class="stat-value">{{ formatUptime(health.uptime) }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Memory</span>
              <span class="stat-value">{{ health.system?.memory?.usagePercent }}%</span>
            </div>
            <div class="stat">
              <span class="stat-label">Photos</span>
              <span class="stat-value">{{ health.storage?.photos }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Queue</span>
              <span class="stat-value">{{ health.queue?.depth || 0 }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">WebSocket</span>
              <span class="stat-value">{{ health.connections?.websocket || 0 }}</span>
            </div>
          </div>
          <p v-else class="empty">Loading health data...</p>
          <button @click="fetchHealth" class="btn-secondary">Refresh</button>
        </section>"""

new_html = """        <section class="card">
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
        </section>"""

content = content.replace(old_html, new_html)

# Ensure CSS for card is in AdminView.vue (it might already have .admin-card, we will just add .card)
css_add = """
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
"""

content = content.replace("</style>", css_add + "</style>")

# Replace <div v-if="currentTab === 'health'" class="admin-grid"> with <div v-if="currentTab === 'health'" class="health-container">
content = content.replace('class="admin-grid"', 'class="health-container"')

with open(filepath, 'w') as f:
    f.write(content)

print("AdminView Health tab updated.")
