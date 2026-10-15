<script setup lang="ts">
import { computed, useId } from 'vue'
import type { PetAppearance } from '../../utils/pet-appearance'
import type { Vec2 } from '../../utils/eye-tracking'
import PetEyes from './PetEyes.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  appearance: PetAppearance
  /** Eye offset in CSS px. */
  eyeOffset: Vec2
  blinking: boolean
  size: number
}>()

const uid = useId()
// The viewBox crops logo.svg's 1024 canvas to the circle (r ≈ 427 around 512) plus a small margin.
const VIEW = { min: 80, size: 864 }
const unitsPerPx = computed(() => VIEW.size / props.size)
const eyeOffsetUnits = computed(() => ({
  x: props.eyeOffset.x * unitsPerPx.value,
  y: props.eyeOffset.y * unitsPerPx.value
}))
</script>

<template>
  <svg
    class="orb-svg"
    data-interactive
    :viewBox="`${VIEW.min} ${VIEW.min} ${VIEW.size} ${VIEW.size}`"
    :width="size"
    :height="size"
    v-bind="$attrs"
  >
    <defs>
      <radialGradient :id="`${uid}-body`" cx="0.36" cy="0.3" r="0.78">
        <stop offset="0" stop-color="#a7b8f0" />
        <stop offset="0.35" stop-color="#6b84cf" />
        <stop offset="0.75" stop-color="#4f68b0" />
        <stop offset="1" stop-color="#394e8e" />
      </radialGradient>
      <radialGradient :id="`${uid}-rim`" cx="0.72" cy="0.88" r="0.5">
        <stop offset="0" stop-color="#b9cdff" stop-opacity="0.5" />
        <stop offset="1" stop-color="#b9cdff" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="`${uid}-spec`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.6" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
    </defs>
    <circle class="hit" cx="512" cy="512" r="426.7" :fill="`url(#${uid}-body)`" />
    <circle cx="512" cy="512" r="426.7" :fill="`url(#${uid}-rim)`" />
    <ellipse
      cx="370"
      cy="270"
      rx="130"
      ry="70"
      transform="rotate(-35 370 270)"
      :fill="`url(#${uid}-spec)`"
    />
    <PetEyes
      :expression="appearance.expression"
      :offset="eyeOffsetUnits"
      :blinking="blinking"
      :dragging="appearance.motion === 'drag'"
    />
  </svg>
</template>

<style scoped>
.orb-svg {
  display: block;
  overflow: visible;
  pointer-events: none;
  cursor: grab;
}

.orb-svg .hit {
  pointer-events: visiblePainted;
}

:global(.motion-drag) .orb-svg {
  cursor: grabbing;
}
</style>
