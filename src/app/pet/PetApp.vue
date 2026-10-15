<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChatErrorKind } from '../../../shared/chat'
import type { PetCommand } from '../../../shared/ipc'
import { isPetEmotion, PET_CHAT_DOCK_HEIGHT, PET_ORB_BASE_SIZE } from '../../../shared/pet'
import type { PetVoice, VoiceStatus } from '../../../shared/voice'
import {
  CONTINUOUS_SPEECH_LEVEL,
  gateVoiceInput,
  nextUtteranceClock,
  type UtteranceClock
} from '../../../shared/voice-input'
import PetBubble from '../../components/pet/PetBubble.vue'
import PetChatDock from '../../components/pet/PetChatDock.vue'
import PetFigure from '../../components/pet/PetFigure.vue'
import PetRadialMenu from '../../components/pet/PetRadialMenu.vue'
import { useBlink } from '../../composables/useBlink'
import { useCursorTracking } from '../../composables/useCursorTracking'
import { useInteractiveRegions } from '../../composables/useInteractiveRegions'
import { usePetGestures } from '../../composables/usePetGestures'
import { useVoiceInput } from '../../composables/useVoiceInput'
import {
  greeting,
  pickLine,
  RANDOM_LINES,
  TAP_LINES,
  type MockLine
} from '../../services/mock-dialogue'
import { voiceBridge } from '../settings/bridge'
import { useChatStore } from '../stores/chat'
import { usePetStore } from '../stores/pet'
import { petBridge } from './bridge'
import { SpeechPlayer } from './speech-player'

const store = usePetStore()
const chat = useChatStore()
const { settings, appearance, dialogue } = storeToRefs(store)
const { busy, lastError } = storeToRefs(chat)

const orbAnchor = ref<HTMLElement | null>(null)
const pressTick = ref(0)
const menuOpen = ref(false)
const menuRendered = ref(false)
const menuClosing = ref(false)
const dockOpen = ref(false)
const liveTalk = ref(false)
let menuTimer: ReturnType<typeof setTimeout> | undefined
let voicePoll: ReturnType<typeof setInterval> | undefined
let utterance: UtteranceClock = { speechMs: 0, silenceMs: 0 }
let holdForReply = false
let bargedIn = false
const voiceStatus = ref<VoiceStatus>('idle')
const orbSize = computed(() => Math.round(PET_ORB_BASE_SIZE * settings.value.scale))
const dockHeight = computed(() => Math.round(PET_CHAT_DOCK_HEIGHT * settings.value.scale))
const speaking = computed(
  () =>
    store.voicePlaying || voiceStatus.value === 'speaking' || voiceStatus.value === 'synthesizing'
)
const micBlocked = computed(() => speaking.value && !settings.value.interruptSpeech)

const eyeOffset = useCursorTracking(petBridge, orbAnchor)
const blinking = useBlink(
  computed(() => ['idle', 'curious', 'angry'].includes(appearance.value.expression))
)
useInteractiveRegions(petBridge)

const player = new SpeechPlayer()
const voiceInput = useVoiceInput((text) => {
  if (!liveTalk.value) {
    void chat.send(text, { fromVoice: true })
    return
  }
  holdForReply = true
  void chat.send(text, { fromVoice: true }).then((ok) => {
    if (!ok) {
      holdForReply = false
      void resumeListening()
    }
  })
})

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
    if (settings.value.doubleClickAction !== 'panel') {
      speak(pickLine(TAP_LINES, lastLine))
      return
    }
    if (menuOpen.value) closeMenu()
    else openMenu()
  },
  onDragChange: (dragging) => (store.isDragging = dragging)
})

function openMenu(): void {
  if (menuTimer) clearTimeout(menuTimer)
  menuClosing.value = false
  menuRendered.value = true
  menuOpen.value = true
}

function closeMenu(): void {
  menuOpen.value = false
  if (!menuRendered.value) return
  menuClosing.value = true
  menuTimer = setTimeout(() => {
    menuRendered.value = false
    menuClosing.value = false
  }, 190)
}

function stopVoicePoll(): void {
  if (voicePoll) clearInterval(voicePoll)
  voicePoll = undefined
  utterance = { speechMs: 0, silenceMs: 0 }
}

async function resumeListening(): Promise<void> {
  if (!liveTalk.value || holdForReply) return
  if (busy.value || voiceInput.phase.value !== 'idle') return
  if (speaking.value && !settings.value.interruptSpeech) return
  const decision = gateVoiceInput(settings.value.interruptSpeech, speaking.value)
  if (decision === 'blocked') return
  if (decision === 'barge-in') await voiceBridge.stop()
  await voiceInput.start()
  const phase = voiceInput.phase.value as 'idle' | 'recording' | 'transcribing'
  if (!liveTalk.value || phase !== 'recording') return
  stopVoicePoll()
  voicePoll = setInterval(() => {
    if (voiceInput.phase.value !== 'recording') return
    if (
      speaking.value &&
      settings.value.interruptSpeech &&
      !bargedIn &&
      voiceInput.level.value >= CONTINUOUS_SPEECH_LEVEL
    ) {
      bargedIn = true
      void voiceBridge.stop()
      voiceInput.cancel()
      stopVoicePoll()
      void resumeListening()
      return
    }
    const next = nextUtteranceClock(utterance, voiceInput.level.value, 100)
    utterance = next
    if (!next.send) return
    stopVoicePoll()
    void voiceInput.stop()
  }, 100)
}

