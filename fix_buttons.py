import os

def update_settings_view():
    filepath = 'photobooth-server/frontend/src/views/SettingsView.vue'
    with open(filepath, 'r') as f:
        content = f.read()

    # Import AppButton
    if 'import AppButton' not in content:
        content = content.replace("import { ref, computed, onMounted } from 'vue'", "import { ref, computed, onMounted } from 'vue'\nimport AppButton from '../components/ui/AppButton.vue'")

    # Replace tags
    content = content.replace('<button @click="saveAndClose" class="btn-primary">Save</button>', '<AppButton variant="primary" @click="saveAndClose">Save</AppButton>')
    content = content.replace('<button @click="cancelChanges" class="btn-cancel">Cancel</button>', '<AppButton variant="secondary" @click="cancelChanges">Cancel</AppButton>')

    with open(filepath, 'w') as f:
        f.write(content)


def update_users_view():
    filepath = 'photobooth-server/frontend/src/views/UsersView.vue'
    with open(filepath, 'r') as f:
        content = f.read()

    # Import AppButton
    if 'import AppButton' not in content:
        content = content.replace("import { useAuthStore } from '../stores/auth'", "import { useAuthStore } from '../stores/auth'\nimport AppButton from '../components/ui/AppButton.vue'")

    # Replace tags
    content = content.replace('<button @click="showAddModal = true" class="btn-primary">Add User</button>', '<AppButton variant="primary" @click="showAddModal = true">Add User</AppButton>')
    content = content.replace('<button class="btn-secondary" @click="showAddModal = false">Cancel</button>', '<AppButton variant="secondary" @click="showAddModal = false">Cancel</AppButton>')
    
    btn_prim_start = content.find('<button class="btn-primary" @click="addUser"')
    if btn_prim_start != -1:
        btn_prim_end = content.find('</button>', btn_prim_start) + 9
        btn_content = content[btn_prim_start:btn_prim_end]
        new_btn = btn_content.replace('<button class="btn-primary"', '<AppButton variant="primary"').replace('</button>', '</AppButton>')
        content = content[:btn_prim_start] + new_btn + content[btn_prim_end:]

    with open(filepath, 'w') as f:
        f.write(content)

update_settings_view()
update_users_view()
print("Buttons updated to AppButton.")
