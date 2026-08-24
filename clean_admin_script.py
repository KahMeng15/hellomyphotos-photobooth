import os
import re

filepath = 'photobooth-server/frontend/src/views/AdminView.vue'
with open(filepath, 'r') as f:
    content = f.read()

# Remove fetchFrames from onMounted
content = content.replace('  await photosStore.fetchFrames()\n', '')

# Remove unused refs and functions related to frames
content = re.sub(r'const fileInput = ref<HTMLInputElement \| null>\(null\)\n', '', content)

func_open = r'function openFilePicker\(\) \{.*?\n\}'
content = re.sub(func_open, '', content, flags=re.DOTALL)

func_handle_select = r'async function handleFileSelect\(e: Event\) \{.*?\n\}'
content = re.sub(func_handle_select, '', content, flags=re.DOTALL)

func_handle_drop = r'async function handleDrop\(e: DragEvent\) \{.*?\n\}'
content = re.sub(func_handle_drop, '', content, flags=re.DOTALL)

func_delete = r'async function deleteFrame\(id: string\) \{.*?\n\}'
content = re.sub(func_delete, '', content, flags=re.DOTALL)

# Since photosStore might be unused now, remove it to be clean.
# Actually, wait, let's just leave it if there's no harm, but better to remove.
if 'photosStore' not in content.replace('const photosStore = usePhotosStore()', ''):
    content = content.replace("import { usePhotosStore } from '../stores/photos'\n", '')
    content = content.replace('const photosStore = usePhotosStore()\n', '')

with open(filepath, 'w') as f:
    f.write(content)

print("Cleaned up AdminView script.")
