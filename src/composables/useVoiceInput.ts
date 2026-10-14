import { onBeforeUnmount, ref, type Ref } from 'vue'
import { voiceBridge } from '../app/settings/bridge'
import { RecordingRecognizer } from '../services/speech-recognition'

export type VoiceInputPhase = 'idle' | 'recording' | 'transcribing'

export interface VoiceInput {
  phase: Ref<VoiceInputPhase>
  level: Ref<number>
  elapsedMs: Ref<number>
  error: Ref<string | null>
  start(): Promise<void>
  stop(): Promise<void>
  cancel(): void
}

/** Click-to-start / click-to-stop voice input. Recording never starts without a user action. */
export function useVoiceInput(onText: (text: string) => void): VoiceInput {
  const phase = ref<VoiceInputPhase>('idle')
  const level = ref(0)
  const elapsedMs = ref(0)
  const error = ref<string | null>(null)
  let clock: ReturnType<typeof setInterval> | null = null

  const recognizer = new RecordingRecognizer((wav) => voiceBridge.transcribe(wav), {
    onLevel: (value) => (level.value = value),
    onLimit: () => void stop()
  })
  recognizer.onFinalResult = (text) => {
    phase.value = 'idle'
    onText(text)
  }
  recognizer.onError = (failure) => {
    phase.value = 'idle'
    error.value = failure.message
  }

  function stopClock(): void {
    if (clock) clearInterval(clock)
    clock = null
    level.value = 0
  }

  async function start(): Promise<void> {
    if (phase.value !== 'idle') return
    error.value = null
    phase.value = 'recording'
    await recognizer.start()
    if (!recognizer.recording) {
      phase.value = 'idle'
      return
    }
    const startedAt = performance.now()
    elapsedMs.value = 0
    clock = setInterval(() => (elapsedMs.value = performance.now() - startedAt), 200)
  }

  async function stop(): Promise<void> {
    if (phase.value !== 'recording') return
    stopClock()
    phase.value = 'transcribing'
    await recognizer.stop()
    if (phase.value === 'transcribing') phase.value = 'idle'
  }

  function cancel(): void {
    stopClock()
    recognizer.cancel()
    phase.value = 'idle'
  }

  onBeforeUnmount(cancel)
  return { phase, level, elapsedMs, error, start, stop, cancel }
}
