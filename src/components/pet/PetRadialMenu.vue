<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  orbSize: number
  scale: number
  autoSpeak: boolean
  micActive: boolean
  micBlocked: boolean
  dockOpen: boolean
  monitorOn: boolean
  /** Plays the close animation; the parent unmounts the menu when it finishes. */
  closing?: boolean
}>()

const emit = defineEmits<{
  chat: []
  mic: []
  speaker: []
  monitor: []
  panel: []
  /** Pointer moved on the menu; the parent keeps it open a little longer. */
  active: []
}>()

/** Degrees from the orb center: 0 is right, 90 is up. Kept above the orb so the dock can sit below. */
const ITEMS = [
  { id: 'chat', angle: 168 },
  { id: 'mic', angle: 129 },
  { id: 'speaker', angle: 90 },
  { id: 'monitor', angle: 51 },
  { id: 'panel', angle: 12 }
] as const

type ItemId = (typeof ITEMS)[number]['id']

const micLabel = computed(() => {
  if (props.micActive) return '结束语音对话'
  if (props.micBlocked) return '正在朗读，未开启打断语音'
  return '开始语音对话'
})

function label(id: ItemId): string {
  if (id === 'chat') return '打开对话框'
  if (id === 'mic') return micLabel.value
  if (id === 'speaker') return props.autoSpeak ? '语音播报已开启' : '语音播报已关闭'
  if (id === 'monitor') return props.monitorOn ? '关闭电脑监测' : '打开电脑监测'
  return '打开控制面板'
}

function pressed(id: ItemId): boolean | undefined {
  if (id === 'chat') return props.dockOpen
  if (id === 'mic') return props.micActive
  if (id === 'speaker') return props.autoSpeak
  if (id === 'monitor') return props.monitorOn
  return undefined
}

function lit(id: ItemId): boolean {
  return pressed(id) === true
}

function choose(id: ItemId): void {
  if (id === 'chat') emit('chat')
  else if (id === 'mic') emit('mic')
  else if (id === 'speaker') emit('speaker')
  else if (id === 'monitor') emit('monitor')
  else emit('panel')
}

/** Clearance between the pet's edge and a menu button, in unscaled px. */
const MENU_GAP = 50
const radius = computed(() => props.orbSize / 2 + MENU_GAP * props.scale)

function place(angle: number, index: number): Record<string, string> {
  const rad = (angle * Math.PI) / 180
  const x = Math.cos(rad) * radius.value
  const y = -Math.sin(rad) * radius.value
  return {
    '--x': `${x.toFixed(1)}px`,
    '--y': `${y.toFixed(1)}px`,
    animationDelay: `${index * 45}ms`
  }
}
</script>

<template>
  <div class="ring" :class="{ 'is-closing': closing }" @pointermove="emit('active')">
    <button
      v-for="(item, index) in ITEMS"
      :key="item.id"
      type="button"
      class="menu-btn"
      data-interactive
      :class="{
        'is-on': lit(item.id),
        'is-blocked': item.id === 'mic' && micBlocked && !micActive
      }"
      :style="place(item.angle, index)"
      :aria-pressed="pressed(item.id)"
      :aria-label="label(item.id)"
      :title="label(item.id)"
      @click="choose(item.id)"
    >
      <svg v-if="item.id === 'chat'" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
        />
      </svg>
      <svg v-else-if="item.id === 'mic'" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM7 11a1 1 0 0 1 2 0 3 3 0 0 0 6 0 1 1 0 1 1 2 0 5 5 0 0 1-4 4.9V19h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-3.1A5 5 0 0 1 6 11a1 1 0 0 1 1 0z"
        />
      </svg>
      <svg v-else-if="item.id === 'speaker'" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 9h3.2L11 5.5v13L7.2 15H4V9z" />
        <path
          v-if="autoSpeak"
          fill="currentColor"
          d="M14 8.2a1 1 0 0 1 1.4-.2 5 5 0 0 1 0 8 1 1 0 1 1-1.2-1.6 3 3 0 0 0 0-4.8 1 1 0 0 1-.2-1.4z"
        />
        <path
          v-else
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          d="M15 9l6 6M21 9l-6 6"
        />
      </svg>
      <svg v-else-if="item.id === 'monitor'" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          d="M4 16a8 8 0 1 1 16 0"
        />
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          d="M12 16l5-6"
        />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="4"
          y="5"
          width="16"
          height="14"
          rx="2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <path stroke="currentColor" stroke-width="1.8" d="M4 9h16" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  z-index: 2;
}

.menu-btn {
  position: absolute;
  left: var(--x);
  top: var(--y);
  display: grid;
  place-items: center;
  width: calc(36px * var(--pet-scale, 1));
  height: calc(36px * var(--pet-scale, 1));
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.52);
  backdrop-filter: blur(14px) saturate(1.35);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    0 8px 18px rgba(32, 44, 90, 0.16);
  color: #4f68b0;
  cursor: pointer;
  transform: translate(-50%, -50%);
  animation: menu-in 340ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.ring.is-closing .menu-btn {
  animation: menu-out 180ms ease both;
}

@keyframes menu-in {
  from {
    opacity: 0;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%) scale(0.45);
  }
  to {
    opacity: 1;
    left: var(--x);
    top: var(--y);
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes menu-out {
  from {
    opacity: 1;
    left: var(--x);
    top: var(--y);
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%) scale(0.45);
  }
}

.menu-btn svg {
  width: calc(18px * var(--pet-scale, 1));
  height: calc(18px * var(--pet-scale, 1));
}

.menu-btn:hover {
  background: rgba(255, 255, 255, 0.78);
}

.menu-btn.is-on {
  background: #4f68b0;
  border-color: #c6a15a;
  color: #fff;
}

.menu-btn.is-on:hover {
  background: #3d569c;
}

.menu-btn.is-blocked {
  opacity: 0.45;
}

@media (prefers-reduced-motion: reduce) {
  .menu-btn,
  .ring.is-closing .menu-btn {
    animation: none;
  }
}
</style>
