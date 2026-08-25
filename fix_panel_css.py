import re
filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

# I will just clean up everything from `.queue-fill` onwards to end
queue_regex = r'\.queue-fill \{.*?\n\}\n.*?</style>'
new_end = """.queue-fill {
  height: 100%;
  background: var(--color-success);
  transition: width 0.3s;
  border-radius: 3px;
}
</style>"""
content = re.sub(queue_regex, new_end, content, flags=re.DOTALL)

with open(filepath, 'w') as f:
    f.write(content)
