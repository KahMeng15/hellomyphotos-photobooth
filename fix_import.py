import os

filepath = 'photobooth-server/frontend/src/views/SettingsView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Add import safely
if 'import AppButton' not in content:
    content = content.replace("import { useRouter, onBeforeRouteLeave } from 'vue-router'", "import { useRouter, onBeforeRouteLeave } from 'vue-router'\nimport AppButton from '../components/ui/AppButton.vue'")

with open(filepath, 'w') as f:
    f.write(content)

print("Import added.")
