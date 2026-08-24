<template>
  <div class="app-page-layout">
    <slot></slot>
  </div>
</template>

<style scoped>
.app-page-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-6);
  width: 100%;
  box-sizing: border-box;
}

/* Ensure child content doesn't overflow */
.app-page-layout > * {
  max-width: 100%;
}
</style>
