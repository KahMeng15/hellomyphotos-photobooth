import os
import glob

# Mapping of old values to new CSS variables
REPLACEMENTS = [
    ('#0f0f0f', 'var(--color-bg)'),
    ('#111', 'var(--color-surface)'),
    ('#1a1a1a', 'var(--color-surface-alt)'),
    ('#191919', 'var(--color-surface-alt)'),
    ('#222', 'var(--color-surface-alt)'),
    ('#2a2a2a', 'var(--color-border)'),
    ('#333', 'var(--color-border)'),
    ('#3a1a1a', 'var(--color-border)'),
    ('#000', 'var(--color-bg)'),
    ('#fff', 'var(--color-text)'),
    ('#ccc', 'var(--color-text-sub)'),
    ('#888', 'var(--color-text-sub)'),
    ('#666', 'var(--color-text-muted)'),
    ('#555', 'var(--color-text-muted)'),
    ('#444', 'var(--color-text-muted)'),
    ('#f44336', 'var(--color-error)'),
    ('#ff4444', 'var(--color-error)'),
    ('#ef4444', 'var(--color-error)'),
    ('#d32f2f', 'var(--color-error)'),
    ('#4caf50', 'var(--color-success)'),
    ('#4CAF50', 'var(--color-success)'),
    ('#22c55e', 'var(--color-success)'),
    ('#2196F3', 'var(--color-info)'),
    ('#fbbf24', 'var(--color-warning)'),
    ('border-radius: 9999px', 'border-radius: var(--radius-pill)'),
    ('border-radius: 100px', 'border-radius: var(--radius-pill)'),
    ('border-radius: 16px', 'border-radius: var(--radius-xl)'),
    ('border-radius: 12px', 'border-radius: var(--radius-lg)'),
    ('border-radius: 8px', 'border-radius: var(--radius-md)'),
    ('border-radius: 6px', 'border-radius: var(--radius-sm)'),
    ('border-radius: 4px', 'border-radius: var(--radius-sm)'),
    ('border-radius: 50%', 'border-radius: var(--radius-full)'),
    ('background: rgba(220, 38, 38, 0.1)', 'background: color-mix(in srgb, var(--color-error) 10%, transparent)'),
    ('border: 1px solid rgba(220, 38, 38, 0.3)', 'border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent)'),
    ('#fca5a5', 'var(--color-error)'),
]

components_dir = 'photobooth-client/src/renderer/components'
for filepath in glob.glob(os.path.join(components_dir, '*.ts')):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in REPLACEMENTS:
        # Note: simplistic string replacement, works for our specific hex codes
        content = content.replace(old, new)
        
    with open(filepath, 'w') as f:
        f.write(content)

print("Colors and radii replaced.")
