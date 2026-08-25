import re

filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Remove v-if="connected" from the cards
content = content.replace('<section class="card" v-if="connected">', '<section class="card">')

# 2. Add :disabled to Pause toggle buttons
pause_btn1 = """<button :class="['focus-btn', paused ? 'focus-active' : '']" @click="togglePause(true)">PAUSE</button>"""
pause_btn1_new = """<button :class="['focus-btn', paused ? 'focus-active' : '']" @click="togglePause(true)" :disabled="!connected">PAUSE</button>"""
content = content.replace(pause_btn1, pause_btn1_new)

pause_btn2 = """<button :class="['focus-btn', !paused ? 'focus-active' : '']" @click="togglePause(false)">RESUME</button>"""
pause_btn2_new = """<button :class="['focus-btn', !paused ? 'focus-active' : '']" @click="togglePause(false)" :disabled="!connected">RESUME</button>"""
content = content.replace(pause_btn2, pause_btn2_new)

# 3. Add :disabled to Retake button
retake_btn = """<button class="app-btn app-btn--secondary" @click="triggerReshot">Retake</button>"""
retake_btn_new = """<button class="app-btn app-btn--secondary" @click="triggerReshot" :disabled="!connected">Retake</button>"""
content = content.replace(retake_btn, retake_btn_new)

# 4. Add :disabled to Frame Override select
select_box = """<select v-model="selectedFrame" @change="sendFrameOverride" class="custom-select">"""
select_box_new = """<select v-model="selectedFrame" @change="sendFrameOverride" class="custom-select" :disabled="!connected">"""
content = content.replace(select_box, select_box_new)

with open(filepath, 'w') as f:
    f.write(content)
