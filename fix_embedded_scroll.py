import os

def strip_min_height(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace min-height: 100vh;
    content = content.replace('min-height: 100vh;', '/* min-height: 100vh; removed to prevent double scrolling */')

    with open(filepath, 'w') as f:
        f.write(content)

strip_min_height('photobooth-server/frontend/src/views/UsersView.vue')
strip_min_height('photobooth-server/frontend/src/views/SettingsView.vue')

print("Fixed min-height issues.")
