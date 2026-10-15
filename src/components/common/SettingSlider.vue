<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: number
    min: number
    max: number
    step?: number
    disabled?: boolean
    showStops?: boolean
    marks?: Record<number, string>
    format?: (value: number) => string
  }>(),
  {
    step: 1,
    disabled: false,
    showStops: false,
    marks: () => ({}),
    format: (value: number) => String(value)
  }
)

const emit = defineEmits<{
  commit: [value: number]
}>()

const local = ref(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    if (value !== local.value) local.value = value
  }
)

function asNumber(value: number | number[]): number | null {
  const next = Array.isArray(value) ? value[0] : value
  return typeof next === 'number' ? next : null
}

function onChange(value: number | number[]): void {
  const next = asNumber(value)
  if (next === null) return
  local.value = next
  emit('commit', next)
}
</script>

<template>
  <div class="slider-field" :class="{ 'has-marks': marks && Object.keys(marks).length > 0 }">
    <div class="slider-head">
      <span class="slider-label">{{ label }}</span>
      <span class="slider-value">{{ format(local) }}</span>
    </div>
    <el-slider
      v-model="local"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :show-stops="showStops"
      :marks="marks"
      :format-tooltip="format"
      @change="onChange"
    />
  </div>
</template>

<style scoped>
.slider-field {
  width: 100%;
}

.slider-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}

.slider-label {
  font-weight: 650;
}

.slider-value {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--mo-accent);
}

.has-marks {
  padding-bottom: 16px;
}
</style>
