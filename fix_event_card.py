import os

filepath = 'photobooth-server/frontend/src/views/EventListView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Replace the organizer span with block-level or just <div>, and use event.organizer
old_org = "<span class=\"event-organizer\">Organizer: {{ authStore.user?.email || 'Admin' }}</span>\n            <span class=\"event-date\">{{ formatDate(event.date) }}</span>"
new_org = "<div class=\"event-organizer\">{{ event.organizer || authStore.user?.email || 'Admin' }}</div>\n            <div class=\"event-date\">{{ formatDate(event.date) }}</div>"

content = content.replace(old_org, new_org)

# Also update the CSS for event-organizer and event-date
old_css_org = """.event-organizer {
  font-size: var(--text-xs);
  color: var(--color-text-sub);
  margin-top: -0.25rem;
}

.event-date {"""
new_css_org = """.event-organizer {
  display: block;
  font-size: var(--text-xs);
  color: var(--color-text-sub);
  margin-top: 0.25rem;
}

.event-date {
  display: block;
  margin-top: 0.25rem;"""
content = content.replace(old_css_org, new_css_org)

with open(filepath, 'w') as f:
    f.write(content)

print("EventListView updated to use DB organizer and split lines.")
