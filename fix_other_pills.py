import os

def replace_radius(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace('border-radius: var(--radius-pill);', 'border-radius: var(--radius-lg);')
    with open(filepath, 'w') as f:
        f.write(content)

replace_radius('photobooth-server/frontend/src/views/EventListView.vue')
replace_radius('photobooth-server/frontend/src/components/ui/AppTopNav.vue')

print("Updated pill rounding everywhere.")
