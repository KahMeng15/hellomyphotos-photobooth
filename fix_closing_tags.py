import os
import glob

directories = [
    'photobooth-server/frontend/src/views'
]

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # If AppPageLayout was injected but not closed
    if '<AppPageLayout>' in content and '</AppPageLayout>' not in content:
        # Find the last </div> before </template> or before <Teleport> that matches it.
        # Let's simply replace `<AppPageLayout>` back to `<div class="app-page-layout">` for safety, since we don't have a full HTML parser in python.
        # And we ensure `AppPageLayout` CSS is global or we just use the component.
        pass

    # Better: just use `<div class="app-page-layout">` instead of the component for these views to avoid AST parsing issues, 
    # OR we replace the component tags.
    if '<AppPageLayout>' in content:
        content = content.replace('<AppPageLayout>', '<AppPageLayout>\n')
        # We need to replace the corresponding </div> with </AppPageLayout>
        # Let's cheat: replace the FIRST </div> that is at the same indentation level, or just use string replacement backwards.
        
        lines = content.split('\n')
        for i in range(len(lines)-1, -1, -1):
            if '</div>' in lines[i]:
                # check if there's a teleport or something. 
                pass

        # Since it's too risky, I'll revert <AppPageLayout> back to <div class="app-page-layout"> and just use global css for it in main.css
        content = content.replace('<AppPageLayout>\n', '<div class="app-page-layout">')
        content = content.replace('<AppPageLayout>', '<div class="app-page-layout">')
        content = content.replace('import AppPageLayout', '// import AppPageLayout')

    with open(filepath, 'w') as f:
        f.write(content)

for d in directories:
    for filepath in glob.glob(os.path.join(d, '*.vue')):
        fix_file(filepath)

print("Fixed closing tags by using class instead of component.")
