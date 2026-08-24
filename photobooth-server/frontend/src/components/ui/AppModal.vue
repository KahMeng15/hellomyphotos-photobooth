<template>
  <Teleport to="body">
    <div v-if="modelValue" class="app-modal-overlay" @click.self="$emit('update:modelValue', false)">
      <div class="app-modal" :class="`app-modal--${size}`">
        <div class="app-modal__header">
          <slot name="header">
            <h2>{{ title }}</h2>
          </slot>
          <button class="app-modal-close" @click="$emit('update:modelValue', false)">✕</button>
        </div>
        <div class="app-modal__body"><slot /></div>
        <div v-if="$slots.footer" class="app-modal__footer"><slot name="footer" /></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg'
}>(), {
  title: '',
  size: 'md'
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.app-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.app-modal__header h2 { margin: 0; font-size: var(--text-lg); font-weight: 600; }
.app-modal-close {
  background: transparent;
  border: none;
  color: var(--color-text-sub);
  font-size: var(--text-xl);
  cursor: pointer;
}
.app-modal-close:hover { color: var(--color-text); }
.app-modal__body { padding: var(--space-4); max-height: 70vh; overflow-y: auto; }
.app-modal__footer { padding: var(--space-4); border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: var(--space-2); }
</style>
