with open('photobooth-server/frontend/src/components/FrameEditor.vue', 'r') as f:
    content = f.read()

content = content.replace('class="number-input" class="content-input"', 'class="number-input content-input"')
content = content.replace('class="number-input" class="color-picker"', 'class="number-input color-picker"')
# any other duplicate classes?
content = content.replace('class="number-input"', 'class="number-input"')

with open('photobooth-server/frontend/src/components/FrameEditor.vue', 'w') as f:
    f.write(content)
