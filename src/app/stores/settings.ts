import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AIKeyStatus, ConnectionTestResult } from '../../../shared/ipc'
import {
  createAIProfile,
  findProviderPreset,
  getActiveAIProfile,
  SETTINGS_SECTIONS,
  type AIProfile,
  type AIProviderId,
  type AppSettings,
  type SettingsSection
} from '../../../shared/settings'
import { plainClone } from '../../utils/plain-clone'
import { settingsBridge as bridge } from '../settings/bridge'

function newProfileId(): string {
  return crypto.randomUUID()
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!taken.includes(candidate)) return candidate
  }
}

/** Mirror of the settings owned by the main process; the main process stays the source of truth. */
export const useSettingsStore = defineStore('settings', () => {
  const current = ref<AppSettings | null>(null)
  const keyStatus = ref<AIKeyStatus>({ profileIds: [], encryptionAvailable: true })
  /** Last connection test per profile id in this session. */
  const lastTests = ref<Record<string, ConnectionTestResult>>({})

  const settings = computed(() => {
    if (!current.value) throw new Error('Settings are not loaded yet')
    return current.value
  })

  const activeAIProfile = computed(() =>
    current.value ? getActiveAIProfile(current.value.ai) : null
  )

  function hasKey(profileId: string): boolean {
    return keyStatus.value.profileIds.includes(profileId)
  }

  /** Whether the profile can be used: it has a key, or its provider does not need one. */
  function isAIProfileReady(profile: AIProfile): boolean {
    return hasKey(profile.id) || findProviderPreset(profile.providerId)?.keyOptional === true
  }

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
    if (section === 'ai') keyStatus.value = await bridge.getAIKeyStatus()
    return true
  }

  async function reset(section?: SettingsSection): Promise<void> {
    current.value = await bridge.reset(section)
  }

  /** Restores every section except the AI profile list, which holds the user's keys. */
  async function resetAllExceptAI(): Promise<void> {
    for (const section of SETTINGS_SECTIONS) {
      if (section !== 'ai') current.value = await bridge.reset(section)
    }
  }

  async function addAIProfile(providerId: AIProviderId): Promise<AIProfile | null> {
    const { ai } = settings.value
    const base = findProviderPreset(providerId)?.name ?? '未命名'
    const profile = createAIProfile(
      newProfileId(),
      providerId,
      uniqueName(
        base,
        ai.profiles.map((p) => p.name)
      )
    )
    const ok = await update('ai', {
      profiles: [...ai.profiles, profile],
      activeProfileId: ai.activeProfileId ?? profile.id
    })
    return ok ? profile : null
  }

  async function duplicateAIProfile(id: string): Promise<AIProfile | null> {
    const { ai } = settings.value
    const source = ai.profiles.find((p) => p.id === id)
    if (!source) return null
    const copy: AIProfile = {
      ...plainClone(source),
      id: newProfileId(),
      name: uniqueName(
        `${source.name} 副本`,
        ai.profiles.map((p) => p.name)
      )
    }
    const index = ai.profiles.indexOf(source)
    const profiles = [...ai.profiles]
    profiles.splice(index + 1, 0, copy)
    return (await update('ai', { profiles })) ? copy : null
  }

  async function saveAIProfile(profile: AIProfile): Promise<boolean> {
    const { ai } = settings.value
    return update('ai', {
      profiles: ai.profiles.map((p) => (p.id === profile.id ? profile : p))
    })
  }

  /** Deleting a profile also deletes its key (done by the main process). */
  async function removeAIProfile(id: string): Promise<boolean> {
    const { ai } = settings.value
    const ok = await update('ai', {
      profiles: ai.profiles.filter((p) => p.id !== id),
      activeProfileId: ai.activeProfileId === id ? null : ai.activeProfileId
    })
    if (ok) delete lastTests.value[id]
    return ok
  }

  function activateAIProfile(id: string | null): Promise<boolean> {
    return update('ai', { activeProfileId: id })
  }

  async function setAIKey(profileId: string, key: string): Promise<boolean> {
    const result = await bridge.setAIKey(profileId, key)
    if (!result.ok) {
      ElMessage.error(result.error)
      return false
    }
    keyStatus.value = result.data
    delete lastTests.value[profileId]
    return true
  }

  async function deleteAIKey(profileId: string): Promise<void> {
    keyStatus.value = await bridge.deleteAIKey(profileId)
    delete lastTests.value[profileId]
  }

  return {
    loaded: computed(() => current.value !== null),
    settings,
    keyStatus,
    lastTests,
    activeAIProfile,
    hasKey,
    isAIProfileReady,
    load,
    update,
    reset,
    resetAllExceptAI,
    addAIProfile,
    duplicateAIProfile,
    saveAIProfile,
    removeAIProfile,
    activateAIProfile,
    setAIKey,
    deleteAIKey
  }
})
