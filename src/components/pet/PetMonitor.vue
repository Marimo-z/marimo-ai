<script setup lang="ts">
import type { SystemSample } from '../../../shared/monitor'

defineProps<{
  sample: SystemSample | null
}>()

function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

function width(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '0%'
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`
}
</script>

<template>
  <aside class="meter" data-interactive aria-label="电脑监测">
    <p class="row">
      <span>CPU</span>
      <b>{{ percent(sample?.cpu ?? null) }}</b>
    </p>
    <i class="track"><i class="fill" :style="{ width: width(sample?.cpu ?? null) }" /></i>
    <p class="row">
      <span>GPU</span>
      <b>{{ percent(sample?.gpu ?? null) }}</b>
    </p>
    <i class="track"><i class="fill gpu" :style="{ width: width(sample?.gpu ?? null) }" /></i>
    <p class="row">
      <span>内存</span>
      <b>{{ percent(sample?.memory ?? null) }}</b>
    </p>
    <i class="track"><i class="fill mem" :style="{ width: width(sample?.memory ?? null) }" /></i>
  </aside>
</template>

<style scoped>
.meter {
  width: calc(168px * var(--pet-scale, 1));
  margin-bottom: calc(8px * var(--pet-scale, 1));
  padding: calc(8px * var(--pet-scale, 1)) calc(10px * var(--pet-scale, 1))
    calc(10px * var(--pet-scale, 1));
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: calc(16px * var(--pet-scale, 1));
  background: rgba(255, 252, 248, 0.42);
  backdrop-filter: blur(16px) saturate(1.3);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 8px 20px rgba(20, 30, 60, 0.14);
  color: #1c2744;
}

.row {
  display: flex;
  justify-content: space-between;
  margin: calc(6px * var(--pet-scale, 1)) 0 calc(2px * var(--pet-scale, 1));
  font-size: calc(12px * var(--pet-scale, 1));
  line-height: 1.2;
}

.row:first-child {
  margin-top: 0;
}

.row b {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.track {
  display: block;
  height: calc(4px * var(--pet-scale, 1));
  border-radius: 999px;
  background: rgba(79, 104, 176, 0.16);
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #c6a15a, #4f68b0);
}

.fill.gpu {
  background: linear-gradient(90deg, #7eb6c9, #4f68b0);
}

.fill.mem {
  background: linear-gradient(90deg, #8ea0d4, #3f538d);
}
</style>
