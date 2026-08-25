import re

filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Fix the dangling async
content = content.replace("async \nfunction triggerReshot()", "function triggerReshot()")
# Just in case there are other spaces
content = re.sub(r'async\s*\nfunction triggerReshot\(\)', 'function triggerReshot()', content)

with open(filepath, 'w') as f:
    f.write(content)
