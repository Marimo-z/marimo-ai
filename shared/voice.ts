export const TTS_PROVIDERS = ['system', 'openai-compatible', 'mock'] as const
export type TTSProviderId = (typeof TTS_PROVIDERS)[number]
export const ASR_PROVIDERS = ['openai-compatible', 'mock'] as const
export type ASRProviderId = (typeof ASR_PROVIDERS)[number]

export const TTS_PROVIDER_LABELS: Record<TTSProviderId, string> = {
  system: 'Windows 系统语音（免费）',
  'openai-compatible': '在线语音合成（OpenAI 兼容）',
  mock: '模拟（只显示气泡）'
}

export const ASR_PROVIDER_LABELS: Record<ASRProviderId, string> = {
  'openai-compatible': '在线语音识别（OpenAI 兼容）',
  mock: '模拟（返回固定文本）'
}

export interface TTSServicePreset {
  id: string
  name: string
  baseUrl: string
  model: string
  voice: string
}

export interface ASRServicePreset {
  id: string
  name: string
  baseUrl: string
  model: string
}

/** Starting points only; model and voice names follow each provider's documentation. */
export const TTS_SERVICE_PRESETS: readonly TTSServicePreset[] = [
  {
    id: 'siliconflow',
    name: '硅基流动 CosyVoice',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/CosyVoice2-0.5B',
    voice: 'FunAudioLLM/CosyVoice2-0.5B:anna'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy'
  }
]

export const ASR_SERVICE_PRESETS: readonly ASRServicePreset[] = [
  {
    id: 'siliconflow',
    name: '硅基流动 SenseVoice',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/SenseVoiceSmall'
  },
  {
    id: 'openai',
    name: 'OpenAI Whisper',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1'
  },
  {
    id: 'groq',
    name: 'Groq Whisper',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'whisper-large-v3-turbo'
  }
]

export const VOICE_KEY_KINDS = ['tts', 'asr'] as const
export type VoiceKeyKind = (typeof VOICE_KEY_KINDS)[number]

export function isVoiceKeyKind(value: unknown): value is VoiceKeyKind {
  return typeof value === 'string' && (VOICE_KEY_KINDS as readonly string[]).includes(value)
}

export interface VoiceKeyStatus {
  tts: boolean
  asr: boolean
  encryptionAvailable: boolean
}

export type VoiceStatus = 'idle' | 'synthesizing' | 'speaking'

export interface VoiceState {
  status: VoiceStatus
  /** Last synthesis or playback failure, cleared by the next successful start. */
  lastError: string | null
}

/** How the pet window should voice a line. `id` ties playback reports to the request. */
export type PetVoice =
  | { engine: 'system'; id: number; voiceName: string; rate: number; pitch: number; volume: number }
  | { engine: 'audio'; id: number; data: Uint8Array; mime: string; volume: number }

export type SpeechOutcome = 'ended' | 'error'

export const TTS_TEXT_MAX = 1000
export const RECORDING_MAX_MS = 60_000
export const RECORDING_MIN_MS = 400
export const ASR_SAMPLE_RATE = 16_000
/** 60 s of 16 kHz mono 16-bit PCM is about 1.9 MB. */
export const ASR_AUDIO_MAX_BYTES = 4 * 1024 * 1024
