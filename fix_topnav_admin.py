import os

filepath = 'photobooth-server/frontend/src/components/ui/AppTopNav.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Add admin mode to nav-left
admin_mode_html = """
      <!-- Admin Mode -->
      <template v-else-if="mode === 'admin'">
        <button @click="navigateBack" class="app-btn app-btn--ghost app-btn--icon" title="Back to events">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 class="event-nav-title">{{ currentTitle || 'System Admin' }}</h1>
      </template>"""

if 'mode === \'admin\'' not in content:
    # Insert after event mode template ends, before </div> of nav-left
    # Wait, the structure is:
    # <template v-else-if="mode === 'event'">
    # ...
    # </template>
    # </div>
    
    content = content.replace('</template>\n    </div>', '</template>' + admin_mode_html + '\n    </div>')

with open(filepath, 'w') as f:
    f.write(content)

print("AppTopNav admin mode added.")
