<script setup lang="ts">
import { computed, useId } from 'vue'
import type { PetAppearance } from '../../utils/pet-appearance'
import type { Vec2 } from '../../utils/eye-tracking'
import PetEyes from './PetEyes.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  appearance: PetAppearance
  eyeOffset: Vec2
  blinking: boolean
  size: number
}>()

const uid = useId()
const VIEW = { min: 80, size: 864 }
const unitsPerPx = computed(() => VIEW.size / props.size)
const eyeOffsetUnits = computed(() => ({
  x: props.eyeOffset.x * unitsPerPx.value,
  y: props.eyeOffset.y * unitsPerPx.value
}))
const calm = computed(() => props.appearance.motion === 'still')

const STARS = [
  { cx: 150, cy: 170, r: 3.2 },
  { cx: 860, cy: 210, r: 2.4 },
  { cx: 200, cy: 800, r: 2.2 },
  { cx: 880, cy: 760, r: 3 },
  { cx: 512, cy: 130, r: 2 }
] as const
</script>

<template>
  <svg
    class="planet-svg"
    :class="{ 'is-calm': calm }"
    data-interactive
    :viewBox="`${VIEW.min} ${VIEW.min} ${VIEW.size} ${VIEW.size}`"
    :width="size"
    :height="size"
    v-bind="$attrs"
  >
    <defs>
      <radialGradient :id="`${uid}-body`" cx="0.34" cy="0.32" r="0.75">
        <stop offset="0" stop-color="#d9fff6" />
        <stop offset="0.28" stop-color="#7ec9b8" />
        <stop offset="0.62" stop-color="#2f6f86" />
        <stop offset="1" stop-color="#16324c" />
      </radialGradient>
      <radialGradient :id="`${uid}-night`" cx="0.78" cy="0.55" r="0.6">
        <stop offset="0" stop-color="#07111c" stop-opacity="0.55" />
        <stop offset="1" stop-color="#07111c" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="`${uid}-ring`" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#f8edd2" />
        <stop offset="0.45" stop-color="#e4c48a" />
        <stop offset="1" stop-color="#b58345" />
      </linearGradient>
      <linearGradient :id="`${uid}-spec`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.7" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
      <clipPath :id="`${uid}-back`">
        <rect x="0" y="0" width="1024" height="512" />
      </clipPath>
      <clipPath :id="`${uid}-front`">
        <rect x="0" y="512" width="1024" height="512" />
      </clipPath>
    </defs>

    <g class="sky" aria-hidden="true">
      <circle
        v-for="(star, index) in STARS"
        :key="index"
        class="star"
        :cx="star.cx"
        :cy="star.cy"
        :r="star.r"
        :style="{ animationDelay: `${index * 0.35}s` }"
      />
    </g>

    <g class="ring" :transform="`rotate(-18 512 512)`">
      <ellipse
        class="ring-glow"
        cx="512"
        cy="512"
        rx="378"
        ry="104"
        :stroke="`url(#${uid}-ring)`"
      />
      <ellipse
        class="ring-stroke outer"
        cx="512"
        cy="512"
        rx="372"
        ry="98"
        :stroke="`url(#${uid}-ring)`"
        :clip-path="`url(#${uid}-back)`"
      />
      <ellipse
        class="ring-stroke inner"
        cx="512"
        cy="512"
        rx="308"
        ry="72"
        :stroke="`url(#${uid}-ring)`"
        :clip-path="`url(#${uid}-back)`"
      />
    </g>

    <g class="orbit orbit-moon">
      <g class="rider" transform="translate(812 512)">
        <circle r="28" fill="#f6f1e6" />
        <circle cx="-8" cy="-6" r="7" fill="#e4dccb" />
        <circle cx="6" cy="8" r="4" fill="#efe7d6" />
      </g>
    </g>

    <circle class="hit" cx="512" cy="512" r="228" :fill="`url(#${uid}-body)`" />
    <ellipse cx="430" cy="470" rx="70" ry="36" fill="#1d5560" opacity="0.35" />
    <ellipse
      cx="560"
      cy="560"
      rx="90"
      ry="28"
      transform="rotate(-18 560 560)"
      fill="#17485a"
      opacity="0.4"
    />
    <circle cx="512" cy="512" r="228" :fill="`url(#${uid}-night)`" />
    <ellipse
      cx="400"
      cy="360"
      rx="78"
      ry="40"
      transform="rotate(-32 400 360)"
      :fill="`url(#${uid}-spec)`"
    />
    <g transform="translate(512 512) scale(0.54) translate(-512 -512)">
      <PetEyes
        :expression="appearance.expression"
        :offset="eyeOffsetUnits"
        :blinking="blinking"
        :dragging="appearance.motion === 'drag'"
      />
    </g>

    <g class="ring" transform="rotate(-18 512 512)">
      <ellipse
        class="ring-stroke outer"
        cx="512"
        cy="512"
        rx="372"
        ry="98"
        :stroke="`url(#${uid}-ring)`"
        :clip-path="`url(#${uid}-front)`"
      />
      <ellipse
        class="ring-stroke inner"
        cx="512"
        cy="512"
        rx="308"
        ry="72"
        :stroke="`url(#${uid}-ring)`"
        :clip-path="`url(#${uid}-front)`"
      />
    </g>

    <g class="orbit orbit-probe">
      <g class="rider" transform="translate(250 512)">
        <rect class="panel" x="-22" y="-6" width="16" height="12" rx="2" />
        <rect class="body" x="-6" y="-5" width="14" height="10" rx="2" />
        <rect class="panel" x="8" y="-6" width="16" height="12" rx="2" />
        <circle cx="1" cy="0" r="2.2" fill="#e07a3d" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.planet-svg {
  display: block;
  overflow: visible;
  pointer-events: none;
  cursor: grab;
}

.planet-svg .hit {
  pointer-events: visiblePainted;
}

:global(.motion-drag) .planet-svg {
  cursor: grabbing;
}

.star {
  fill: #f7f3ea;
  opacity: 0.35;
  animation: twinkle 2.8s ease-in-out infinite;
}

.ring-glow {
  fill: none;
  stroke-width: 26;
  opacity: 0.22;
}

.ring-stroke {
  fill: none;
  stroke-linecap: round;
  animation: ring-flow 9s linear infinite;
}

.ring-stroke.outer {
  stroke-width: 16;
  stroke-dasharray: 22 16;
}

.ring-stroke.inner {
  stroke-width: 8;
  stroke-dasharray: 10 14;
  animation-duration: 6s;
  animation-direction: reverse;
  opacity: 0.85;
}

.orbit {
  transform-origin: 512px 512px;
  pointer-events: none;
  animation: spin 12s linear infinite;
}

.orbit-probe {
  animation-duration: 8s;
  animation-direction: reverse;
}

.rider {
  transform-origin: 0 0;
  animation: spin 12s linear infinite reverse;
}

.orbit-probe .rider {
  animation-duration: 8s;
  animation-direction: normal;
}

.panel {
  fill: #d5e2ea;
}

.body {
  fill: #f4f7f8;
}

.is-calm .ring-stroke,
.is-calm .orbit,
.is-calm .rider,
.is-calm .star {
  animation: none;
}

@keyframes ring-flow {
  to {
    stroke-dashoffset: -228;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 0.95;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ring-stroke,
  .orbit,
  .rider,
  .star {
    animation: none;
  }
}
</style>
