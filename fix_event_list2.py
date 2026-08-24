import os

filepath = 'photobooth-server/frontend/src/views/EventListView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Padding missing in the main homepage: 
# Replace <main class="events-main"> with <main class="app-page-layout">
content = content.replace('<main class="events-main">', '<main class="app-page-layout">')

# 2. Align "Events" heading to the left and "Create Event" to the right:
# We already did this structurally, but CSS was constraining it. Let's fix the CSS.
css_old = """.events-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
  padding: 0 var(--space-6);
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  margin-top: var(--space-8);
}"""

css_new = """.events-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
  /* Full width via app-page-layout */
  width: 100%;
}"""

content = content.replace(css_old, css_new)

# 3. Format the date
# We will inject a helper function in script setup
helper_func = """function formatDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}"""

if 'function formatDate' not in content:
    content = content.replace("const otpCopied = ref(false)", f"const otpCopied = ref(false)\n\n{helper_func}")

# Update template date
content = content.replace('<span class="event-date">{{ event.date }}</span>', '<span class="event-date">{{ formatDate(event.date) }}</span>')

# 4. Add Organizer below event name
content = content.replace('<h3 class="event-name">{{ event.name }}</h3>', '<h3 class="event-name">{{ event.name }}</h3>\n            <span class="event-organizer">Organizer: {{ authStore.user?.email || \'Admin\' }}</span>')

# Add style for event-organizer
org_css = """.event-organizer {
  font-size: var(--text-xs);
  color: var(--color-text-sub);
  margin-top: -0.25rem;
}"""
content = content.replace('.event-date {', org_css + '\n\n.event-date {')

# 5. Remove OTP from event card
# We will replace '<span class="event-otp">OTP: {{ event.otp }}</span>' with nothing.
content = content.replace('<span class="event-otp">OTP: {{ event.otp }}</span>', '')

# Ensure event-meta is right-aligned if OTP is removed
meta_css_old = """.event-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}"""
meta_css_new = """.event-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}"""
content = content.replace(meta_css_old, meta_css_new)


with open(filepath, 'w') as f:
    f.write(content)

print("EventListView updated based on user feedback.")
