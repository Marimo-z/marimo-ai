<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PetCommand } from '../../../shared/ipc'
import { isPetEmotion, PET_ORB_BASE_SIZE } from '../../../shared/pet'
import PetBubble from '../../components/pet/PetBubble.vue'
import PetOrb from '../../components/pet/PetOrb.vue'
import { useBlink } from '../../composables/useBlink'
import { useCursorTracking } from '../../composables/useCursorTracking'
import { useInteractiveRegions } from '../../composables/useInteractiveRegions'
import { usePetGestures } from '../../composables/usePetGestures'
import {
  greeting,
  pickLine,
  RANDOM_LINES,
  TAP_LINES,
  type MockLine
} from '../../services/mock-dialogue'
import { usePetStore } from '../stores/pet'
import { petBridge } from './bridge'

const store = usePetStore()
const { settings, appearance, dialogue } = storeToRefs(store)

const orbAnchor = ref<HTMLElement | null>(null)
const pressTick = ref(0)
const orbSize = computed(() => Math.round(PET_ORB_BASE_SIZE * settings.value.scale))

const eyeOffset = useCursorTracking(petBridge, orbAnchor)
const blinking = useBlink(
  computed(() => ['idle', 'curious', 'angry'].includes(appearance.value.expression))
)
useInteractiveRegions(petBridge)

let lastLine: MockLine | undefined
function speak(line: MockLine): void {
  lastLine = line
  store.say(line.text, line.emotion)
}

const gestures = usePetGestures(petBridge, {
  onPress: () => pressTick.value++,
  onTap: () => speak(pickLine(TAP_LINES, lastLine)),
  onDoubleTap: () => {
    if (settings.value.doubleClickAction === 'panel') {
      store.setEmotion('happy', 1200)
      petBridge.openPanel()
    } else {
      speak(pickLine(TAP_LINES, lastLine))
    }
  },
  onDragChange: (dragging) => (store.isDragging = dragging)
})

function handleCommand(command: PetCommand): void {
  if (command?.type === 'emotion' && isPetEmotion(command.emotion)) {
    store.setEmotion(command.emotion, 4000)
  } else if (command?.type === 'say') {
    if (typeof command.text === 'string' && command.text.trim()) {
      store.say(command.text, isPetEmotion(command.emotion) ? command.emotion : undefined)
    } else {
      speak(pickLine(RANDOM_LINES, lastLine))
    }
  }
}

const unsubscribers = [
  petBridge.onSettings((next) => store.applySettings(next)),
  petBridge.onCommand(handleCommand)
]
let greetingTimer: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  store.applySettings(await petBridge.getSettings())
  if (!settings.value.doNotDisturb) {
    greetingTimer = setTimeout(() => speak(greeting(settings.value.petName)), 600)
  }
})

onBeforeUnmount(() => {
  clearTimeout(greetingTimer)
  unsubscribers.forEach((off) => off())
})
</script>

<template>
  <main
    class="pet-root"
    :class="{ 'is-click-through': settings.clickThrough }"
    :data-state="appearance.state"
    :style="{ '--pet-scale': settings.scale }"
  >
    <div class="bubble-area">
      <Transition name="bubble">
        <PetBubble
          v-if="dialogue && !settings.clickThrough"
          :message-id="dialogue.id"
          :text="dialogue.text"
          :base-duration-ms="settings.bubbleDurationMs"
          @typing="(active) => (store.isSpeaking = active)"
          @close="store.dismissDialogue()"
        />
      </Transition>
    </div>
    <div ref="orbAnchor" class="orb-anchor">
      <PetOrb
        :appearance="appearance"
        :eye-offset="eyeOffset"
        :blinking="blinking"
        :press-tick="pressTick"
        :size="orbSize"
        v-on="gestures"
      />
    </div>
  </main>
</template>

<style scoped>
.pet-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
  padding-bottom: calc(22px * var(--pet-scale));
  box-sizing: border-box;
  transition: opacity 200ms ease;
}

.pet-root.is-click-through {
  opacity: 0.55;
}

.bubble-area {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  min-height: 0;
  padding: 0 8px calc(10px * var(--pet-scale));
  box-sizing: border-box;
}

.orb-anchor {
  flex: none;
}

.bubble-enter-active,
.bubble-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
}
</style>
