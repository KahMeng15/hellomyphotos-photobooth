import re

filepath = 'photobooth-server/frontend/src/components/EventControlPanel.vue'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Merge Stats Card into Status Card
status_card_end = """      <div v-if="!connected && event.otp" class="otp-box">
        <p class="card-desc">Enter OTP in booth app:</p>
        <div class="otp-code-row">
          <span class="otp-code">{{ event.otp }}</span>
          <button @click="copyOtp" class="app-btn app-btn--secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">{{ otpCopied ? 'Copied' : 'Copy' }}</button>
        </div>
      </div>
    </section>"""

new_status_card_end = """      <div v-if="!connected && event.otp" class="otp-box" style="margin-bottom: 1rem;">
        <p class="card-desc">Enter OTP in booth app:</p>
        <div class="otp-code-row">
          <span class="otp-code">{{ event.otp }}</span>
          <button @click="copyOtp" class="app-btn app-btn--secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">{{ otpCopied ? 'Copied' : 'Copy' }}</button>
        </div>
      </div>

      <div class="stats-grid" v-if="totalSessions !== undefined" :style="{ marginTop: (!connected && event.otp) ? '0' : '1rem' }">
        <div class="stat-card">
          <span class="stat-value">{{ totalSessions }}</span>
          <span class="stat-label">Sessions</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ totalPhotos }}</span>
          <span class="stat-label">Photos</span>
        </div>
      </div>
    </section>"""
content = content.replace(status_card_end, new_status_card_end)

# 2. Remove the old Stats Card
stats_card_regex = r"<!-- Stats Card -->\s*<section class=\"card\" v-if=\"totalSessions !== undefined\">\s*<div class=\"stats-grid\">\s*<div class=\"stat-card\">\s*<span class=\"stat-value\">\{\{ totalSessions \}\}</span>\s*<span class=\"stat-label\">Sessions</span>\s*</div>\s*<div class=\"stat-card\">\s*<span class=\"stat-value\">\{\{ totalPhotos \}\}</span>\s*<span class=\"stat-label\">Photos</span>\s*</div>\s*</div>\s*</section>"
content = re.sub(stats_card_regex, "", content, flags=re.MULTILINE)

# 3. Remove Frame Override Card
frame_card_regex = r"<!-- Frame Override Card -->\s*<section class=\"card\">\s*<h2>Frame Override</h2>\s*<div class=\"settings-box control-box\" style=\"padding: 0\.5rem 0\.75rem;\">\s*<select v-model=\"selectedFrame\" @change=\"sendFrameOverride\" class=\"custom-select\" :disabled=\"!connected\">\s*<option value=\"\">No Override</option>\s*<option v-for=\"f in photosStore\.frames\" :key=\"f\.id\" :value=\"f\.id\">\{\{ f\.name \}\}</option>\s*</select>\s*</div>\s*</section>"
content = re.sub(frame_card_regex, "", content, flags=re.MULTILINE)

# 4. Remove selectedFrame and sendFrameOverride from script
script_frame_ref_regex = r"const selectedFrame = ref\(''\)\n"
content = re.sub(script_frame_ref_regex, "", content)

script_frame_fn_regex = r"function sendFrameOverride\(\) \{\s*props\.sendMessage\('frame-override', \{ eventId: props\.eventId, frameId: selectedFrame\.value \}\)\s*\}"
content = re.sub(script_frame_fn_regex, "", content)

with open(filepath, 'w') as f:
    f.write(content)
