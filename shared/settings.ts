import { DEFAULT_PET_SETTINGS, type PetSettings } from './pet'
import {
  ASR_SERVICE_PRESETS,
  KOKORO_DEFAULT_SPEAKER,
  TTS_SERVICE_PRESETS,
  type ASRProviderId,
  type ModelSource,
  type TTSProviderId
} from './voice'

export interface AIProviderPreset {
  id: string
  name: string
  baseUrl: string
  model: string
  /** Local services (e.g. Ollama) usually work without an API key. */
  keyOptional?: boolean
}

/** OpenAI-compatible endpoints. Model defaults are only suggestions and can be edited. */
export const AI_PROVIDER_PRESETS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash'
  },
  {
    id: 'qwen',
    name: '通义千问（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus'
  },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '' },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: '',
    keyOptional: true
  },
  { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
  { id: 'mock', name: '模拟（离线测试）', baseUrl: '', model: 'mock', keyOptional: true }
] as const satisfies readonly AIProviderPreset[]

/** Offline provider with canned replies; needs no URL, model or key. */
export const MOCK_PROVIDER_ID = 'mock'

export type AIProviderId = (typeof AI_PROVIDER_PRESETS)[number]['id']
export const AI_PROVIDER_IDS = AI_PROVIDER_PRESETS.map((p) => p.id) as [
  AIProviderId,
  ...AIProviderId[]
]

export function findProviderPreset(id: string): AIProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((p) => p.id === id)
}

/** One configured model service. Its API key is stored separately, keyed by `id`. */
export interface AIProfile {
  id: string
  name: string
  providerId: AIProviderId
  baseUrl: string
  model: string
  timeoutMs: number
  temperature: number
  maxTokens: number
}

export interface AISettings {
  /** The profile used for chat; null means AI is turned off. */
  activeProfileId: string | null
  profiles: AIProfile[]
}

export const AI_PROFILES_MAX = 20
export const AI_PROFILE_NAME_MAX = 30
export const AI_PROFILE_ID_PATTERN = /^[a-z0-9-]{1,40}$/

/** Profile id given to settings migrated from the single-profile format. */
export const LEGACY_AI_PROFILE_ID = 'default'

export const DEFAULT_AI_PROFILE_FIELDS = {
  timeoutMs: 30000,
  temperature: 0.8,
  maxTokens: 512
} as const satisfies Partial<AIProfile>

export function createAIProfile(id: string, providerId: AIProviderId, name?: string): AIProfile {
  const preset = findProviderPreset(providerId)
  return {
    id,
    name: name ?? preset?.name ?? '未命名',
    providerId,
    baseUrl: preset?.baseUrl ?? '',
    model: preset?.model ?? '',
    ...DEFAULT_AI_PROFILE_FIELDS
  }
}

export function getActiveAIProfile(ai: AISettings): AIProfile | null {
  return ai.profiles.find((p) => p.id === ai.activeProfileId) ?? null
}

export const REPLY_LENGTHS = ['short', 'medium', 'long'] as const
export type ReplyLength = (typeof REPLY_LENGTHS)[number]

export interface PersonaSettings {
  name: string
  traits: string[]
  backstory: string
  speakingStyle: string
  catchphrase: string
  replyLength: ReplyLength
  proactive: boolean
  proactiveIntervalMin: number
  keepHistory: boolean
}

export interface VoiceSettings {
  ttsProvider: TTSProviderId
  /** Windows voice name; empty picks a Chinese voice automatically. */
  systemVoice: string
  ttsBaseUrl: string
  ttsModel: string
  ttsVoice: string
  rate: number
  volume: number
  /** Only the system voice supports pitch. */
  pitch: number
  /** Kokoro speaker id for the local voice. */
  localVoice: number
  /** Reads replies aloud; replies to voice input are always read. */
  autoSpeak: boolean
  /**
   * When false (the default), a microphone press does nothing while the pet is speaking.
   * When true, voice input stops the current line and starts recording.
   */
  interruptSpeech: boolean
  asrProvider: ASRProviderId
  asrBaseUrl: string
  asrModel: string
  /** Where local models are downloaded from. */
  modelSource: ModelSource
}

export const GAME_DIFFICULTIES = ['easy', 'normal', 'hard'] as const
export type GameDifficulty = (typeof GAME_DIFFICULTIES)[number]
export const DIALOGUE_FREQUENCIES = ['low', 'normal', 'high'] as const

export interface GameSettings {
  dialogueEnabled: boolean
  dialogueFrequency: (typeof DIALOGUE_FREQUENCIES)[number]
  /** 0 = gentle only, 3 = maximum teasing. */
  tauntLevel: number
  defaultDifficulty: GameDifficulty
}

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export interface AppearanceSettings {
  theme: ThemeMode
}

export interface AppSettings {
  pet: PetSettings
  ai: AISettings
  persona: PersonaSettings
  voice: VoiceSettings
  games: GameSettings
  appearance: AppearanceSettings
}

export type SettingsSection = keyof AppSettings
export const SETTINGS_SECTIONS = [
  'pet',
  'ai',
  'persona',
  'voice',
  'games',
  'appearance'
] as const satisfies readonly SettingsSection[]

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value)
}

export const DEFAULT_SETTINGS: AppSettings = {
  pet: DEFAULT_PET_SETTINGS,
  ai: {
    activeProfileId: LEGACY_AI_PROFILE_ID,
    profiles: [createAIProfile(LEGACY_AI_PROFILE_ID, 'deepseek')]
  },
  persona: {
    name: 'Marimo',
    traits: ['好奇', '温柔', '有点小傲娇'],
    backstory: '一颗住在桌面上的蓝色小机器人，喜欢看主人工作，也喜欢下棋。',
    speakingStyle: '口语化、简短，偶尔用语气词',
    catchphrase: '嘿嘿～',
    replyLength: 'short',
    proactive: false,
    proactiveIntervalMin: 30,
    keepHistory: true
  },
  voice: {
    ttsProvider: 'system',
    systemVoice: '',
    ttsBaseUrl: TTS_SERVICE_PRESETS[0].baseUrl,
    ttsModel: TTS_SERVICE_PRESETS[0].model,
    ttsVoice: TTS_SERVICE_PRESETS[0].voice,
    rate: 1.3,
    volume: 0.8,
    pitch: 1,
    localVoice: KOKORO_DEFAULT_SPEAKER,
    autoSpeak: false,
    interruptSpeech: false,
    asrProvider: 'local',
    asrBaseUrl: ASR_SERVICE_PRESETS[0].baseUrl,
    asrModel: ASR_SERVICE_PRESETS[0].model,
    modelSource: 'hf-mirror'
  },
  games: {
    dialogueEnabled: true,
    dialogueFrequency: 'normal',
    tauntLevel: 1,
    defaultDifficulty: 'normal'
  },
  appearance: {
    theme: 'system'
  }
}
