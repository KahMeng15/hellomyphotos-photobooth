import os

filepath = 'photobooth-client/src/renderer/components/Settings.ts'
with open(filepath, 'r') as f:
    content = f.read()

# Add import
import_stmt = "import { createThemeToggle } from '../utils/UIKit.js'\n"
if "createThemeToggle" not in content:
    lines = content.split('\n')
    lines.insert(2, import_stmt)
    content = '\n'.join(lines)

# Add theme toggle to header
target = "header.appendChild(title)"
replacement = """header.appendChild(title)

    const themeToggle = createThemeToggle()
    header.appendChild(themeToggle)"""

if "createThemeToggle()" not in content:
    content = content.replace(target, replacement)

with open(filepath, 'w') as f:
    f.write(content)

print("Theme toggle added.")
