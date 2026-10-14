import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Result } from '../../../shared/ipc'
import type { VoiceKeyKind, VoiceKeyStatus, VoiceState } from '../../../shared/voice'
import { voiceBridge as bridge } from '../settings/bridge'

/** Mirror of the playback state owned by the main process, plus voice key status. */
export const useVoiceStore = defineStore('voice', () => {
  const state = ref<VoiceState>({ status: 'idle', lastError: null })
  const keyStatus = ref<VoiceKeyStatus>({ tts: false, asr: false, encryptionAvailable: true })
  let loaded = false

  const active = computed(() => state.value.status !== 'idle')

  async function load(): Promise<void> {
    if (loaded) return
    loaded = true
    bridge.onChanged((next) => (state.value = next))
    const [current, keys] = await Promise.all([bridge.getState(), bridge.getKeyStatus()])
    state.value = current
    keyStatus.value = keys
  }

  function stop(): Promise<void> {
    return bridge.stop()
  }

  function testSpeak(text: string): Promise<Result<null>> {
    return bridge.testSpeak(text)
  }

  async function setKey(kind: VoiceKeyKind, key: string): Promise<Result<VoiceKeyStatus>> {
    const result = await bridge.setKey(kind, key)
    if (result.ok) keyStatus.value = result.data
    return result
  }

  async function deleteKey(kind: VoiceKeyKind): Promise<void> {
    keyStatus.value = await bridge.deleteKey(kind)
  }

  return { state, keyStatus, active, load, stop, testSpeak, setKey, deleteKey }
})
