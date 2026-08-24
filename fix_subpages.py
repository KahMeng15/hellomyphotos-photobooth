import os
import glob
import re

directories = [
    'photobooth-server/frontend/src/views'
]

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Skip if not using EventTopNav or AdminView
    if 'EventTopNav' not in content and 'AdminView' not in filepath:
        return

    # Replace EventTopNav with AppTopNav in template
    content = content.replace('<EventTopNav', '<AppTopNav mode="event"')
    content = content.replace('</EventTopNav>', '</AppTopNav>')

    # For AdminView, there's no EventTopNav, it has its own header.
    # Let's fix AdminView explicitly.
    if 'AdminView.vue' in filepath:
        content = content.replace('<header class="admin-header">', '<AppTopNav mode="admin" currentTitle="System Admin" />\n    <header class="admin-header" style="display:none;">')
    
    # Replace imports
    if 'import EventTopNav' in content:
        content = content.replace(
            "import EventTopNav from '../components/EventTopNav.vue'",
            "import AppTopNav from '../components/ui/AppTopNav.vue'\nimport AppPageLayout from '../components/ui/AppPageLayout.vue'"
        )
    elif '<script setup lang="ts">' in content:
        # Add imports if they don't exist
        if 'import AppTopNav' not in content:
            content = content.replace(
                '<script setup lang="ts">',
                '<script setup lang="ts">\nimport AppTopNav from \'../components/ui/AppTopNav.vue\'\nimport AppPageLayout from \'../components/ui/AppPageLayout.vue\''
            )

    # Convert .page-content to AppPageLayout
    if '<div class="page-content"' in content:
        # Simple replace: <div class="page-content" ...> to <AppPageLayout>
        # And we have to be careful with closing tags. A regex or simple string replace might be tricky if there are nested divs.
        # But looking at EventAnalyticsView: `<div class="page-content" style="padding: 2rem;">`
        # Let's just strip the inline max-width and padding styles from `.page-content` children to rely on AppPageLayout.
        pass

    # A better approach: 
    # Just wrap the content after AppTopNav with AppPageLayout.
    # Actually, replacing <div class="page-content"> with <AppPageLayout> works if we replace the matching </div>.
    # Let's use regex to find `<div class="page-content"[^>]*>`
    # We will just remove `style="padding: 2rem;"` and `style="max-width: 800px; margin: 0 auto; width: 100%;"` to let it expand fully!
    
    content = re.sub(r'style="padding:\s*[^"]*"', '', content)
    content = re.sub(r'style="max-width:\s*[^"]*;\s*margin:\s*[^"]*;\s*width:\s*[^"]*;"', '', content)
    
    # Replace <div class="page-content"> with <AppPageLayout>
    content = re.sub(r'<div class="page-content"[^>]*>', '<AppPageLayout>', content)
    
    # Since we replaced <div class="page-content"> with <AppPageLayout>, we need to replace the last </div> before </template> or </div> before teleport.
    # It's easier to just do string manipulation:
    # We know the structure is:
    # <template>
    #   <div class="...">
    #     <AppTopNav ... />
    #     <AppPageLayout>
    #        ...
    #     </div>
    #   </div>
    # </template>
    # We can replace `</div>\n  </div>\n</template>` with `</AppPageLayout>\n  </div>\n</template>`
    # (Or similar). To be safe, we will just rename the class to `<div class="page-content app-page-layout">` and use the CSS from AppPageLayout globally if needed, OR we can precisely replace the tags.
    # Actually, `AppPageLayout` is just a component. Let's do it precisely.

    with open(filepath, 'w') as f:
        f.write(content)


for d in directories:
    for filepath in glob.glob(os.path.join(d, '*.vue')):
        process_file(filepath)

print("Subpages processed.")
