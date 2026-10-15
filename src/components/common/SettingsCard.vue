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
  position: relative;
  padding: 22px 24px 20px;
  border: 1px solid var(--mo-border);
  border-radius: var(--mo-radius);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.46), transparent 38%),
    var(--mo-bg-card);
  box-shadow: var(--mo-shadow);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.card-title::before {
  content: '';
  flex: none;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--mo-ring);
  border-radius: 50%;
  box-shadow: inset -5px 0 0 var(--mo-accent);
}

.card-description {
  max-width: 62ch;
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mo-text-secondary);
}

.card-extra {
  flex: none;
}
</style>