async function toggleMic(): Promise<void> {
  if (liveTalk.value) {
    liveTalk.value = false
    holdForReply = false
    stopVoicePoll()
    voiceInput.cancel()
    return
  }
  if (voiceInput.phase.value !== 'idle') return
  const decision = gateVoiceInput(settings.value.interruptSpeech, speaking.value)
  if (decision === 'blocked') return
  liveTalk.value = true
  await resumeListening()
}

function toggleDock(): void {
  dockOpen.value = !dockOpen.value
}

function toggleSpeaker(): void {
  petBridge.setAutoSpeak(!settings.value.autoSpeak)
}

watch(dockOpen, (open) => {
  petBridge.setChatDock(open)
})

watch(
  () => voiceInput.phase.value,
  (phase, previous) => {
    if (!liveTalk.value || previous !== 'transcribing' || phase !== 'idle') return
    const kind = voiceInput.errorKind.value
    if (
      kind === 'permission' ||
      kind === 'no-device' ||
      kind === 'device-busy' ||
      kind === 'unsupported'
    ) {
      liveTalk.value = false
      stopVoicePoll()
      if (voiceInput.error.value) store.say(voiceInput.error.value)
      return
    }
    if (holdForReply) return
    void resumeListening()
  }
)

watch(speaking, (now, was) => {
  if (!now) bargedIn = false
  if (!liveTalk.value) return
  if (now && !settings.value.interruptSpeech && voiceInput.phase.value === 'recording') {
    stopVoicePoll()
    voiceInput.cancel()
  }
  if (was && !now) {
    holdForReply = false
    void resumeListening()
  }
})

watch(busy, (now) => {
  if (!liveTalk.value || now || speaking.value) return
  holdForReply = false
  void resumeListening()
})

const micActive = computed(() => liveTalk.value)
const NOT_RECORDED: ChatErrorKind[] = ['no-profile', 'missing-key', 'invalid-input', 'busy']

async function sendDock(text: string): Promise<boolean> {
  const ok = await chat.send(text)
  if (ok) return true
  const kind = chat.lastError?.kind
  return !(kind && NOT_RECORDED.includes(kind))
}

const dockHint = computed(() => {
  if (voiceInput.phase.value === 'recording' && liveTalk.value) return '正在听，停顿一下就会发送'
  if (voiceInput.phase.value === 'transcribing') return '正在识别…'
  return lastError.value?.message ?? ''
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
  petBridge.onCommand(handleCommand),
  voiceBridge.onChanged((next) => (voiceStatus.value = next.status))
]
let greetingTimer: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  store.applySettings(await petBridge.getSettings())
  voiceStatus.value = (await voiceBridge.getState()).status
  void chat.load()
  if (!settings.value.doNotDisturb) {
    greetingTimer = setTimeout(() => speak(greeting(settings.value.petName)), 600)
  }
})

onBeforeUnmount(() => {
  clearTimeout(greetingTimer)
  clearTimeout(menuTimer)
  liveTalk.value = false
  stopVoicePoll()
  voiceInput.cancel()
  stopVoice()
  if (dockOpen.value) petBridge.setChatDock(false)
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
    <button
      v-if="menuOpen"
      type="button"
      class="menu-dismiss"
      data-interactive
      aria-label="关闭菜单"
      @click="closeMenu"
    />
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
      <PetRadialMenu
        v-if="menuRendered"
        :closing="menuClosing"
        :orb-size="orbSize"
        :scale="settings.scale"
        :auto-speak="settings.autoSpeak"
        :mic-active="micActive"
        :mic-blocked="micBlocked"
        :dock-open="dockOpen"
        @chat="toggleDock"
        @mic="toggleMic"
        @speaker="toggleSpeaker"
        @panel="petBridge.openPanel()"
      />
      <PetFigure
        :skin="settings.skin === 'planet' ? 'planet' : 'orb'"
        :appearance="appearance"
        :eye-offset="eyeOffset"
        :blinking="blinking"
        :press-tick="pressTick"
        :size="orbSize"
        v-on="gestures"
      />
    </div>
    <div v-if="dockOpen" class="dock-slot" :style="{ height: `${dockHeight}px` }">
      <PetChatDock :busy="busy" :hint="dockHint" :on-send="sendDock" />
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

.menu-dismiss {
  position: fixed;
  inset: 0;
  z-index: 1;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: default;
}

.menu-dismiss:focus {
  outline: none;
}

.bubble-area {
  position: relative;
  z-index: 3;
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  min-height: 0;
  padding: 0 8px calc(10px * var(--pet-scale));
  box-sizing: border-box;
  pointer-events: none;
}

.bubble-area :deep(*) {
  pointer-events: none;
}

.bubble-area :deep(.bubble),
.bubble-area :deep(.bubble *) {
  pointer-events: auto;
}

.orb-anchor {
  position: relative;
  z-index: 4;
  flex: none;
  pointer-events: none;
}

.orb-anchor :deep(*) {
  pointer-events: none;
}

.orb-anchor :deep(.hit) {
  pointer-events: visiblePainted;
}

.orb-anchor :deep(.menu-btn),
.orb-anchor :deep(.menu-btn *) {
  pointer-events: auto;
}

.dock-slot {
  position: relative;
  z-index: 3;
  flex: none;
  width: 100%;
  box-sizing: border-box;
  padding: 0 8px 8px;
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
