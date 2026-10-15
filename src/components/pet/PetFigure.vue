<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PetSkin } from '../../../shared/pet'
import { useIdleFloat } from '../../composables/useIdleFloat'
import type { PetAppearance } from '../../utils/pet-appearance'
import type { Vec2 } from '../../utils/eye-tracking'
import PetOrb from './PetOrb.vue'
import PetPlanet from './PetPlanet.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  skin: PetSkin
  appearance: PetAppearance
  eyeOffset: Vec2
  blinking: boolean
  pressTick: number
  size: number
}>()

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

const body = computed(() => (props.skin === 'planet' ? PetPlanet : PetOrb))
</script>

<template>
  <div
    class="orb"
    :class="[`motion-${appearance.motion}`, `skin-${skin}`]"
    :style="{ '--orb-size': `${size}px` }"
  >
    <div class="orb-shadow" :style="shadowStyle" />
    <div class="orb-float" :style="floatStyle">
      <div ref="pressEl" class="orb-press">
        <div class="orb-pose">
          <component
            :is="body"
            :appearance="appearance"
            :eye-offset="eyeOffset"
            :blinking="blinking"
            :size="size"
            v-bind="$attrs"
          />
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

.skin-planet .thinking-dots span {
  background: #e7d3a1;
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
