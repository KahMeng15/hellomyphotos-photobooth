<template>
  <button
    :class="['app-btn', `app-btn--${variant}`, `app-btn--${size}`]"
    :disabled="disabled"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false
})
</script>

<style scoped>
.app-btn { font-family: var(--font-sans); cursor: pointer; transition: opacity var(--transition-base); display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
.app-btn--primary { background: var(--color-accent); color: var(--color-accent-fg); border: none; border-radius: var(--radius-md); font-weight: 600; }
.app-btn--secondary { background: transparent; color: var(--color-text-sub); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.app-btn--danger { background: color-mix(in srgb, var(--color-error) 10%, transparent); color: var(--color-error); border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent); border-radius: var(--radius-sm); }
.app-btn--ghost { background: transparent; border: none; color: var(--color-text-sub); }
.app-btn--icon { background: transparent; border: none; color: var(--color-text-sub); border-radius: var(--radius-full); }
.app-btn--sm { padding: var(--space-1) var(--space-3); font-size: var(--text-xs); }
.app-btn--md { padding: var(--space-2) var(--space-4); font-size: var(--text-sm); }
.app-btn--lg { padding: var(--space-3) var(--space-6); font-size: var(--text-base); }
.app-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.app-btn:hover:not(:disabled) { opacity: 0.85; }
</style>
