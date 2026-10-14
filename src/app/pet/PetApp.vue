<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PetCommand } from '../../../shared/ipc'
import { isPetEmotion, PET_ORB_BASE_SIZE } from '../../../shared/pet'
import type { PetVoice } from '../../../shared/voice'
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
import { SpeechPlayer } from './speech-player'

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

const player = new SpeechPlayer()

function stopVoice(): void {
  player.stop()
}

function playVoice(voice: PetVoice, text: string): void {
  store.voicePlaying = true
  void player.play(voice, text, (outcome, message) => {
    store.voicePlaying = false
    petBridge.reportSpeech(voice.id, outcome, message)
  })
}

let lastLine: MockLine | undefined
function speak(line: MockLine): void {
  // Local lines must not replace a reply that is still being read aloud.
  if (store.voicePlaying) return
  lastLine = line
  store.say(line.text, line.emotion)
}

function closeBubble(): void {
  stopVoice()
  store.dismissDialogue()
}

const gestures = usePetGestures(petBridge, {
  onPress: () => pressTick.value++,
  onTap: () => {
    if (store.isPlaying) return
    speak(pickLine(TAP_LINES, lastLine))
  },
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
    const duration = command.durationMs
    store.setEmotion(
      command.emotion,
      typeof duration === 'number' && duration >= 0 ? Math.min(duration, 60_000) : 4000
    )
  } else if (command?.type === 'say') {
    if (typeof command.text === 'string' && command.text.trim()) {
      stopVoice()
      store.say(command.text, isPetEmotion(command.emotion) ? command.emotion : undefined)
      if (command.voice) playVoice(command.voice, command.text)
    } else {
      speak(pickLine(RANDOM_LINES, lastLine))
    }
  } else if (command?.type === 'stop-speech') {
    stopVoice()
  } else if (command?.type === 'play') {
    store.isPlaying = command.playing === true
    store.currentGame = command.playing ? (command.game ?? null) : null
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
  stopVoice()
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
          :hold="store.voicePlaying"
          @typing="(active) => (store.isSpeaking = active)"
          @close="closeBubble"
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
