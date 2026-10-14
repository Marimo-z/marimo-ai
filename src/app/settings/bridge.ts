import type { ConnectionTestResult, SecretStatus, SettingsBridge } from '../../../shared/ipc'
import { DEFAULT_SETTINGS, type AppSettings } from '../../../shared/settings'

/**
 * In-memory stand-in used only when the page is opened in a normal browser during development
 * (no Electron preload). Nothing is validated or persisted.
 */
function createBrowserPreviewBridge(): SettingsBridge {
  let settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  let keyStatus: SecretStatus = { hasKey: false, encryptionAvailable: true }
  const listeners = new Set<(s: AppSettings) => void>()
  const emit = (): void => listeners.forEach((l) => l(structuredClone(settings)))

  return {
    get: async () => structuredClone(settings),
    async update(section, patch) {
      settings = { ...settings, [section]: { ...settings[section], ...patch } }
      emit()
      return { ok: true, data: structuredClone(settings) }
    },
    async reset(section) {
      settings = section
        ? { ...settings, [section]: structuredClone(DEFAULT_SETTINGS[section]) }
        : structuredClone(DEFAULT_SETTINGS)
      emit()
      return structuredClone(settings)
    },
    onChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onNavigate: () => () => {},
    getAIKeyStatus: async () => keyStatus,
    async setAIKey() {
      keyStatus = { ...keyStatus, hasKey: true }
      return { ok: true, data: keyStatus }
    },
    async deleteAIKey() {
      keyStatus = { ...keyStatus, hasKey: false }
      return keyStatus
    },
    testAIConnection: async (): Promise<ConnectionTestResult> => ({
      ok: false,
      kind: 'network',
      message: '浏览器预览模式无法测试连接'
    }),
    resetPetPosition: async () => {},
    previewSay: async (text) => console.info('[preview] pet says:', text),
    getAppInfo: async () => ({
      version: 'preview',
      electron: '-',
      chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '-',
      node: '-',
      platform: navigator.platform,
      packaged: false
    })
  }
}

function resolveBridge(): SettingsBridge {
  if (window.marimo?.settings) return window.marimo.settings
  if (import.meta.env.DEV) return createBrowserPreviewBridge()
  throw new Error('Marimo preload bridge is unavailable')
}

export const settingsBridge = resolveBridge()
