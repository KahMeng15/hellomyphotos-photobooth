import re

filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

new_template = """<template>
  <aside class="control-panel" v-if="event">
    
    <!-- Status Card -->
    <section class="card" :class="{ 'card-connected': connected, 'card-disconnected': !connected }">
      <div class="card-header-flex">
        <div>
          <h2>Booth Status</h2>
          <p class="card-desc" style="margin-bottom:0;" v-if="!connected">Waiting for booth...</p>
        </div>
        <div class="status-indicator" @click="$emit('retry')" :style="{ cursor: !connected ? 'pointer' : 'default' }">
          <span class="pulse-dot" :class="{ 'active': connected }"></span>
          {{ connected ? 'Connected' : 'Disconnected' }}
        </div>
      </div>
      
      <div v-if="!connected && event.otp" class="otp-box">
        <p class="card-desc">Enter OTP in booth app:</p>
        <div class="otp-code-row">
          <span class="otp-code">{{ event.otp }}</span>
          <button @click="copyOtp" class="app-btn app-btn--secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">{{ otpCopied ? 'Copied' : 'Copy' }}</button>
        </div>
      </div>
    </section>

    <!-- Stats Card -->
    <section class="card" v-if="totalSessions !== undefined">
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">{{ totalSessions }}</span>
          <span class="stat-label">Sessions</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ totalPhotos }}</span>
          <span class="stat-label">Photos</span>
        </div>
      </div>
    </section>

    <!-- Controls Card -->
    <section class="card" v-if="connected">
      <h2>Action Controls</h2>
      <p class="card-desc">Trigger booth functions remotely.</p>
      
      <div class="settings-box control-box">
        
        <div class="field-row">
          <div class="control-info">
            <label>Session Control</label>
            <span class="sub-label">{{ boothState === 'preview' ? 'User is previewing' : (boothState === 'live' ? 'Ready to capture' : 'Force action') }}</span>
          </div>
          <button class="app-btn" :class="actionButtonClass" @click="boothAction" :disabled="!canAct">
            {{ actionButtonLabel }}
          </button>
        </div>

        <div class="field-row">
          <div class="control-info">
            <label>Pause Booth</label>
            <span class="sub-label">Lock the screen.</span>
          </div>
          <div class="focus-toggle">
            <button :class="['focus-btn', paused ? 'focus-active' : '']" @click="togglePause(true)">PAUSE</button>
            <button :class="['focus-btn', !paused ? 'focus-active' : '']" @click="togglePause(false)">RESUME</button>
          </div>
        </div>

        <div class="field-row">
          <div class="control-info">
            <label>Retake Photo</label>
            <span class="sub-label">Force a reshot.</span>
          </div>
          <button class="app-btn app-btn--secondary" @click="triggerReshot">Retake</button>
        </div>

      </div>
    </section>

    <!-- Frame Override Card -->
    <section class="card" v-if="connected">
      <h2>Frame Override</h2>
      <div class="settings-box control-box" style="padding: 0.5rem 0.75rem;">
        <select v-model="selectedFrame" @change="sendFrameOverride" class="custom-select">
          <option value="">No Override</option>
          <option v-for="f in photosStore.frames" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </div>
    </section>

  </aside>
</template>"""

# Replace the template
template_regex = r'<template>.*?</template>'
content = re.sub(template_regex, new_template, content, flags=re.DOTALL)

# Add triggerReshot function and fix togglePause to accept boolean
script_add = """
function triggerReshot() {
  props.sendMessage('trigger-reshot', { eventId: props.eventId })
}

function togglePause(setPaused: boolean) {
  paused.value = setPaused
  props.sendMessage('booth-pause', { eventId: props.eventId, paused: paused.value })
}
"""
content = content.replace(
    """function togglePause() {
  paused.value = !paused.value
  props.sendMessage('booth-pause', { eventId: props.eventId, paused: paused.value })
}""", script_add)


new_css = """
<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
}
.card h2 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.card-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 1rem;
  line-height: 1.3;
}
.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

/* Status */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--text-sm);
  color: var(--color-text-sub);
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-error);
}
.pulse-dot.active {
  background: var(--color-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 20%, transparent);
}

.otp-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem;
}
.otp-code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.otp-code {
  font-family: monospace;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.15em;
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.75rem;
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}
.stat-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--color-text-sub);
}

/* Controls */
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
  padding: 1rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  gap: 1rem;
  flex-wrap: wrap;
}
.field-row:last-child {
  border-bottom: none;
}
.field-row:nth-child(even) {
  background: var(--color-surface-alt);
}

.control-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 120px;
}
.control-info label {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.control-info .sub-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.app-btn {
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  white-space: nowrap;
}
.btn-primary {
  background: var(--color-text);
  color: var(--color-bg);
}
.btn-primary:hover:not(:disabled) {
  background: var(--color-text-muted);
}
.app-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.app-btn--secondary:hover:not(:disabled) {
  background: var(--color-border);
}
.btn-warning {
  background: #ff9800;
  color: #fff;
}
.app-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.focus-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.focus-btn {
  background: var(--color-surface);
  border: none;
  color: var(--color-text-sub);
  padding: 0.375rem 0.625rem;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.focus-active {
  background: var(--color-text);
  color: var(--color-bg);
}

.custom-select {
  width: 100%;
  background: transparent;
  color: var(--color-text);
  border: none;
  font-size: var(--text-sm);
  outline: none;
  cursor: pointer;
}
</style>
"""

# Replace css completely
css_regex = r'<style scoped>.*?</style>'
content = re.sub(css_regex, new_css, content, flags=re.DOTALL)

with open(filepath, 'w') as f:
    f.write(content)

