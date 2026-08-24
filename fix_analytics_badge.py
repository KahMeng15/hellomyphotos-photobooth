import os

filepath = 'photobooth-server/frontend/src/views/EventAnalyticsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

content = content.replace('border-radius: var(--radius-full);', 'border-radius: var(--radius-lg);')

with open(filepath, 'w') as f:
    f.write(content)

print("Updated Analytics badge rounding.")
