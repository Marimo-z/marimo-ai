<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PetEmotion } from '../../../shared/pet'
import { useBlink } from '../../composables/useBlink'
import { computeEyeOffset, DEFAULT_EYE_TRACKING, type Vec2 } from '../../utils/eye-tracking'
import { resolvePetAppearance } from '../../utils/pet-appearance'
import PetOrb from './PetOrb.vue'

/** In-page pet used by the control panel; eyes follow the mouse inside this window only. */
const props = withDefaults(defineProps<{ size?: number; idleAnimation?: boolean }>(), {
  size: 120,
  idleAnimation: true
})

const anchor = ref<HTMLElement | null>(null)
const emotion = ref<PetEmotion>('idle')
const pointerNear = ref(false)
const eyeOffset = ref<Vec2>({ x: 0, y: 0 })
const pressTick = ref(0)
let emotionTimer: ReturnType<typeof setTimeout> | undefined

const appearance = computed(() =>
  resolvePetAppearance({
    emotion: emotion.value,
    isDragging: false,
    isSpeaking: false,
    isPlaying: false,
    pointerNear: pointerNear.value,
    followCursor: true,
    idleAnimation: props.idleAnimation
  })
)
const blinking = useBlink(computed(() => appearance.value.expression !== 'happy'))
const shownOffset = computed(() =>
  appearance.value.trackCursor ? eyeOffset.value : { x: 0, y: 0 }
)

function onMove(event: MouseEvent): void {
  const el = anchor.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const result = computeEyeOffset(
    { x: event.clientX, y: event.clientY },
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    {
      ...DEFAULT_EYE_TRACKING,
      maxOffset: props.size / 23,
      orbRadius: rect.width / 2,
      nearRadius: 240
    }
  )
  eyeOffset.value = { x: Math.round(result.x * 4) / 4, y: Math.round(result.y * 4) / 4 }
  pointerNear.value = result.near
}

/** Plays an emotion briefly, e.g. when previewing reactions. */
function react(next: PetEmotion, durationMs = 1600): void {
  clearTimeout(emotionTimer)
  emotion.value = next
  emotionTimer = setTimeout(() => (emotion.value = 'idle'), durationMs)
}

function onClick(): void {
  pressTick.value++
  react('happy', 1200)
}

defineExpose({ react })

onMounted(() => window.addEventListener('mousemove', onMove, { passive: true }))
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove)
  clearTimeout(emotionTimer)
})
</script>

<template>
  <div ref="anchor" class="preview" :style="{ width: `${size}px`, height: `${size}px` }">
    <PetOrb
      :appearance="appearance"
      :eye-offset="shownOffset"
      :blinking="blinking"
      :press-tick="pressTick"
      :size="size"
      @click="onClick"
    />
  </div>
</template>

<style scoped>
.preview {
  flex: none;
}

.preview :deep(.orb-svg) {
  cursor: pointer;
}
</style>
