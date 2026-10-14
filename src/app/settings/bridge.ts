import type { ChatMessage, ChatState } from '../../../shared/chat'
import type {
  AIKeyStatus,
  ChatBridge,
  ConnectionTestResult,
  SettingsBridge,
  VoiceBridge
} from '../../../shared/ipc'
import { DEFAULT_SETTINGS, type AppSettings } from '../../../shared/settings'
import { LOCAL_MODEL_IDS, type VoiceKeyStatus } from '../../../shared/voice'

/**
 * In-memory stand-in used only when the page is opened in a normal browser during development
 * (no Electron preload). Nothing is validated or persisted.
 */
function createBrowserPreviewBridge(): SettingsBridge {
  let settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  let keyStatus: AIKeyStatus = { profileIds: [], encryptionAvailable: true }
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
    async setAIKey(profileId) {
      keyStatus = { ...keyStatus, profileIds: [...new Set([...keyStatus.profileIds, profileId])] }
      return { ok: true, data: keyStatus }
    },
    async deleteAIKey(profileId) {
      keyStatus = {
        ...keyStatus,
        profileIds: keyStatus.profileIds.filter((id) => id !== profileId)
      }
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

function createBrowserPreviewChatBridge(): ChatBridge {
  let state: ChatState = { messages: [], busy: false }
  const listeners = new Set<(s: ChatState) => void>()
  const set = (next: ChatState): void => {
    state = next
    listeners.forEach((l) => l(structuredClone(state)))
  }
  let seq = 0
  const message = (role: ChatMessage['role'], text: string): ChatMessage => ({
    id: `preview-${++seq}`,
    role,
    text,
    at: Date.now(),
    ...(role === 'assistant' ? { emotion: 'happy' as const } : {})
  })

  return {
    getState: async () => structuredClone(state),
    async send(text) {
      set({ messages: [...state.messages, message('user', text)], busy: true })
      await new Promise((r) => setTimeout(r, 600))
      const reply = message('assistant', `（浏览器预览）收到：${text}`)
      set({ messages: [...state.messages, reply], busy: false })
      return { ok: true, reply }
    },
    cancel: async () => {},
    clear: async () => set({ messages: [], busy: false }),
    onChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function createBrowserPreviewVoiceBridge(): VoiceBridge {
  let keys: VoiceKeyStatus = { tts: false, asr: false, encryptionAvailable: true }
  return {
    getState: async () => ({ status: 'idle', lastError: null }),
    onChanged: () => () => {},
    testSpeak: async (text) => {
      console.info('[preview] pet speaks:', text)
      return { ok: true, data: null }
    },
    stop: async () => {},
    transcribe: async () => ({ ok: true, data: '（浏览器预览）模拟识别结果' }),
    getKeyStatus: async () => keys,
    async setKey(kind) {
      keys = { ...keys, [kind]: true }
      return { ok: true, data: keys }
    },
    async deleteKey(kind) {
      keys = { ...keys, [kind]: false }
      return keys
    },
    getModels: async () =>
      LOCAL_MODEL_IDS.map((id) => ({
        id,
        state: 'missing',
        receivedBytes: 0,
        totalBytes: 0,
        error: null
      })),
    onModelsChanged: () => () => {},
    downloadModel: async () => {},
    cancelDownload: async () => {},
    importModel: async () => ({ ok: false, error: '浏览器预览中无法导入模型' }),
    deleteModel: async () => ({ ok: true, data: null })
  }
}

function resolveVoiceBridge(): VoiceBridge {
  if (window.marimo?.voice) return window.marimo.voice
  if (import.meta.env.DEV) return createBrowserPreviewVoiceBridge()
  throw new Error('Marimo preload bridge is unavailable')
}

function resolveBridge(): SettingsBridge {
  if (window.marimo?.settings) return window.marimo.settings
  if (import.meta.env.DEV) return createBrowserPreviewBridge()
  throw new Error('Marimo preload bridge is unavailable')
}

function resolveChatBridge(): ChatBridge {
  if (window.marimo?.chat) return window.marimo.chat
  if (import.meta.env.DEV) return createBrowserPreviewChatBridge()
  throw new Error('Marimo preload bridge is unavailable')
}

export const settingsBridge = resolveBridge()
export const chatBridge = resolveChatBridge()
export const voiceBridge = resolveVoiceBridge()
