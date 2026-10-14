<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useIdleFloat } from '../../composables/useIdleFloat'
import type { PetAppearance } from '../../utils/pet-appearance'
import type { Vec2 } from '../../utils/eye-tracking'
import PetEyes from './PetEyes.vue'

// Gesture listeners are forwarded to the <svg> hit area, not the wrapper.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  appearance: PetAppearance
  /** Eye offset in CSS px. */
  eyeOffset: Vec2
  blinking: boolean
  /** Incremented on every tap to play the squish feedback. */
  pressTick: number
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

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const lift = useIdleFloat(computed(() => props.appearance.motion === 'float' && !reducedMotion))
const floatStyle = computed(() =>
  lift.value ? { transform: `translateY(${(-lift.value * props.size * 0.045).toFixed(2)}px)` } : {}
)
const shadowStyle = computed(() =>
  lift.value
    ? { transform: `scaleX(${1 - lift.value * 0.15})`, opacity: String(1 - lift.value * 0.3) }
    : {}
)

const pressEl = ref<HTMLElement | null>(null)
watch(
  () => props.pressTick,
  () => {
    pressEl.value?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.08, 0.9)' },
        { transform: 'scale(0.96, 1.04)' },
        { transform: 'scale(1, 1)' }
      ],
      { duration: 360, easing: 'ease-out' }
    )
  }
)
</script>

<template>
  <div class="orb" :class="`motion-${appearance.motion}`" :style="{ '--orb-size': `${size}px` }">
    <div class="orb-shadow" :style="shadowStyle" />
    <div class="orb-float" :style="floatStyle">
      <div ref="pressEl" class="orb-press">
        <div class="orb-pose">
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
        </div>
      </div>
    </div>
    <div v-if="appearance.expression === 'thinking'" class="thinking-dots" aria-hidden="true">
      <span /><span /><span />
    </div>
  </div>
</template>

<style scoped>
.orb {
  position: relative;
  width: var(--orb-size);
  height: var(--orb-size);
}

.orb-svg {
  display: block;
  overflow: visible;
  pointer-events: none;
  cursor: grab;
}

.orb-svg .hit {
  pointer-events: visiblePainted;
}

.motion-drag .orb-svg {
  cursor: grabbing;
}

.orb-float,
.orb-press,
.orb-pose {
  width: 100%;
  height: 100%;
  transform-origin: 50% 100%;
}

.orb-pose {
  transition: transform 200ms ease;
}

/* Own compositing layers: the float only moves them instead of re-rastering the SVG. */
.orb-float,
.orb-shadow {
  will-change: transform;
}

.orb-shadow {
  position: absolute;
  left: 20%;
  bottom: calc(var(--orb-size) * -0.1);
  width: 60%;
  height: calc(var(--orb-size) * 0.1);
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(28, 38, 78, 0.35), rgba(28, 38, 78, 0));
}

.motion-talk .orb-float {
  animation: talk 0.34s ease-in-out infinite alternate;
}

.motion-drag .orb-pose {
  transform: scale(0.94) rotate(-5deg);
}

.motion-play .orb-pose {
  animation: play-sway 1.6s ease-in-out infinite alternate;
}

@keyframes talk {
  from {
    transform: scale(1, 1);
  }
  to {
    transform: scale(1.025, 0.97);
  }
}

@keyframes play-sway {
  from {
    transform: rotate(-4deg) translateY(1px);
  }
  to {
    transform: rotate(4deg) translateY(-2px);
  }
}

.thinking-dots {
  position: absolute;
  top: 2%;
  right: -6%;
  display: flex;
  gap: calc(var(--orb-size) * 0.03);
}

.thinking-dots span {
  width: calc(var(--orb-size) * 0.055);
  height: calc(var(--orb-size) * 0.055);
  border-radius: 50%;
  background: #4f68b0;
  opacity: 0.25;
  animation: dot 1.2s ease-in-out infinite;
}
.thinking-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.thinking-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot {
  0%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 0.9;
  }
}

@media (prefers-reduced-motion: reduce) {
  .orb-float,
  .thinking-dots span {
    animation: none !important;
  }
}
</style>
