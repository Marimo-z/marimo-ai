<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <section class="card">
    <header class="card-header">
      <div>
        <h2 class="card-title">{{ title }}</h2>
        <p v-if="description" class="card-description">{{ description }}</p>
      </div>
      <div v-if="$slots.extra" class="card-extra"><slot name="extra" /></div>
    </header>
    <div class="card-body"><slot /></div>
  </section>
</template>

<style scoped>
.card {
  padding: 20px 22px;
  border: 1px solid var(--mo-border);
  border-radius: var(--mo-radius);
  background: var(--mo-bg-card);
  box-shadow: var(--mo-shadow);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.card-description {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--mo-text-secondary);
}

.card-extra {
  flex: none;
}
</style>
