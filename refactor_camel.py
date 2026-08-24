import os
import glob

REPLACEMENTS = [
    ("borderRadius: '9999px'", "borderRadius: 'var(--radius-pill)'"),
    ("borderRadius: '100px'", "borderRadius: 'var(--radius-pill)'"),
    ("borderRadius: '16px'", "borderRadius: 'var(--radius-xl)'"),
    ("borderRadius: '12px'", "borderRadius: 'var(--radius-lg)'"),
    ("borderRadius: '8px'", "borderRadius: 'var(--radius-md)'"),
    ("borderRadius: '6px'", "borderRadius: 'var(--radius-sm)'"),
    ("borderRadius: '4px'", "borderRadius: 'var(--radius-sm)'"),
    ("borderRadius: '50%'", "borderRadius: 'var(--radius-full)'"),
    ("background: '#000'", "background: 'var(--color-bg)'"),
    ("background: '#0f0f0f'", "background: 'var(--color-bg)'"),
    ("background: '#111'", "background: 'var(--color-surface)'"),
    ("background: '#222'", "background: 'var(--color-surface-alt)'"),
    ("background: '#fff'", "background: 'var(--color-text)'"),
    ("color: '#fff'", "color: 'var(--color-text)'"),
    ("color: '#000'", "color: 'var(--color-bg)'"),
    ("color: '#ccc'", "color: 'var(--color-text-sub)'"),
    ("color: '#888'", "color: 'var(--color-text-sub)'"),
    ("color: '#666'", "color: 'var(--color-text-muted)'"),
    ("color: '#555'", "color: 'var(--color-text-muted)'"),
]

components_dir = 'photobooth-client/src/renderer/components'
for filepath in glob.glob(os.path.join(components_dir, '*.ts')):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in REPLACEMENTS:
        content = content.replace(old, new)
        
    with open(filepath, 'w') as f:
        f.write(content)

print("CamelCase properties replaced.")
