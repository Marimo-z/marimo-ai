<script setup lang="ts">
import { useId } from 'vue'
import type { PetEmotion } from '../../../shared/pet'

defineProps<{
  expression: PetEmotion
  /** Tracking offset in SVG user units. */
  offset: { x: number; y: number }
  blinking: boolean
  dragging: boolean
}>()

const uid = useId()
// Same capsule size and spacing as logo.svg, centred on the face.
const EYES = [
  { side: 'left', cx: 416, cy: 470 },
  { side: 'right', cx: 608, cy: 470 }
] as const
</script>

<template>
  <g
    class="eyes"
    :class="[`is-${expression}`, { 'is-blinking': blinking, 'is-dragging': dragging }]"
    :style="{ transform: `translate(${offset.x}px, ${offset.y}px)` }"
  >
    <defs>
      <linearGradient :id="`${uid}-eye`" x1="0" y1="0" x2="0" y2="1">
        <stop class="stop-top" offset="0" />
        <stop class="stop-bottom" offset="1" />
      </linearGradient>
      <clipPath v-for="eye in EYES" :id="`${uid}-lid-${eye.side}`" :key="eye.side">
        <rect class="lid" :class="eye.side" x="-200" y="-140" width="400" height="400" />
      </clipPath>
    </defs>

    <g v-for="eye in EYES" :key="eye.side" :transform="`translate(${eye.cx} ${eye.cy})`">
      <g class="eye" :class="eye.side">
        <g class="blink">
          <g class="open" :clip-path="`url(#${uid}-lid-${eye.side})`">
            <rect
              class="iris"
              x="-43"
              y="-96"
              width="86"
              height="192"
              rx="43"
              :fill="`url(#${uid}-eye)`"
            />
            <circle class="glint" cx="-12" cy="-52" r="13" />
          </g>
        </g>
        <path class="smile" d="M -58 28 Q 0 -72 58 28" />
      </g>
    </g>
  </g>
</template>

<style scoped>
.eyes {
  pointer-events: auto;
  transition: transform 180ms ease-out;
}

.eye,
.blink,
.lid,
.open,
.smile {
  transform-origin: 0 0;
  transition:
    transform 260ms ease,
    opacity 200ms ease,
    fill 260ms ease;
}

.blink {
  transition-duration: 70ms;
}

.is-blinking .blink {
  transform: scaleY(0.08);
}

.stop-top,
.stop-bottom {
  transition: stop-color 260ms ease;
}
.stop-top {
  stop-color: #ffffff;
}
.stop-bottom {
  stop-color: #d9ecff;
}

.glint {
  fill: #fff;
  opacity: 0.9;
  transition: opacity 200ms ease;
}

.smile {
  fill: none;
  stroke: #f4f9ff;
  stroke-width: 34;
  stroke-linecap: round;
  opacity: 0;
  transform: scaleY(0.4);
}

/* curious: slightly wider eyes */
.is-curious .eye {
  transform: scale(1.08, 1.1);
}

/* happy: closed "^ ^" eyes */
.is-happy .open {
  opacity: 0;
  transform: scaleY(0.3);
}
.is-happy .smile {
  opacity: 1;
  transform: none;
}

/* angry: lids slanting down toward the centre, red tint */
.is-angry .lid.left {
  transform: translateY(78px) rotate(20deg);
}
.is-angry .lid.right {
  transform: translateY(78px) rotate(-20deg);
}
.is-angry .stop-top {
  stop-color: #ffe1e1;
}
.is-angry .stop-bottom {
  stop-color: #ff8f8f;
}
.is-angry .glint {
  opacity: 0.4;
}

/* sad: lids slanting up toward the centre, eyes lowered and dimmed */
.is-sad .eye {
  transform: translateY(18px);
  opacity: 0.78;
}
.is-sad .lid.left {
  transform: translateY(70px) rotate(-18deg);
}
.is-sad .lid.right {
  transform: translateY(70px) rotate(18deg);
}

/* thinking: smaller eyes looking up and drifting slowly */
.is-thinking .eye {
  animation: ponder 2.8s ease-in-out infinite alternate;
}

@keyframes ponder {
  from {
    transform: translate(-22px, -30px) scale(0.92);
  }
  to {
    transform: translate(26px, -34px) scale(0.92);
  }
}

/* dragging: squeezed eyes */
.is-dragging .open {
  transform: scaleY(0.62);
}

@media (prefers-reduced-motion: reduce) {
  .is-thinking .eye {
    animation: none;
    transform: translate(0, -30px) scale(0.92);
  }
}
</style>
