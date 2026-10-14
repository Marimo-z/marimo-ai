import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Result } from '../../../shared/ipc'
import type {
  LocalModelId,
  LocalModelStatus,
  VoiceKeyKind,
  VoiceKeyStatus,
  VoiceState
} from '../../../shared/voice'
import { voiceBridge as bridge } from '../settings/bridge'

/** Mirror of the playback state owned by the main process, plus voice keys and local models. */
export const useVoiceStore = defineStore('voice', () => {
  const state = ref<VoiceState>({ status: 'idle', lastError: null })
  const keyStatus = ref<VoiceKeyStatus>({ tts: false, asr: false, encryptionAvailable: true })
  const models = ref<LocalModelStatus[]>([])
  let loaded = false

  const active = computed(() => state.value.status !== 'idle')

  function model(id: LocalModelId): LocalModelStatus | undefined {
    return models.value.find((m) => m.id === id)
  }

  async function load(): Promise<void> {
    if (loaded) return
    loaded = true
    bridge.onChanged((next) => (state.value = next))
    bridge.onModelsChanged((next) => (models.value = next))
    const [current, keys, statuses] = await Promise.all([
      bridge.getState(),
      bridge.getKeyStatus(),
      bridge.getModels()
    ])
    state.value = current
    keyStatus.value = keys
    models.value = statuses
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

  async function refreshModels(): Promise<void> {
    models.value = await bridge.getModels()
  }

  async function importModel(id: LocalModelId): Promise<Result<null> | null> {
    const result = await bridge.importModel(id)
    await refreshModels()
    return result
  }

  async function deleteModel(id: LocalModelId): Promise<Result<null>> {
    const result = await bridge.deleteModel(id)
    await refreshModels()
    return result
  }

  return {
    state,
    keyStatus,
    models,
    active,
    model,
    load,
    stop,
    testSpeak,
    setKey,
    deleteKey,
    downloadModel: (id: LocalModelId) => bridge.downloadModel(id),
    cancelDownload: (id: LocalModelId) => bridge.cancelDownload(id),
    importModel,
    deleteModel
  }
})
