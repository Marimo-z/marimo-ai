<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <header class="page-header">
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-description">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="page-actions"><slot /></div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 4px;
}

.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 650;
  letter-spacing: 0.03em;
}

.page-description {
  max-width: 62ch;
  margin: 8px 0 0;
  line-height: 1.6;
  color: var(--mo-text-secondary);
}

.page-actions {
  display: flex;
  gap: 8px;
}
</style>
