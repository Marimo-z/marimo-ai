<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { bubbleHoldMs, TYPEWRITER_MS_PER_CHAR } from '../../utils/bubble-timing'

const props = withDefaults(
  defineProps<{
    /** Changes for every new message, restarting the typewriter and hide timer. */
    messageId: number
    text: string
    baseDurationMs: number
    typewriter?: boolean
    /** Keeps the bubble up (e.g. while the line is being read aloud). */
    hold?: boolean
    /** False while more text may still arrive. */
    complete?: boolean
  }>(),
  { typewriter: true, hold: false, complete: true }
)

const emit = defineEmits<{
  close: []
  typing: [active: boolean]
}>()

const visibleText = ref('')
const expanded = ref(false)
const textEl = ref<HTMLElement | null>(null)

let typeTimer: ReturnType<typeof setInterval> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let hovering = false
let typingDone = false

function stopTimers(): void {
  if (typeTimer) clearInterval(typeTimer)
  if (hideTimer) clearTimeout(hideTimer)
  typeTimer = null
  hideTimer = null
}

function scheduleHide(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  if (!typingDone || hovering || expanded.value || props.hold) return
  hideTimer = setTimeout(() => emit('close'), bubbleHoldMs(props.text, props.baseDurationMs))
}

function finishTyping(): void {
  if (typeTimer) clearInterval(typeTimer)
  typeTimer = null
  visibleText.value = props.text
  typingDone = true
  emit('typing', false)
  scheduleHide()
}

let typed = 0

function pump(): void {
  if (typeTimer) return
  emit('typing', true)
  typingDone = false
  typeTimer = setInterval(() => {
    const chars = Array.from(props.text)
    if (typed < chars.length) {
      typed++
      visibleText.value = chars.slice(0, typed).join('')
    }
    if (typed >= chars.length && props.complete) finishTyping()
    else if (typed >= chars.length && typeTimer) {
      clearInterval(typeTimer)
      typeTimer = null
    }
  }, TYPEWRITER_MS_PER_CHAR)
}

function start(): void {
  stopTimers()
  expanded.value = false
  typingDone = false
  typed = 0
  visibleText.value = ''
  if (!props.typewriter) return finishTyping()
  pump()
}

function onClick(): void {
  if (!typingDone) return finishTyping()
  expanded.value = !expanded.value
  scheduleHide()
}

function onHover(active: boolean): void {
  hovering = active
  scheduleHide()
}

watch(() => props.messageId, start, { immediate: true })
watch(() => props.hold, scheduleHide)
watch(
  () => [props.text, props.complete] as const,
  () => {
    if (props.typewriter && !typingDone) pump()
  }
)

watch(visibleText, async () => {
  if (typingDone) return
  await nextTick()
  if (textEl.value) textEl.value.scrollTop = textEl.value.scrollHeight
})

onBeforeUnmount(stopTimers)
</script>

<template>
  <div
    class="bubble"
    :class="{ expanded }"
    data-interactive
    role="status"
    aria-live="polite"
    title="点击展开 / 收起"
    @click="onClick"
    @mouseenter="onHover(true)"
    @mouseleave="onHover(false)"
  >
    <p ref="textEl" class="bubble-text">{{ visibleText }}</p>
    <button class="bubble-close" type="button" aria-label="关闭" @click.stop="emit('close')">
      ×
    </button>
  </div>
</template>

<style scoped>
.bubble {
  position: relative;
  box-sizing: border-box;
  max-width: calc(248px * var(--pet-scale, 1));
  padding: calc(8px * var(--pet-scale, 1)) calc(26px * var(--pet-scale, 1))
    calc(8px * var(--pet-scale, 1)) calc(12px * var(--pet-scale, 1));
  border: 1px solid rgba(79, 104, 176, 0.18);
  border-radius: calc(14px * var(--pet-scale, 1));
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 4px 14px rgba(32, 44, 90, 0.16);
  color: #24304f;
  font-size: calc(13px * var(--pet-scale, 1));
  line-height: 1.5;
  cursor: pointer;
}

.bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: calc(-6px * var(--pet-scale, 1));
  width: calc(12px * var(--pet-scale, 1));
  height: calc(12px * var(--pet-scale, 1));
  border-right: 1px solid rgba(79, 104, 176, 0.18);
  border-bottom: 1px solid rgba(79, 104, 176, 0.18);
  background: inherit;
  transform: translateX(-50%) rotate(45deg);
}

.bubble-text {
  margin: 0;
  max-height: calc(84px * var(--pet-scale, 1));
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  scrollbar-width: thin;
  transition: max-height 200ms ease;
}

.expanded .bubble-text {
  max-height: calc(150px * var(--pet-scale, 1));
}

.bubble-close {
  position: absolute;
  top: calc(4px * var(--pet-scale, 1));
  right: calc(6px * var(--pet-scale, 1));
  width: calc(18px * var(--pet-scale, 1));
  height: calc(18px * var(--pet-scale, 1));
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #7a86a8;
  font-size: calc(14px * var(--pet-scale, 1));
  line-height: 1;
  cursor: pointer;
}

.bubble-close:hover {
  background: rgba(79, 104, 176, 0.12);
  color: #24304f;
}
</style>
