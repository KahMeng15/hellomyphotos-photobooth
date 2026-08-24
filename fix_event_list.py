import os

filepath = 'photobooth-server/frontend/src/views/EventListView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace header block
start = content.find('    <header class="page-header">')
end = content.find('    </header>') + len('    </header>')

if start != -1 and end != -1:
    new_header = '    <AppTopNav mode="home" />'
    content = content[:start] + new_header + content[end:]

# Restructure events-header to include Create button
old_events_header = """      <div class="events-header">
        <h2>Events</h2>
        <div class="events-header-right">
          <span class="event-count">{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
          <router-link v-if="authStore.user?.role === 'admin'" to="/admin" class="btn-link">System Admin</router-link>
        </div>
      </div>"""

new_events_header = """      <div class="events-header">
        <div class="events-header-left">
          <h2>Events</h2>
          <span class="event-count">{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="events-header-right">
          <AppButton v-if="authStore.user?.role === 'admin'" variant="primary" @click="showCreateModal = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create Event
          </AppButton>
        </div>
      </div>"""

content = content.replace(old_events_header, new_events_header)

# Import AppTopNav and AppButton in script setup
import_block = """<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppTopNav from '../components/ui/AppTopNav.vue'
import AppButton from '../components/ui/AppButton.vue'"""
content = content.replace("<script setup lang=\"ts\">\nimport { ref, onMounted } from 'vue'", import_block)

# Clean up CSS for events-header
css_start = content.find('.events-header {')
css_end = content.find('.event-grid {')

if css_start != -1 and css_end != -1:
    new_css = """.events-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
  padding: 0 var(--space-6);
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  margin-top: var(--space-8);
}
.events-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.events-header h2 {
  font-size: var(--text-2xl);
  font-weight: 700;
  margin: 0;
}
.event-count {
  color: var(--color-text-sub);
  font-size: var(--text-sm);
  background: var(--color-surface);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
}
"""
    content = content[:css_start] + new_css + content[css_end:]

# also remove .page-header block from CSS
page_header_start = content.find('.page-header {')
page_header_end = content.find('.events-main {')
if page_header_start != -1 and page_header_end != -1:
    content = content[:page_header_start] + content[page_header_end:]

# update events-main
events_main_start = content.find('.events-main {')
events_main_end = content.find('.events-header {')
if events_main_start != -1 and events_main_end != -1:
    new_main_css = """.events-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
"""
    content = content[:events_main_start] + new_main_css + content[events_main_end:]

with open(filepath, 'w') as f:
    f.write(content)

print("EventListView refactored.")
