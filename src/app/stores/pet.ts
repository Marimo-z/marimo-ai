import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PetViewSettings } from '../../../shared/ipc'
import { DEFAULT_PET_SETTINGS, type PetEmotion } from '../../../shared/pet'
import { resolvePetAppearance } from '../../utils/pet-appearance'

export interface Dialogue {
  id: number
  text: string
}

const DEFAULT_EMOTION_MS = 2500

export const usePetStore = defineStore('pet', () => {
  const settings = ref<PetViewSettings>({
    ...DEFAULT_PET_SETTINGS,
    petName: 'Marimo',
    autoSpeak: false,
    interruptSpeech: false
  })
  const emotion = ref<PetEmotion>('idle')
  const isDragging = ref(false)
  const isSpeaking = ref(false)
  /** Voice playback; the bubble stays up while it runs. */
  const voicePlaying = ref(false)
  const isPlaying = ref(false)
  const currentGame = ref<string | null>(null)
  const pointerNear = ref(false)
  const dialogue = ref<Dialogue | null>(null)

  let emotionTimer: ReturnType<typeof setTimeout> | null = null
  let dialogueSeq = 0

  const appearance = computed(() =>
    resolvePetAppearance({
      emotion: emotion.value,
      isDragging: isDragging.value,
      isSpeaking: isSpeaking.value || voicePlaying.value,
      isPlaying: isPlaying.value,
      pointerNear: pointerNear.value,
      followCursor: settings.value.followCursor,
      idleAnimation: settings.value.idleAnimation
    })
  )

  function applySettings(next: PetViewSettings): void {
    settings.value = { ...next }
    if (!next.followCursor) pointerNear.value = false
  }

  /** Sets a temporary emotion that falls back to `idle`; pass 0 to keep it until changed. */
  function setEmotion(next: PetEmotion, durationMs = DEFAULT_EMOTION_MS): void {
    if (emotionTimer) clearTimeout(emotionTimer)
    emotionTimer = null
    emotion.value = next
    if (next !== 'idle' && durationMs > 0) {
      emotionTimer = setTimeout(() => {
        emotion.value = 'idle'
        emotionTimer = null
      }, durationMs)
    }
  }

  function say(text: string, withEmotion?: PetEmotion): void {
    dialogue.value = { id: ++dialogueSeq, text }
    if (withEmotion) setEmotion(withEmotion, Math.max(DEFAULT_EMOTION_MS, text.length * 80))
  }

  function dismissDialogue(): void {
    dialogue.value = null
    isSpeaking.value = false
  }

  return {
    settings,
    emotion,
    isDragging,
    isSpeaking,
    voicePlaying,
    isPlaying,
    currentGame,
    pointerNear,
    dialogue,
    appearance,
    applySettings,
    setEmotion,
    say,
    dismissDialogue
  }
})
