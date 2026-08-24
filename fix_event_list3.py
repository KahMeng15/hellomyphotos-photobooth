import os

filepath = 'photobooth-server/frontend/src/views/EventListView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Remove the event counter
count_span = "<span class=\"event-count\">{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>"
content = content.replace(count_span, '')

# 2. Move event-date to event-meta
old_date = "<div class=\"event-date\">{{ formatDate(event.date) }}</div>\n            <p v-if=\"event.description\""
# Just remove it from here
content = content.replace(old_date, "<p v-if=\"event.description\"")

# And insert it into event-meta
old_meta = """<div class="event-meta">
            
            <span class="event-status\""""
new_meta = """<div class="event-meta">
            <div class="event-date">{{ formatDate(event.date) }}</div>
            <span class="event-status\""""
# Wait, let's just replace the exact block to be safe:
meta_block_old = """<div class="event-meta">
            
            <span class="event-status" :class="`status-${event.status}`">{{ event.status }}</span>
          </div>"""
meta_block_new = """<div class="event-meta">
            <div class="event-date">{{ formatDate(event.date) }}</div>
            <span class="event-status" :class="`status-${event.status}`">{{ event.status }}</span>
          </div>"""
content = content.replace(meta_block_old, meta_block_new)

# 3. Update event-meta CSS to space-between
meta_css_old = """.event-meta {
  display: flex;
  justify-content: flex-end;"""
meta_css_new = """.event-meta {
  display: flex;
  justify-content: space-between;"""
content = content.replace(meta_css_old, meta_css_new)

# Also fix the event-date CSS margin if it looks off now that it's in a flex row.
# We had `margin-top: 0.25rem;` on it before. We should remove it.
date_css_old = """.event-date {
  display: block;
  margin-top: 0.25rem;"""
date_css_new = """.event-date {
  font-size: var(--text-sm);
  color: var(--color-text-sub);"""
content = content.replace(date_css_old, date_css_new)

with open(filepath, 'w') as f:
    f.write(content)

print("EventListView updated successfully.")
