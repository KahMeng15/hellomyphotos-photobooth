import os
import glob

REPLACEMENTS = [
    ('#000', 'var(--color-bg)'),
    ('#0f0f0f', 'var(--color-bg)'),
    ('#111', 'var(--color-surface)'),
    ('#1a1a1a', 'var(--color-surface)'),
    ('#222', 'var(--color-surface-alt)'),
    ('#2a2a2a', 'var(--color-border)'),
    ('#333', 'var(--color-border)'),
    ('#3a1a1a', 'var(--color-border)'),
    ('#444', 'var(--color-border)'),
    ('#555', 'var(--color-text-muted)'),
    ('#666', 'var(--color-text-muted)'),
    ('#888', 'var(--color-text-sub)'),
    ('#999', 'var(--color-text-sub)'),
    ('#aaa', 'var(--color-text-sub)'),
    ('#ccc', 'var(--color-text)'),
    ('#fff', 'var(--color-text)'),
    ('#ffffff', 'var(--color-text)'),
    ('#f44336', 'var(--color-error)'),
    ('#ef4444', 'var(--color-error)'),
    ('color: red', 'color: var(--color-error)'),
    ('#4caf50', 'var(--color-success)'),
    ('#22c55e', 'var(--color-success)'),
    ('#2196F3', 'var(--color-info)'),
    ('border-radius: 4px', 'border-radius: var(--radius-sm)'),
    ('border-radius: 6px', 'border-radius: var(--radius-sm)'),
    ('border-radius: 8px', 'border-radius: var(--radius-md)'),
    ('border-radius: 12px', 'border-radius: var(--radius-lg)'),
    ('border-radius: 16px', 'border-radius: var(--radius-xl)'),
    ('border-radius: 100px', 'border-radius: var(--radius-pill)'),
    ('border-radius: 9999px', 'border-radius: var(--radius-pill)'),
    ('border-radius: 50%', 'border-radius: var(--radius-full)'),
    ('font-size: 0.75rem', 'font-size: var(--text-xs)'),
    ('font-size: 0.8125rem', 'font-size: var(--text-sm)'),
    ('font-size: 0.875rem', 'font-size: var(--text-sm)'),
    ('font-size: 0.9375rem', 'font-size: var(--text-base)'),
    ('font-size: 1rem', 'font-size: var(--text-base)'),
]

directories = [
    'photobooth-server/frontend/src/views',
    'photobooth-server/frontend/src/components'
]

for d in directories:
    for filepath in glob.glob(os.path.join(d, '*.vue')):
        with open(filepath, 'r') as f:
            content = f.read()
        
        for old, new in REPLACEMENTS:
            content = content.replace(old, new)
            
        with open(filepath, 'w') as f:
            f.write(content)

print("Mass replacement complete!")
