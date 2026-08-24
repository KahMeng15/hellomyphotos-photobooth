import re

with open('photobooth-server/frontend/src/components/FrameEditor.vue', 'r') as f:
    content = f.read()

# Replace AppModal
modal_regex = re.compile(r'<div v-if="showExitModal" class="modal-overlay">.*?<div class="modal">\s*<h3>(.*?)</h3>\s*<p>(.*?)</p>\s*<div class="modal-actions">(.*?)</div>\s*</div>\s*</div>', re.DOTALL)
def modal_repl(m):
    title = m.group(1)
    body = m.group(2)
    actions = m.group(3)
    return f'''<AppModal v-model="showExitModal" title="{title}">
      <p>{body}</p>
      <template #footer>
        {actions.strip()}
      </template>
    </AppModal>'''
content = modal_regex.sub(modal_repl, content)

# Remove Modal Styles
content = re.sub(r'\.modal-overlay \{.*?\}\s*', '', content, flags=re.DOTALL)
content = re.sub(r'\.modal \{.*?\}\s*', '', content, flags=re.DOTALL)
content = re.sub(r'\.modal h3 \{.*?\}\s*', '', content, flags=re.DOTALL)
content = re.sub(r'\.modal p \{.*?\}\s*', '', content, flags=re.DOTALL)
content = re.sub(r'\.modal-actions \{.*?\}\s*', '', content, flags=re.DOTALL)

# Button Replacements
content = content.replace('<button @click="requestClose" class="btn-icon-nav"', '<AppButton variant="ghost" @click="requestClose"')
content = content.replace('</button>', '</AppButton>')
content = content.replace('<button', '<AppButton')

content = content.replace('class="btn-primary"', 'variant="primary"')
content = content.replace('class="btn-secondary"', 'variant="secondary"')
content = content.replace('class="btn-danger"', 'variant="danger"')
content = content.replace('class="btn-secondary btn-sm"', 'variant="secondary" size="sm"')
content = content.replace('class="btn-icon"', 'variant="ghost" size="sm"')
content = content.replace('class="btn-icon btn-danger-icon"', 'variant="danger" size="sm"')

# Imports
import_str = """import AppButton from './ui/AppButton.vue'
import AppModal from './ui/AppModal.vue'
import AppInput from './ui/AppInput.vue'"""
content = content.replace("import { toast } from 'vue3-toastify'", "import { toast } from 'vue3-toastify'\n" + import_str)

# Inline Styles
# style="margin-top: 0.5rem; margin-bottom: 0.5rem;" -> class="input-grid-wrapper"
content = content.replace('class="input-grid" style="margin-top: 0.5rem; margin-bottom: 0.5rem;"', 'class="input-grid input-grid-wrapper"')
# style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;" -> class="section-header"
content = content.replace('style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;"', 'class="section-header"')
# style="margin: 0;"
content = content.replace('style="margin: 0;"', 'class="section-title"')
# style="margin-right: 0.5rem;" -> class="mr-2"
content = content.replace('style="margin-right: 0.5rem;"', 'class="mr-2"')
# style="margin-left: 0.5rem;" -> class="ml-2"
content = content.replace('style="margin-left: 0.5rem;"', 'class="ml-2"')

# Other inline styles
content = content.replace('style="display: flex; align-items: center; width: 100%;"', 'class="ph-title-wrapper"')
content = content.replace('style="flex: 1; min-width: 0; background: transparent; color: white; border: none; border-bottom: 1px solid var(--color-border); font-size: 1.1rem; padding: 2px 0;"', 'class="ph-title-input"')
content = content.replace('style="display:block; margin-bottom: 0.5rem; color:var(--color-text); font-size: var(--text-sm);"', 'class="content-label"')
content = content.replace('style="width:100%; margin-top:0.25rem;"', 'class="content-input"')
content = content.replace('style="padding:0; height: 32px;"', 'class="color-picker"')

content = content.replace('style="display: flex; align-items: center; width: 100%; margin-right: 0.5rem;"', 'class="ph-title-wrapper mr-2"')

css_additions = """
.input-grid-wrapper { margin-top: 0.5rem; margin-bottom: 0.5rem; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.section-title { margin: 0; }
.mr-2 { margin-right: 0.5rem; }
.ml-2 { margin-left: 0.5rem; }
.ph-title-wrapper { display: flex; align-items: center; width: 100%; }
.ph-title-input { flex: 1; min-width: 0; background: transparent; color: white; border: none; border-bottom: 1px solid var(--color-border); font-size: 1.1rem; padding: 2px 0; }
.content-label { display: block; margin-bottom: 0.5rem; color: var(--color-text); font-size: var(--text-sm); }
.content-input { width: 100%; margin-top: 0.25rem; }
.color-picker { padding: 0; height: 32px; }
"""
content = content.replace('</style>', css_additions + '\n</style>')

with open('photobooth-server/frontend/src/components/FrameEditor.vue', 'w') as f:
    f.write(content)
