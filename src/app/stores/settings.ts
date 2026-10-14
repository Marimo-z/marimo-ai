import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ConnectionTestResult, SecretStatus } from '../../../shared/ipc'
import type { AppSettings, SettingsSection } from '../../../shared/settings'
import { plainClone } from '../../utils/plain-clone'
import { settingsBridge as bridge } from '../settings/bridge'

/** Mirror of the settings owned by the main process; the main process stays the source of truth. */
export const useSettingsStore = defineStore('settings', () => {
  const current = ref<AppSettings | null>(null)
  const keyStatus = ref<SecretStatus>({ hasKey: false, encryptionAvailable: true })
  /** Result of the last connection test in this session. */
  const lastTest = ref<ConnectionTestResult | null>(null)

  const settings = computed(() => {
    if (!current.value) throw new Error('Settings are not loaded yet')
    return current.value
  })

  async function load(): Promise<void> {
    const [loaded, status] = await Promise.all([bridge.get(), bridge.getAIKeyStatus()])
    current.value = loaded
    keyStatus.value = status
    bridge.onChanged((next) => (current.value = next))
  }

  async function update<K extends SettingsSection>(
    section: K,
    patch: Partial<AppSettings[K]>
  ): Promise<boolean> {
    const result = await bridge.update(section, plainClone(patch))
    if (!result.ok) {
      ElMessage.error(`保存失败：${result.error}`)
      return false
    }
    current.value = result.data
    return true
  }

  async function reset(section?: SettingsSection): Promise<void> {
    current.value = await bridge.reset(section)
  }

  async function setAIKey(key: string): Promise<boolean> {
    const result = await bridge.setAIKey(key)
    if (!result.ok) {
      ElMessage.error(result.error)
      return false
    }
    keyStatus.value = result.data
    lastTest.value = null
    return true
  }

  async function deleteAIKey(): Promise<void> {
    keyStatus.value = await bridge.deleteAIKey()
    lastTest.value = null
  }

  return {
    loaded: computed(() => current.value !== null),
    settings,
    keyStatus,
    lastTest,
    load,
    update,
    reset,
    setAIKey,
    deleteAIKey
  }
})
