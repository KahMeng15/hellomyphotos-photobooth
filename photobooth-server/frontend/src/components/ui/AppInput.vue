<template>
  <div class="app-form-field">
    <label v-if="label" :for="id">{{ label }}</label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      v-bind="$attrs"
    />
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{
  modelValue: string | number
  label?: string
  type?: string
  id?: string
}>(), {
  type: 'text'
})

defineEmits(['update:modelValue'])
</script>
